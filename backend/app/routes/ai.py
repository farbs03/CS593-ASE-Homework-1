from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, delete, select

from .. import llm
from ..db import get_session
from ..models import ChatMessage, Paper, QuestionIn
from .papers import _get_paper

router = APIRouter(prefix="/api/papers", tags=["ai"])


class SummaryResponse(BaseModel):
    summary: str


def _paper_text(paper: Paper) -> str:
    """Full text when we have it; otherwise the abstract (flagged so the LLM knows)."""
    if paper.full_text:
        return paper.full_text
    if paper.abstract:
        return f"[Only the abstract is available for this paper.]\n\nAbstract: {paper.abstract}"
    raise HTTPException(400, "This paper has no text. Upload its PDF first.")


@router.post("/{paper_id}/summary", response_model=SummaryResponse)
async def summarize(paper_id: int, regenerate: bool = False, session: Session = Depends(get_session)):
    paper = _get_paper(session, paper_id)
    if paper.summary and not regenerate:
        return SummaryResponse(summary=paper.summary)
    try:
        paper.summary = await llm.summarize(paper.title, _paper_text(paper))
    except llm.LLMError as e:
        raise HTTPException(502, str(e))
    session.add(paper)
    session.commit()
    return SummaryResponse(summary=paper.summary)


@router.get("/{paper_id}/chat", response_model=list[ChatMessage])
def get_chat(paper_id: int, session: Session = Depends(get_session)):
    _get_paper(session, paper_id)
    return session.exec(
        select(ChatMessage).where(ChatMessage.paper_id == paper_id).order_by(ChatMessage.id)
    ).all()


@router.post("/{paper_id}/chat", response_model=list[ChatMessage])
async def ask(paper_id: int, body: QuestionIn, session: Session = Depends(get_session)):
    """Ask a question; returns the new [user, assistant] message pair."""
    paper = _get_paper(session, paper_id)
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Question is empty")
    history = [{"role": m.role, "content": m.content} for m in get_chat(paper_id, session)]
    try:
        reply = await llm.answer(paper.title, _paper_text(paper), history, question)
    except llm.LLMError as e:
        raise HTTPException(502, str(e))

    msgs = [
        ChatMessage(paper_id=paper_id, role="user", content=question),
        ChatMessage(paper_id=paper_id, role="assistant", content=reply),
    ]
    session.add_all(msgs)
    session.commit()
    for m in msgs:
        session.refresh(m)
    return msgs


@router.delete("/{paper_id}/chat", status_code=204)
def clear_chat(paper_id: int, session: Session = Depends(get_session)):
    session.exec(delete(ChatMessage).where(ChatMessage.paper_id == paper_id))
    session.commit()
