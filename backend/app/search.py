"""Paper search: Semantic Scholar first, arXiv as a fallback. Both return SearchResult."""

import asyncio
import logging
import re
import xml.etree.ElementTree as ET

import httpx

from .config import S2_API_KEY
from .models import SearchResult

log = logging.getLogger(__name__)

S2_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
S2_FIELDS = "title,authors,year,abstract,url,openAccessPdf,externalIds"
ARXIV_URL = "https://export.arxiv.org/api/query"
ATOM = {"a": "http://www.w3.org/2005/Atom"}


class SearchError(Exception):
    pass


async def search_papers(query: str, limit: int = 10) -> tuple[list[SearchResult], str]:
    """Returns (results, provider name)."""
    try:
        return await search_semantic_scholar(query, limit), "semantic_scholar"
    except Exception as e:  # rate limit (429), timeout, outage...
        log.warning("Semantic Scholar failed (%s); falling back to arXiv", e)
    try:
        return await search_arxiv(query, limit), "arxiv"
    except Exception as e:
        raise SearchError(f"All search providers failed: {e}") from e


async def search_semantic_scholar(query: str, limit: int) -> list[SearchResult]:
    headers = {"x-api-key": S2_API_KEY} if S2_API_KEY else {}
    params = {"query": query, "limit": limit, "fields": S2_FIELDS}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(S2_URL, params=params, headers=headers)
        if r.status_code == 429:  # the keyless shared pool is often saturated; retry once
            await asyncio.sleep(1.5)
            r = await client.get(S2_URL, params=params, headers=headers)
        r.raise_for_status()
    results = []
    for item in r.json().get("data") or []:
        ext = item.get("externalIds") or {}
        arxiv_id = ext.get("ArXiv")
        pdf_url = (item.get("openAccessPdf") or {}).get("url") or None
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
        results.append(
            SearchResult(
                source="semantic_scholar",
                # Prefer the arXiv id so the same paper dedupes across providers.
                external_id=f"arxiv:{arxiv_id}" if arxiv_id else f"s2:{item['paperId']}",
                title=item.get("title") or "(untitled)",
                authors=[a["name"] for a in item.get("authors") or [] if a.get("name")],
                year=item.get("year"),
                abstract=item.get("abstract"),
                url=item.get("url"),
                pdf_url=pdf_url,
            )
        )
    return results


async def search_arxiv(query: str, limit: int) -> list[SearchResult]:
    # Strict (AND) first; if nothing matches, loosen to OR.
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for conjunction in ("AND", "OR"):
            params = {
                "search_query": _arxiv_query(query, conjunction),
                "max_results": limit,
                "sortBy": "relevance",
            }
            r = await client.get(ARXIV_URL, params=params)
            r.raise_for_status()
            results = _parse_arxiv(r.text)
            if results:
                break
    return results


def _parse_arxiv(xml: str) -> list[SearchResult]:
    root = ET.fromstring(xml)
    results = []
    for entry in root.findall("a:entry", ATOM):
        abs_url = _text(entry, "a:id")
        arxiv_id = re.sub(r"v\d+$", "", abs_url.rsplit("/abs/", 1)[-1])
        published = _text(entry, "a:published")
        results.append(
            SearchResult(
                source="arxiv",
                external_id=f"arxiv:{arxiv_id}",
                title=_squash(_text(entry, "a:title")),
                authors=[_text(a, "a:name") for a in entry.findall("a:author", ATOM)],
                year=int(published[:4]) if published[:4].isdigit() else None,
                abstract=_squash(_text(entry, "a:summary")),
                url=f"https://arxiv.org/abs/{arxiv_id}",
                pdf_url=f"https://arxiv.org/pdf/{arxiv_id}",
            )
        )
    return results


STOPWORDS = {"a", "an", "the", "is", "are", "of", "for", "in", "on", "to", "and", "or", "with",
             "by", "from", "at", "as", "be"}


def _arxiv_query(query: str, conjunction: str = "AND") -> str:
    """arXiv ORs bare terms together; AND the content words so multi-word topics stay relevant."""
    terms = [t for t in re.findall(r"[\w-]+", query) if t.lower() not in STOPWORDS]
    terms = terms or re.findall(r"[\w-]+", query)
    return f" {conjunction} ".join(f"all:{t}" for t in terms) or f"all:{query}"


def _text(el: ET.Element, path: str) -> str:
    found = el.find(path, ATOM)
    return (found.text or "").strip() if found is not None else ""


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()
