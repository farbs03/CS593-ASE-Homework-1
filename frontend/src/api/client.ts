import type { ChatMessage, Paper, PaperBase, SearchResponse } from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new Error('Could not reach the server. Is the backend running on port 8000?')
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  search: (q: string, limit = 10) =>
    request<SearchResponse>(`/api/search?${new URLSearchParams({ q, limit: String(limit) })}`),

  listPapers: () => request<Paper[]>('/api/papers'),
  getPaper: (id: number) => request<Paper>(`/api/papers/${id}`),
  savePaper: (paper: PaperBase) => request<Paper>('/api/papers', json(paper)),
  deletePaper: (id: number) => request<void>(`/api/papers/${id}`, { method: 'DELETE' }),
  uploadPaper: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Paper>('/api/papers/upload', { method: 'POST', body: form })
  },
  pdfUrl: (id: number) => `/api/papers/${id}/pdf`,

  summarize: (id: number, regenerate = false) =>
    request<{ summary: string }>(`/api/papers/${id}/summary?regenerate=${regenerate}`, {
      method: 'POST',
    }),
  getChat: (id: number) => request<ChatMessage[]>(`/api/papers/${id}/chat`),
  ask: (id: number, question: string) =>
    request<ChatMessage[]>(`/api/papers/${id}/chat`, json({ question })),
  clearChat: (id: number) => request<void>(`/api/papers/${id}/chat`, { method: 'DELETE' }),
}
