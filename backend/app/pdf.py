"""PDF download, text extraction, and heuristic metadata extraction (PyMuPDF)."""

import re

import pymupdf
import httpx


class PDFError(Exception):
    pass


async def download_pdf(url: str) -> bytes:
    async with httpx.AsyncClient(
        timeout=60, follow_redirects=True, headers={"User-Agent": "research-assistant/1.0"}
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
    if not r.content.startswith(b"%PDF"):
        raise PDFError(f"URL did not return a PDF: {url}")
    return r.content


def extract_text(data: bytes, max_pages: int | None = None) -> str:
    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            n = doc.page_count if max_pages is None else min(max_pages, doc.page_count)
            text = "\n\n".join(doc[i].get_text() for i in range(n))
    except Exception as e:
        raise PDFError(f"Could not read PDF: {e}") from e
    return _clean(text)


YEAR_RE = re.compile(r"\b(19[89]\d|20[0-4]\d)\b")
ARXIV_ID_RE = re.compile(r"arXiv:([0-2]\d)(?:0[1-9]|1[0-2])\.\d{4,5}")
ABSTRACT_RE = re.compile(
    r"\babstract\b[\s.:—-]*(.+?)(?:\n\s*(?:\d+\.?|I\.?)?\s*(?:introduction|keywords|index terms)\b)",
    re.IGNORECASE | re.DOTALL,
)


def heuristic_metadata(data: bytes) -> dict:
    """Best-effort metadata without an LLM: embedded PDF metadata + first-page layout."""
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        meta = doc.metadata or {}
        title = (meta.get("title") or "").strip()
        if not title and doc.page_count:
            title = _largest_text(doc[0])
    first_text = extract_text(data, max_pages=2)

    authors = [a.strip() for a in re.split(r"[;,]| and ", meta.get("author") or "") if a.strip()]
    # An arXiv id (YYMM.NNNNN) dates the first version; otherwise take the earliest plausible
    # year near the top of the paper (later years tend to be revision stamps or citations).
    if m := ARXIV_ID_RE.search(first_text[:5000]):
        year = 2000 + int(m.group(1))
    else:
        years = [int(y) for y in YEAR_RE.findall(first_text[:1500])]
        m = YEAR_RE.search(meta.get("creationDate") or "")
        year = min(years) if years else int(m.group(1)) if m else None
    m = ABSTRACT_RE.search(first_text)
    abstract = re.sub(r"\s+", " ", m.group(1)).strip()[:3000] if m else None
    return {"title": title or None, "authors": authors, "year": year, "abstract": abstract}


def _largest_text(page: "pymupdf.Page") -> str:
    """The title is usually the biggest font on page 1."""
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            if tuple(line.get("dir", (1, 0))) != (1, 0):  # skip rotated text, e.g. the arXiv sidebar
                continue
            for span in line["spans"]:
                if span["text"].strip() and not span["text"].lstrip().startswith("arXiv:"):
                    spans.append((round(span["size"], 1), span["text"].strip()))
    if not spans:
        return ""
    biggest = max(size for size, _ in spans)
    return " ".join(t for size, t in spans if size == biggest)[:300]


def _clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"-\n(?=[a-z])", "", text)  # re-join hyphenated line breaks
    return re.sub(r"\n{3,}", "\n\n", text).strip()
