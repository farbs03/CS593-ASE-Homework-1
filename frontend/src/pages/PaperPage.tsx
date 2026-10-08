import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Markdown from 'react-markdown'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useLibrary } from '../library'
import type { ChatMessage, Paper } from '../types'

const SUGGESTED = [
  'What problem does this paper address?',
  'What is the main idea of the proposed approach?',
  'What datasets are used?',
  'What are the major limitations?',
  'How does this method compare with the baselines?',
]

export default function PaperPage() {
  const id = Number(useParams().id)
  const { refresh } = useLibrary()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPaper(null)
    setError(null)
    api.getPaper(id).then(setPaper, (e: Error) => setError(e.message))
  }, [id])

  if (error)
    return (
      <div className="page">
        <p className="error">Couldn't open this paper: {error}</p>
        <Link to="/library">Back to library</Link>
      </div>
    )
  if (!paper) return <div className="page muted">Loading paper…</div>

  return (
    <div className="paper-page">
      <div className="paper-main">
        <Link className="back" to="/library">
          Library
        </Link>
        <h1 className="paper-heading">{paper.title}</h1>
        <p className="paper-meta">
          <span>{paper.authors.join(', ') || 'Unknown authors'}</span>
          <span className="paper-year">{paper.year ?? 'Year unknown'}</span>
        </p>
        <div className="paper-actions">
          {paper.has_pdf && (
            <a className="button ghost" href={api.pdfUrl(paper.id)} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          )}
          {paper.url && (
            <a className="button ghost" href={paper.url} target="_blank" rel="noreferrer">
              View source page
            </a>
          )}
        </div>

        {paper.text_status === 'abstract_only' && (
          <p className="notice">
            No full text is available for this paper, so the summary and answers are based on the
            abstract only. For better results, download the PDF and{' '}
            <Link to="/library">upload it to your library</Link>.
          </p>
        )}

        {paper.abstract && (
          <section className="abstract-block">
            <h2>Abstract</h2>
            <p>{paper.abstract}</p>
          </section>
        )}

        <SummaryPanel
          paper={paper}
          onSummary={(summary) => {
            setPaper({ ...paper, summary })
            void refresh()
          }}
        />
      </div>

      <ChatPanel paperId={paper.id} />
    </div>
  )
}

function SummaryPanel({ paper, onSummary }: { paper: Paper; onSummary: (s: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (regenerate: boolean) => {
    setLoading(true)
    setError(null)
    try {
      onSummary((await api.summarize(paper.id, regenerate)).summary)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="summary" aria-busy={loading}>
      <div className="section-head">
        <h2>Summary</h2>
        {paper.summary && (
          <button className="button ghost" onClick={() => run(true)} disabled={loading}>
            {loading ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>
      {paper.summary ? (
        <div className="prose">
          <Markdown>{paper.summary}</Markdown>
        </div>
      ) : (
        <div className="summary-empty">
          <p className="muted">
            Get a structured summary of the problem, approach, datasets, results, and limitations,
            written from the paper's {paper.text_status === 'full' ? 'full text' : 'abstract'}.
          </p>
          <button className="button primary" onClick={() => run(false)} disabled={loading}>
            {loading ? 'Reading the paper…' : 'Summarize paper'}
          </button>
        </div>
      )}
      {error && <p className="error">Summary failed: {error}</p>}
    </section>
  )
}

function ChatPanel({ paperId }: { paperId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getChat(paperId).then(setMessages, (e: Error) => setError(e.message))
  }, [paperId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, pending])

  const ask = async (q: string) => {
    const text = q.trim()
    if (!text || pending) return
    setPending(text)
    setQuestion('')
    setError(null)
    try {
      const pair = await api.ask(paperId, text)
      setMessages((prev) => [...prev, ...pair])
    } catch (e) {
      setError((e as Error).message)
      setQuestion(text) // give the question back so it can be retried
    } finally {
      setPending(null)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(question)
  }

  const clear = async () => {
    if (!confirm('Clear this Q&A history?')) return
    await api.clearChat(paperId)
    setMessages([])
  }

  return (
    <aside className="chat" aria-label="Questions about this paper">
      <div className="section-head">
        <h2>Ask about this paper</h2>
        {messages.length > 0 && (
          <button className="link-button" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && !pending && (
          <div className="suggestions">
            <p className="muted">Ask anything, or start with one of these:</p>
            {SUGGESTED.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? (
              <div className="prose">
                <Markdown>{m.content}</Markdown>
              </div>
            ) : (
              <p>{m.content}</p>
            )}
          </div>
        ))}
        {pending && (
          <>
            <div className="msg user">
              <p>{pending}</p>
            </div>
            <div className="msg assistant thinking">Reading the paper…</div>
          </>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="error">Couldn't get an answer: {error}</p>}

      <form className="chat-form" onSubmit={submit}>
        <label htmlFor="question" className="visually-hidden">
          Your question
        </label>
        <textarea
          id="question"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(question)
            }
          }}
          placeholder="e.g. What datasets are used?"
        />
        <button className="button primary" type="submit" disabled={!question.trim() || !!pending}>
          Ask
        </button>
      </form>
    </aside>
  )
}
