from datetime import datetime, timezone

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PaperBase(SQLModel):
    """Normalized paper metadata, shared by search results and saved papers."""

    source: str  # "semantic_scholar" | "arxiv" | "upload"
    external_id: str | None = None
    title: str
    authors: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    year: int | None = None
    abstract: str | None = None
    url: str | None = None
    pdf_url: str | None = None


class Paper(PaperBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    external_id: str | None = Field(default=None, index=True, unique=True)
    pdf_path: str | None = None
    full_text: str | None = None
    text_status: str = "abstract_only"  # "full" | "abstract_only"
    summary: str | None = None
    created_at: datetime = Field(default_factory=_now)


class PaperRead(PaperBase):
    """What the API returns for a saved paper (no full text, it can be huge)."""

    id: int
    text_status: str
    summary: str | None
    has_pdf: bool
    created_at: datetime


class SearchResult(PaperBase):
    saved_id: int | None = None  # set when this result is already in the library


class ChatMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="paper.id", index=True)
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=_now)


class QuestionIn(SQLModel):
    question: str


def to_read(p: Paper) -> PaperRead:
    return PaperRead(
        **p.model_dump(exclude={"full_text", "pdf_path"}),
        has_pdf=p.pdf_path is not None,
    )
