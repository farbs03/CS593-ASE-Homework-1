from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Paper, SearchResult
from ..search import SearchError, search_papers

router = APIRouter(prefix="/api", tags=["search"])


class SearchResponse(BaseModel):
    provider: str
    results: list[SearchResult]


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(min_length=1),
    limit: int = Query(10, ge=1, le=50),
    session: Session = Depends(get_session),
):
    try:
        results, provider = await search_papers(q, limit)
    except SearchError as e:
        raise HTTPException(502, str(e))

    # Mark results that are already in the library.
    ids = [r.external_id for r in results if r.external_id]
    saved = {
        ext: pid
        for pid, ext in session.exec(
            select(Paper.id, Paper.external_id).where(Paper.external_id.in_(ids))
        )
    }
    for r in results:
        r.saved_id = saved.get(r.external_id)
    return SearchResponse(provider=provider, results=results)
