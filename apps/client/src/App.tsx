import React, { useEffect } from 'react';
import { pingHealthCheck } from './services/apiClient.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

export const App: React.FC = () => {
  useEffect(() => {
    void pingHealthCheck();
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-6 text-center">
        <header className="max-w-xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold uppercase tracking-wider">
            <span>Mentora Workspace</span>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
            Mentora AI Tutoring
          </h1>
          <p className="text-base text-gray-600">
            Personalized web tutoring powered by Socratic dialogue, multi-tier practice, and deep explanations.
          </p>
        </header>
      </div>
    </ErrorBoundary>
  );
};

export default App;
