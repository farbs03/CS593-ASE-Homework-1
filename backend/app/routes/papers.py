import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, delete, select

from .. import llm, pdf
from ..config import UPLOAD_DIR
from ..db import get_session
from ..models import ChatMessage, Paper, PaperBase, PaperRead, to_read

router = APIRouter(prefix="/api/papers", tags=["papers"])
log = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def _get_paper(session: Session, paper_id: int) -> Paper:
    paper = session.get(Paper, paper_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper


def _store_pdf(paper: Paper, data: bytes) -> None:
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}.pdf"
    path.write_bytes(data)
    paper.pdf_path = path.name
    paper.full_text = pdf.extract_text(data)
    paper.text_status = "full" if paper.full_text else "abstract_only"


@router.get("", response_model=list[PaperRead])
def list_papers(session: Session = Depends(get_session)):
    papers = session.exec(select(Paper).order_by(Paper.created_at.desc())).all()
    return [to_read(p) for p in papers]


@router.get("/{paper_id}", response_model=PaperRead)
def get_paper(paper_id: int, session: Session = Depends(get_session)):
    return to_read(_get_paper(session, paper_id))


@router.post("", response_model=PaperRead, status_code=201)
async def save_paper(body: PaperBase, session: Session = Depends(get_session)):
    """Save a search result. Downloads its open-access PDF (if any) so the LLM sees full text."""
    if body.external_id:
        existing = session.exec(select(Paper).where(Paper.external_id == body.external_id)).first()
        if existing:
            return to_read(existing)

    paper = Paper(**body.model_dump())
    if paper.pdf_url:
        try:
            _store_pdf(paper, await pdf.download_pdf(paper.pdf_url))
        except Exception as e:  # paywalls, broken links: fall back to the abstract
            log.warning("PDF download failed for %s: %s", paper.pdf_url, e)
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return to_read(paper)


@router.post("/upload", response_model=PaperRead, status_code=201)
async def upload_paper(file: UploadFile, session: Session = Depends(get_session)):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "File is not a PDF")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "PDF is larger than 50 MB")

    try:
        meta = pdf.heuristic_metadata(data)
        first_pages = pdf.extract_text(data, max_pages=2)
    except pdf.PDFError as e:
        raise HTTPException(400, str(e))
    # The LLM is much better at this than layout heuristics; heuristics fill any gaps.
    try:
        llm_meta = await llm.extract_metadata(first_pages)
        meta = {k: llm_meta.get(k) or meta.get(k) for k in meta}
    except Exception as e:
        log.warning("LLM metadata extraction failed, using heuristics: %s", e)

    paper = Paper(
        source="upload",
        title=meta["title"] or Path(file.filename or "Untitled").stem,
        authors=meta["authors"] or [],
        year=meta["year"],
        abstract=meta["abstract"],
    )
    _store_pdf(paper, data)
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return to_read(paper)


@router.get("/{paper_id}/pdf")
def get_pdf(paper_id: int, session: Session = Depends(get_session)):
    paper = _get_paper(session, paper_id)
    if not paper.pdf_path:
        raise HTTPException(404, "No PDF stored for this paper")
    return FileResponse(UPLOAD_DIR / paper.pdf_path, media_type="application/pdf")


@router.delete("/{paper_id}", status_code=204)
def delete_paper(paper_id: int, session: Session = Depends(get_session)):
    paper = _get_paper(session, paper_id)
    session.exec(delete(ChatMessage).where(ChatMessage.paper_id == paper_id))
    if paper.pdf_path:
        (UPLOAD_DIR / paper.pdf_path).unlink(missing_ok=True)
    session.delete(paper)
    session.commit()
