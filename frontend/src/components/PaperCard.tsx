import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PaperBase } from '../types'

const SOURCE_LABEL = {
  semantic_scholar: 'Semantic Scholar',
  arxiv: 'arXiv',
  upload: 'Uploaded PDF',
} as const

interface Props {
  paper: PaperBase
  /** Makes the title a link (e.g. to the paper page). */
  titleHref?: string
  actions?: ReactNode
  badges?: ReactNode
}

/** One paper entry, shared by search results and the library. */
export default function PaperCard({ paper, titleHref, actions, badges }: Props) {
  const [expanded, setExpanded] = useState(false)
  const authors =
    paper.authors.length > 6
      ? `${paper.authors.slice(0, 6).join(', ')}, and ${paper.authors.length - 6} more`
      : paper.authors.join(', ')
  const abstract = paper.abstract ?? ''
  const long = abstract.length > 420

  return (
    <article className="paper">
      <h3 className="paper-title">
        {titleHref ? <Link to={titleHref}>{paper.title}</Link> : paper.title}
      </h3>
      <p className="paper-meta">
        <span>{authors || 'Unknown authors'}</span>
        <span className="paper-year">{paper.year ?? 'Year unknown'}</span>
        <span className="paper-source">{SOURCE_LABEL[paper.source]}</span>
        {badges}
      </p>
      {abstract ? (
        <p className="paper-abstract">
          {long && !expanded ? `${abstract.slice(0, 420).trimEnd()}…` : abstract}{' '}
          {long && (
            <button className="link-button" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Show full abstract'}
            </button>
          )}
        </p>
      ) : (
        <p className="paper-abstract muted">No abstract available.</p>
      )}
      <div className="paper-actions">
        {actions}
        {paper.url && (
          <a className="button ghost" href={paper.url} target="_blank" rel="noreferrer">
            View paper
          </a>
        )}
        {paper.pdf_url && (
          <a className="button ghost" href={paper.pdf_url} target="_blank" rel="noreferrer">
            PDF
          </a>
        )}
      </div>
    </article>
  )
}
