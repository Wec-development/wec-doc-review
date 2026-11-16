import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App.js';
import { AnnouncerProvider } from '../components/Announcer.js';

/** Renders the whole app at `path` with fresh providers (no retries, no shared cache). */
export function renderApp(path = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AnnouncerProvider>
          <App />
        </AnnouncerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, user, queryClient };
}
