// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import '@testing-library/jest-dom/vitest';
import {
  EducationLevel,
  ExplanationStyle,
  type UserDTO,
} from '@mentora/shared';
import { apiClient, clearStoredToken } from '../services/apiClient.js';
import { createAppStore, type RootState } from '../store/index.js';
import { AppRouter } from '../routes/AppRouter.js';
import { LoginPage } from '../pages/LoginPage.js';
import { RegisterPage } from '../pages/RegisterPage.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';

describe('IMP-011: Route Guards, Auth Pages, Mandatory Onboarding & Profile Settings', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockIncompleteUser: UserDTO = {
    id: 'user-incomplete',
    _id: 'user-incomplete',
    name: 'Ada Incomplete',
    email: 'ada.incomplete@example.com',
    profile: {
      isCompleted: false,
      educationLevel: null,
      preferredStyle: null,
    },
    usageQuota: {
      dailyCount: 0,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const mockCompletedUser: UserDTO = {
    id: 'user-completed',
    _id: 'user-completed',
    name: 'Ada Completed',
    email: 'ada.completed@example.com',
    profile: {
      isCompleted: true,
      educationLevel: EducationLevel.UNDERGRADUATE,
      preferredStyle: ExplanationStyle.VISUAL,
    },
    usageQuota: {
      dailyCount: 5,
      dailyLimit: 50,
      windowResetAt: '2026-10-28T00:00:00.000Z',
    },
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z',
  };

  const renderWithAppRouter = (
    initialEntries = ['/workspace'],
    preloadedState?: Partial<RootState>
  ) => {
    const store = createAppStore(preloadedState);
    const view = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={initialEntries}>
          <AppRouter />
        </MemoryRouter>
      </Provider>
    );
    return { store, ...view };
  };

  beforeEach(() => {
    cleanup();
    clearStoredToken();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    clearStoredToken();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Unauthenticated Route Guard (AC-1)
  // =========================================================================
  describe('1. Unauthenticated Guard (AC-1)', () => {
    it('redirects unauthenticated users visiting /workspace to /login', () => {
      renderWithAppRouter(['/workspace'], {
        auth: {
          token: null,
          user: null,
          quota: null,
          authStatus: 'unauthenticated',
          error: null,
        },
      });

      // Verification: LoginPage is rendered
      expect(
        screen.getByRole('heading', { name: /welcome back to mentora/i })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('redirects unauthenticated users visiting /workspace/:sessionId to /login', () => {
      renderWithAppRouter(['/workspace/session-123'], {
        auth: {
          token: null,
          user: null,
          quota: null,
          authStatus: 'unauthenticated',
          error: null,
        },
      });

      expect(
        screen.getByRole('heading', { name: /welcome back to mentora/i })
      ).toBeInTheDocument();
    });

    it('displays loading screen while token is being hydrated before route decision', () => {
      renderWithAppRouter(['/workspace'], {
        auth: {
          token: 'mock-jwt-token',
          user: null,
          quota: null,
          authStatus: 'loading',
          error: null,
        },
      });

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/authenticating session\.\.\./i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Mandatory Onboarding Guard (AC-2, BR-01)
  // =========================================================================
  describe('2. Mandatory Onboarding Guard (AC-2, BR-01)', () => {
    it('redirects an authenticated user with profile.isCompleted === false visiting /workspace to /onboarding', () => {
      renderWithAppRouter(['/workspace'], {
        auth: {
          token: 'mock-jwt-token',
          user: mockIncompleteUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      // Verification: OnboardingPage Step 1 is rendered
      expect(
        screen.getByRole('heading', {
          name: /what is your current learning background\?/i,
        })
      ).toBeInTheDocument();
      expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    });

    it('redirects an authenticated user with profile.isCompleted === true visiting /onboarding to /workspace', () => {
      renderWithAppRouter(['/onboarding'], {
        auth: {
          token: 'mock-jwt-token',
          user: mockCompletedUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      // Verification: Workspace placeholder is rendered
      expect(
        screen.getByRole('heading', {
          name: /welcome to mentora, ada completed!/i,
        })
      ).toBeInTheDocument();
    });

    it('redirects an authenticated user visiting /login directly to /workspace', () => {
      renderWithAppRouter(['/login'], {
        auth: {
          token: 'mock-jwt-token',
          user: mockCompletedUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      expect(
        screen.getByRole('heading', {
          name: /welcome to mentora, ada completed!/i,
        })
      ).toBeInTheDocument();
    });

    it('redirects an authenticated incomplete user visiting /login directly to /onboarding', () => {
      renderWithAppRouter(['/login'], {
        auth: {
          token: 'mock-jwt-token',
          user: mockIncompleteUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      expect(
        screen.getByRole('heading', {
          name: /what is your current learning background\?/i,
        })
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. 2-Step Onboarding Completion Flow (AC-3, FR-002)
  // =========================================================================
  describe('3. 2-Step Onboarding Flow (AC-3, FR-002)', () => {
    it('guides user through Step 1 and Step 2, calls PUT /profile, updates user state, and navigates to /workspace', async () => {
      let putProfileCalled = false;
      let sentPayload: unknown = null;

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === '/profile' && config.method === 'put') {
          putProfileCalled = true;
          sentPayload = JSON.parse(config.data as string);
          return {
            data: {
              success: true,
              data: {
                ...mockIncompleteUser,
                profile: {
                  isCompleted: true,
                  educationLevel: EducationLevel.UNDERGRADUATE,
                  preferredStyle: ExplanationStyle.VISUAL,
                },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const { store } = renderWithAppRouter(['/onboarding'], {
        auth: {
          token: 'mock-jwt-token',
          user: mockIncompleteUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      // Verify Step 1 is displayed
      expect(
        screen.getByRole('heading', {
          name: /what is your current learning background\?/i,
        })
      ).toBeInTheDocument();

      // Click "Continue to Step 2" without selecting education level -> validation error
      fireEvent.click(screen.getByRole('button', { name: /continue to step 2/i }));
      expect(
        screen.getByText(/please select your education or experience level to continue\./i)
      ).toBeInTheDocument();

      // Select Undergraduate card
      const undergraduateCard = screen.getByText('Undergraduate').closest('[role="radio"]');
      expect(undergraduateCard).not.toBeNull();
      if (undergraduateCard) {
        fireEvent.click(undergraduateCard);
      }

      // Continue to Step 2
      fireEvent.click(screen.getByRole('button', { name: /continue to step 2/i }));

      // Verify Step 2 is displayed
      expect(
        await screen.findByRole('heading', {
          name: /how do you prefer concepts explained\?/i,
        })
      ).toBeInTheDocument();
      expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();

      // Select Visual & Structured card
      const visualCard = screen.getByText('Visual & Structured').closest('[role="radio"]');
      expect(visualCard).not.toBeNull();
      if (visualCard) {
        fireEvent.click(visualCard);
      }

      // Submit onboarding
      fireEvent.click(screen.getByRole('button', { name: /complete & start learning/i }));

      // Wait for navigation to /workspace
      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: /welcome to mentora, ada incomplete!/i,
          })
        ).toBeInTheDocument();
      });

      // Verify API was called with the exact payload
      expect(putProfileCalled).toBe(true);
      expect(sentPayload).toEqual({
        educationLevel: EducationLevel.UNDERGRADUATE,
        preferredStyle: ExplanationStyle.VISUAL,
      });

      // Verify Redux state updated to completed
      const state = store.getState().auth;
      expect(state.user?.profile.isCompleted).toBe(true);
      expect(state.user?.profile.educationLevel).toBe(EducationLevel.UNDERGRADUATE);
      expect(state.user?.profile.preferredStyle).toBe(ExplanationStyle.VISUAL);
    });

    it('allows navigating back from Step 2 to Step 1 without losing selections', async () => {
      renderWithAppRouter(['/onboarding'], {
        auth: {
          token: 'mock-jwt-token',
          user: mockIncompleteUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      // Select High School
      const highSchoolCard = screen.getByText('High School').closest('[role="radio"]');
      if (highSchoolCard) fireEvent.click(highSchoolCard);

      // Continue to Step 2
      fireEvent.click(screen.getByRole('button', { name: /continue to step 2/i }));
      expect(
        await screen.findByRole('heading', {
          name: /how do you prefer concepts explained\?/i,
        })
      ).toBeInTheDocument();

      // Click Back
      fireEvent.click(screen.getByRole('button', { name: /back/i }));

      // Step 1 is back and High School remains selected
      expect(
        screen.getByRole('heading', {
          name: /what is your current learning background\?/i,
        })
      ).toBeInTheDocument();
      const updatedCard = screen.getByText('High School').closest('[role="radio"]');
      expect(updatedCard?.getAttribute('aria-checked')).toBe('true');
    });
  });

  // =========================================================================
  // 4. Client-Side Validation on Login & Registration (FR-001)
  // =========================================================================
  describe('4. Client-Side Validation (FR-001)', () => {
    it('LoginPage prevents network calls on invalid email or empty password', async () => {
      let postLoginCalled = false;
      const mockAdapter: AxiosAdapter = async (config) => {
        postLoginCalled = true;
        return {
          data: {
            success: true,
            data: {
              user: mockCompletedUser,
              token: 'mock-token',
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      render(
        <Provider store={store}>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </Provider>
      );

      // Fill invalid data
      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitBtn = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
      fireEvent.change(passwordInput, { target: { value: '' } });
      fireEvent.click(submitBtn);

      // Inline validation error messages should be visible
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/too small|characters/i)).toBeInTheDocument();
      expect(postLoginCalled).toBe(false);

      // Now enter valid credentials
      fireEvent.change(emailInput, { target: { value: 'ada@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'strongpassword123' } });
      fireEvent.submit(submitBtn.closest('form')!);

      await waitFor(() => {
        expect(postLoginCalled).toBe(true);
      });
    });

    it('LoginPage displays API error alert when authentication fails', async () => {
      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError(
          'Request failed with status code 401',
          'ERR_BAD_REQUEST',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: {
              success: false,
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Invalid email or password provided.',
              },
            },
          }
        );
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      render(
        <Provider store={store}>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </Provider>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitBtn = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'ada@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(
          screen.getByText(/invalid email or password provided\./i)
        ).toBeInTheDocument();
      });
    });

    it('RegisterPage validates name length, email, and password before dispatching network request', async () => {
      let postRegisterCalled = false;
      const mockAdapter: AxiosAdapter = async (config) => {
        postRegisterCalled = true;
        return {
          data: {
            success: true,
            data: {
              user: mockIncompleteUser,
              token: 'mock-token',
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore();
      render(
        <Provider store={store}>
          <MemoryRouter>
            <RegisterPage />
          </MemoryRouter>
        </Provider>
      );

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitBtn = screen.getByRole('button', { name: /create account/i });

      // Test too short name (< 2 chars)
      fireEvent.change(nameInput, { target: { value: 'A' } });
      fireEvent.change(emailInput, { target: { value: 'valid@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'validpassword123' } });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/too small|characters/i)).toBeInTheDocument();
      expect(postRegisterCalled).toBe(false);

      // Enter valid name
      fireEvent.change(nameInput, { target: { value: 'Ada Lovelace' } });
      fireEvent.submit(submitBtn.closest('form')!);

      await waitFor(() => {
        expect(postRegisterCalled).toBe(true);
      });
    });
  });

  // =========================================================================
  // 5. Profile Settings Modal (FR-003)
  // =========================================================================
  describe('5. Profile Settings Modal (FR-003)', () => {
    it('opens modal, updates learner profile via PUT /profile, updates Redux state, and closes', async () => {
      let putProfileCalled = false;
      let updatedData: unknown = null;

      const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        if (config.url === '/profile' && config.method === 'put') {
          putProfileCalled = true;
          updatedData = JSON.parse(config.data as string);
          return {
            data: {
              success: true,
              data: {
                ...mockCompletedUser,
                profile: {
                  isCompleted: true,
                  educationLevel: EducationLevel.PROFESSIONAL,
                  preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
                },
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        return {
          data: { success: false },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config,
        };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore({
        auth: {
          token: 'mock-jwt-token',
          user: mockCompletedUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      render(
        <Provider store={store}>
          <MemoryRouter>
            <WorkspacePage />
          </MemoryRouter>
        </Provider>
      );

      // Modal is not visible initially
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Click "Profile Settings" button in navigation bar
      fireEvent.click(screen.getByRole('button', { name: /profile settings/i }));

      // Modal is now open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /learner profile settings/i })
      ).toBeInTheDocument();

      // Change selects to Professional and Concise & Technical
      const educationSelect = screen.getByLabelText(/education \/ experience level/i);
      const styleSelect = screen.getByLabelText(/preferred explanation style/i);

      fireEvent.change(educationSelect, { target: { value: EducationLevel.PROFESSIONAL } });
      fireEvent.change(styleSelect, {
        target: { value: ExplanationStyle.CONCISE_TECHNICAL },
      });

      // Save settings
      fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Verify network request
      expect(putProfileCalled).toBe(true);
      expect(updatedData).toEqual({
        educationLevel: EducationLevel.PROFESSIONAL,
        preferredStyle: ExplanationStyle.CONCISE_TECHNICAL,
      });

      // Verify state was updated in Redux
      const authState = store.getState().auth;
      expect(authState.user?.profile.educationLevel).toBe(EducationLevel.PROFESSIONAL);
      expect(authState.user?.profile.preferredStyle).toBe(ExplanationStyle.CONCISE_TECHNICAL);

      // Verify notification added
      const uiState = store.getState().ui;
      expect(uiState.notifications).toHaveLength(1);
      expect(uiState.notifications[0]?.type).toBe('success');
    });

    it('closes modal on Escape key press or Cancel button without dispatching PUT /profile', () => {
      let putProfileCalled = false;
      const mockAdapter: AxiosAdapter = async (config) => {
        putProfileCalled = true;
        return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
      };
      apiClient.defaults.adapter = mockAdapter;

      const store = createAppStore({
        auth: {
          token: 'mock-jwt-token',
          user: mockCompletedUser,
          quota: null,
          authStatus: 'authenticated',
          error: null,
        },
      });

      render(
        <Provider store={store}>
          <MemoryRouter>
            <WorkspacePage />
          </MemoryRouter>
        </Provider>
      );

      // Open modal via button
      fireEvent.click(screen.getByRole('button', { name: /profile settings/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(putProfileCalled).toBe(false);

      // Open again via button and click Cancel
      fireEvent.click(screen.getByRole('button', { name: /profile settings/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(putProfileCalled).toBe(false);
    });
  });
});
