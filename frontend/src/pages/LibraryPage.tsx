import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PaperCard from '../components/PaperCard'
import { useLibrary } from '../library'

export default function LibraryPage() {
  const { papers, loading, error, upload, remove } = useLibrary()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState('')

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError(`${file.name} isn't a PDF. Choose a .pdf file.`)
      return
    }
    setUploadError(null)
    setUploading(file.name)
    try {
      const paper = await upload(file)
      navigate(`/papers/${paper.id}`)
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  const onDelete = async (id: number, title: string) => {
    if (!confirm(`Remove “${title}” from your library? Its summary and Q&A history will be deleted.`))
      return
    try {
      await remove(id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? papers.filter((p) =>
        [p.title, p.authors.join(' '), p.abstract ?? ''].some((s) => s.toLowerCase().includes(needle)),
      )
    : papers

  return (
    <div className="page">
      <header className="page-header">
        <h1>Library</h1>
        <p className="lede">Papers you've saved or uploaded. Open one to summarize it or ask questions.</p>
      </header>

      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <p>
            Reading <strong>{uploading}</strong> and extracting its title, authors, year, and
            abstract…
          </p>
        ) : (
          <>
            <p>Drop a paper PDF here, or</p>
            <button className="button primary" onClick={() => inputRef.current?.click()}>
              Upload PDF
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
      {uploadError && <p className="error">Upload failed: {uploadError}</p>}

      {error && <p className="error">Couldn't load your library: {error}</p>}

      {!loading && papers.length === 0 && !error && (
        <p className="empty">
          Your library is empty. <Link to="/">Search for papers</Link> to save, or upload a PDF
          above.
        </p>
      )}

      {papers.length > 0 && (
        <>
          <div className="library-toolbar">
            <label htmlFor="filter" className="visually-hidden">
              Filter library
            </label>
            <input
              id="filter"
              type="search"
              placeholder="Filter by title, author, or abstract"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="muted">
              {shown.length} of {papers.length} papers
            </span>
          </div>
          <ol className="paper-list">
            {shown.map((p) => (
              <li key={p.id}>
                <PaperCard
                  paper={p}
                  titleHref={`/papers/${p.id}`}
                  badges={
                    p.text_status === 'abstract_only' ? (
                      <span className="badge" title="No PDF was available, so AI answers use the abstract only">
                        Abstract only
                      </span>
                    ) : null
                  }
                  actions={
                    <>
                      <Link className="button primary" to={`/papers/${p.id}`}>
                        Summarize &amp; ask
                      </Link>
                      <button className="button ghost danger" onClick={() => onDelete(p.id, p.title)}>
                        Remove
                      </button>
                    </>
                  }
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
