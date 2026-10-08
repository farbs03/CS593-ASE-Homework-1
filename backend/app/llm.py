"""LLM calls via an OpenAI-compatible API (Meta Muse Spark by default; swap via .env)."""

import json
import re

from openai import APIError, AsyncOpenAI

from .config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, MAX_CONTEXT_CHARS


class LLMError(Exception):
    pass


_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if not LLM_API_KEY:
        raise LLMError("LLM_API_KEY is not set. Copy backend/.env.example to backend/.env.")
    if _client is None:
        _client = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
    return _client


async def _chat(messages: list[dict], temperature: float = 0.2) -> str:
    try:
        resp = await _get_client().chat.completions.create(
            model=LLM_MODEL, messages=messages, temperature=temperature
        )
    except APIError as e:
        raise LLMError(f"LLM request failed: {e}") from e
    return (resp.choices[0].message.content or "").strip()


def _paper_context(title: str, text: str) -> str:
    if len(text) > MAX_CONTEXT_CHARS:
        text = text[:MAX_CONTEXT_CHARS] + "\n\n[...truncated...]"
    return f"Title: {title}\n\n--- PAPER CONTENT START ---\n{text}\n--- PAPER CONTENT END ---"


async def extract_metadata(first_pages_text: str) -> dict:
    """Ask the LLM to pull title/authors/year/abstract out of the first pages of a paper."""
    prompt = (
        "Extract bibliographic metadata from the beginning of this research paper. "
        'Respond with ONLY a JSON object: {"title": string, "authors": [string], '
        '"year": integer or null, "abstract": string or null}. Copy the abstract verbatim. '
        "Use null when a field is not present.\n\n" + first_pages_text[:12000]
    )
    raw = await _chat([{"role": "user", "content": prompt}], temperature=0)
    m = re.search(r"\{.*\}", raw, re.DOTALL)  # tolerate ```json fences / chatter
    if not m:
        raise LLMError("LLM did not return JSON metadata")
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise LLMError(f"LLM returned invalid JSON metadata: {e}") from e
    year = str(data.get("year") or "")
    return {
        "title": (data.get("title") or "").strip() or None,
        "authors": [str(a).strip() for a in data.get("authors") or [] if str(a).strip()],
        "year": int(year) if year.isdigit() else None,
        "abstract": (data.get("abstract") or "").strip() or None,
    }


SUMMARY_PROMPT = """You are a research assistant. Summarize the paper below for a researcher, based on its actual content (not just the title).
Use Markdown with these sections:
## TL;DR (2-3 sentences)
## Problem
## Approach
## Datasets & Experiments
## Key Results
## Limitations
Be specific: name methods, datasets, and numbers from the paper. If a section isn't covered by the provided text, say so."""


async def summarize(title: str, text: str) -> str:
    return await _chat(
        [
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": _paper_context(title, text)},
        ]
    )


QA_PROMPT = """You are a research assistant answering questions about ONE paper, whose content is provided below.
Answer using only the paper's content. Quote or cite sections when helpful. If the paper does not contain the answer, say so plainly instead of guessing.
Answer in concise Markdown.

{context}"""


async def answer(title: str, text: str, history: list[dict], question: str) -> str:
    messages = [{"role": "system", "content": QA_PROMPT.format(context=_paper_context(title, text))}]
    messages += history
    messages.append({"role": "user", "content": question})
    return await _chat(messages)
