import { Route, Routes } from 'react-router';
import { AppHeader } from './components/AppHeader.js';
import { DocumentDetailPage } from './pages/DocumentDetailPage.js';
import { DocumentsPage } from './pages/DocumentsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<DocumentsPage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
