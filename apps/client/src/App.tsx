import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { pingHealthCheck } from './services/apiClient.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { AppRouter } from './routes/AppRouter.js';

export const App: React.FC = () => {
  useEffect(() => {
    void pingHealthCheck();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
