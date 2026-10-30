import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LoginRequestSchema } from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { loginThunk, clearAuthError } from '../store/authSlice.js';

export const DEMO_CREDENTIALS = {
  email: 'jhon@email.com',
  password: 'Jhon1234',
} as const;

export const LoginPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { authStatus, error: apiError } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState<string>(DEMO_CREDENTIALS.email);
  const [password, setPassword] = useState<string>(DEMO_CREDENTIALS.password);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    dispatch(clearAuthError());
    return () => {
      dispatch(clearAuthError());
    };
  }, [dispatch]);

  const handleResetToDemo = () => {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    setFieldErrors({});
    if (apiError) {
      dispatch(clearAuthError());
    }
  };

  const handleInputChange = (field: 'email' | 'password', value: string) => {
    if (field === 'email') setEmail(value);
    if (field === 'password') setPassword(value);

    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (apiError) {
      dispatch(clearAuthError());
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});

    const result = LoginRequestSchema.safeParse({ email, password });
    if (!result.success) {
      const issues = result.error.issues;
      const errors: { email?: string; password?: string } = {};
      for (const issue of issues) {
        const path = issue.path[0];
        if (path === 'email' && !errors.email) {
          errors.email = issue.message;
        } else if (path === 'password' && !errors.password) {
          errors.password = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    void dispatch(loginThunk(result.data));
  };

  const isLoading = authStatus === 'loading';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white font-bold text-xl shadow-md">
            M
          </div>
          <h1 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
            Welcome back to Mentora
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to continue your personalized AI tutoring sessions
          </p>
        </div>

        {/* Demo Credentials Helper Badge & Reset Button */}
        <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-800">
          <div className="flex items-center space-x-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse"
              aria-hidden="true"
            />
            <span className="font-medium">Demo Credentials Pre-filled</span>
          </div>
          <button
            type="button"
            onClick={handleResetToDemo}
            aria-label="Reset to Demo Account"
            className="text-indigo-600 hover:text-indigo-800 font-semibold underline focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 transition-colors"
          >
            Reset to Demo Account
          </button>
        </div>

        {apiError && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
          >
            <p className="font-semibold">Authentication failed</p>
            <p>{apiError.message}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  className={`appearance-none block w-full px-3 py-2 border ${
                    fieldErrors.email ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                  placeholder="learner@university.edu"
                />
                {fieldErrors.email && (
                  <p id="email-error" className="mt-1 text-xs text-red-600 font-medium">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className={`appearance-none block w-full px-3 py-2 border ${
                    fieldErrors.password ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                  placeholder="••••••••"
                />
                {fieldErrors.password && (
                  <p id="password-error" className="mt-1 text-xs text-red-600 font-medium">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link
              to="/register"
              className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
