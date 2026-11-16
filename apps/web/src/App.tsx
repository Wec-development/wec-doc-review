import { Navigate, Route, Routes } from 'react-router';
import { AppHeader } from './components/AppHeader.js';
import { DocumentDetailPage } from './pages/DocumentDetailPage.js';
import { DocumentsPage } from './pages/DocumentsPage.js';
import { useFirstVisit } from './hooks/useFirstVisit.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { WelcomePage } from './pages/WelcomePage.js';

/** The documents list, except on a first visit, which goes to the onboarding once. */
function DocumentsOrFirstVisit() {
  return useFirstVisit() ? <Navigate to="/welcome" replace /> : <DocumentsPage />;
}

export function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<DocumentsOrFirstVisit />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
