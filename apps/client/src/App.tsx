import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { ServerStatusBanner } from './components/common/ServerStatusBanner.js';
import { ServerWakeupGate } from './components/common/ServerWakeupGate.js';
import { AppRouter } from './routes/AppRouter.js';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ServerStatusBanner />
      {/* Nothing below runs (no /auth/me, no session fetches) until the backend is awake. */}
      <ServerWakeupGate>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ServerWakeupGate>
    </ErrorBoundary>
  );
};

export default App;
