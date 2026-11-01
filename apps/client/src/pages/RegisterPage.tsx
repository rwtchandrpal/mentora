import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RegisterRequestSchema } from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { registerThunk, clearAuthError } from '../store/authSlice.js';

export const RegisterPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { authStatus, error: apiError } = useAppSelector((state) => state.auth);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  useEffect(() => {
    dispatch(clearAuthError());
    return () => {
      dispatch(clearAuthError());
    };
  }, [dispatch]);

  const handleInputChange = (field: 'name' | 'email' | 'password', value: string) => {
    if (field === 'name') setName(value);
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

    const result = RegisterRequestSchema.safeParse({ name, email, password });
    if (!result.success) {
      const issues = result.error.issues;
      const errors: { name?: string; email?: string; password?: string } = {};
      for (const issue of issues) {
        const path = issue.path[0];
        if (path === 'name' && !errors.name) {
          errors.name = issue.message;
        } else if (path === 'email' && !errors.email) {
          errors.email = issue.message;
        } else if (path === 'password' && !errors.password) {
          errors.password = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    void dispatch(registerThunk(result.data));
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
            Create your Mentora account
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Start mastering complex topics with your personal Socratic tutor
          </p>
        </div>

        {apiError && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
          >
            <p className="font-semibold">Registration failed</p>
            <p>{apiError.message}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-900">
                Full name
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                  className={`appearance-none block w-full px-3 py-2 border ${
                    fieldErrors.name ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                  placeholder="Marie Curie"
                />
                {fieldErrors.name && (
                  <p id="name-error" className="mt-1 text-xs text-red-600 font-medium">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-900">
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
                  } rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
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
              <label htmlFor="password" className="block text-sm font-semibold text-gray-900">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className={`appearance-none block w-full px-3 py-2 border ${
                    fieldErrors.password ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                  placeholder="At least 8 characters"
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
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </div>

          <div className="text-center text-sm">
            <span className="text-gray-700">Already have an account? </span>
            <Link
              to="/login"
              className="font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
