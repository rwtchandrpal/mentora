import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => (
  <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
      <p className="text-sm font-semibold text-indigo-700">404</p>
      <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Page not found</h1>
      <p className="text-sm text-gray-700">The page you are looking for doesn&apos;t exist.</p>
      <Link
        to="/workspace"
        className="inline-flex items-center justify-center py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        New topic
      </Link>
    </div>
  </main>
);

export default NotFoundPage;
