import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api/client'
import type { Paper, PaperBase } from './types'

interface LibraryState {
  papers: Paper[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (paper: PaperBase) => Promise<Paper>
  upload: (file: File) => Promise<Paper>
  remove: (id: number) => Promise<void>
  /** Saved paper id for a search result, if it is already in the library. */
  savedIdFor: (externalId: string | null) => number | undefined
}

const LibraryContext = createContext<LibraryState | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPapers(await api.listPapers())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upsert = (paper: Paper) =>
    setPapers((prev) => [paper, ...prev.filter((p) => p.id !== paper.id)])

  const save = async (base: PaperBase) => {
    const paper = await api.savePaper(base)
    upsert(paper)
    return paper
  }

  const upload = async (file: File) => {
    const paper = await api.uploadPaper(file)
    upsert(paper)
    return paper
  }

  const remove = async (id: number) => {
    await api.deletePaper(id)
    setPapers((prev) => prev.filter((p) => p.id !== id))
  }

  const savedIdFor = (externalId: string | null) =>
    externalId ? papers.find((p) => p.external_id === externalId)?.id : undefined

  return (
    <LibraryContext.Provider
      value={{ papers, loading, error, refresh, save, upload, remove, savedIdFor }}
    >
      {children}
    </LibraryContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return ctx
}
