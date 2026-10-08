import { useEffect } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { LibraryProvider, useLibrary } from './library'
import LibraryPage from './pages/LibraryPage'
import PaperPage from './pages/PaperPage'
import SearchPage from './pages/SearchPage'

/** Start each page at the top instead of keeping the previous page's scroll position. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function Rail() {
  const { papers } = useLibrary()
  return (
    <nav className="rail" aria-label="Main">
      <p className="wordmark">Research Assistant</p>
      <ul>
        <li>
          <NavLink to="/" end>
            <span>Search</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/library">
            <span>Library</span>
            <span className="count" aria-label={`${papers.length} papers`}>
              {papers.length}
            </span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <LibraryProvider>
        <div className="shell">
          <Rail />
          <main>
            <Routes>
              <Route path="/" element={<SearchPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/papers/:id" element={<PaperPage />} />
            </Routes>
          </main>
        </div>
      </LibraryProvider>
    </BrowserRouter>
  )
}
