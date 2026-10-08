import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import PaperCard from '../components/PaperCard'
import { useLibrary } from '../library'
import type { SearchResponse, SearchResult } from '../types'

const EXAMPLES = ['retrieval-augmented generation', 'diffusion models for video', 'LLM code repair']

export default function SearchPage() {
  // The query lives in the URL so results survive navigating to a paper and back.
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [draft, setDraft] = useState(query)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .search(query)
      .then((res) => !cancelled && setData(res))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [query])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = draft.trim()
    if (q) setParams({ q })
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Find papers</h1>
        <p className="lede">
          Search by topic or keywords. Save the papers you want to read, then summarize them or ask
          questions about them.
        </p>
      </header>

      <form className="search-bar" onSubmit={submit} role="search">
        <label htmlFor="q" className="visually-hidden">
          Topic or keywords
        </label>
        <input
          id="q"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. contrastive learning for medical images"
          autoFocus
        />
        <button className="button primary" type="submit" disabled={!draft.trim() || loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {!query && (
        <p className="muted examples">
          Try{' '}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              <button
                className="link-button"
                onClick={() => {
                  setDraft(ex)
                  setParams({ q: ex })
                }}
              >
                {ex}
              </button>
              {i < EXAMPLES.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}

      {error && <p className="error">Search failed: {error}</p>}

      {data && query && !error && (
        <section aria-live="polite" aria-busy={loading}>
          <p className="result-count muted">
            {data.results.length} results for “{query}” from{' '}
            {data.provider === 'arxiv' ? 'arXiv' : 'Semantic Scholar'}
          </p>
          {data.results.length === 0 && (
            <p>No papers matched. Try broader keywords or fewer terms.</p>
          )}
          <ol className="paper-list">
            {data.results.map((r) => (
              <li key={r.external_id ?? r.title}>
                <ResultEntry result={r} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function ResultEntry({ result }: { result: SearchResult }) {
  const { save, savedIdFor } = useLibrary()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savedId = savedIdFor(result.external_id) ?? result.saved_id ?? undefined

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await save(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PaperCard
      paper={result}
      titleHref={savedId ? `/papers/${savedId}` : undefined}
      actions={
        <>
          {savedId ? (
            <Link className="button saved" to={`/papers/${savedId}`}>
              <mark>Saved</mark> Open in library
            </Link>
          ) : (
            <button className="button primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving and fetching PDF…' : 'Save to library'}
            </button>
          )}
          {error && <span className="error inline">{error}</span>}
        </>
      }
    />
  )
}
