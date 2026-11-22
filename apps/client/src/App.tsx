import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { ServerStatusBanner } from './components/common/ServerStatusBanner.js';
import { ServerWakeSplash } from './components/common/ServerWakeSplash.js';
import { AppRouter } from './routes/AppRouter.js';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ServerStatusBanner />
      <ServerWakeSplash />
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
