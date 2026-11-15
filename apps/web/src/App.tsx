import { DOCUMENT_TYPES } from '@doc-review/shared';

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>Document Review</h1>
      <p>Supported document types: {DOCUMENT_TYPES.join(', ')}</p>
    </main>
  );
}
