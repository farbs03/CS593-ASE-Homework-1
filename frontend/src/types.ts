// Mirrors the Pydantic schemas in backend/app/models.py.

export type Source = 'semantic_scholar' | 'arxiv' | 'upload'

export interface PaperBase {
  source: Source
  external_id: string | null
  title: string
  authors: string[]
  year: number | null
  abstract: string | null
  url: string | null
  pdf_url: string | null
}

export interface SearchResult extends PaperBase {
  saved_id: number | null
}

export interface Paper extends PaperBase {
  id: number
  text_status: 'full' | 'abstract_only'
  summary: string | null
  has_pdf: boolean
  created_at: string
}

export interface ChatMessage {
  id: number
  paper_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface SearchResponse {
  provider: Source
  results: SearchResult[]
}
