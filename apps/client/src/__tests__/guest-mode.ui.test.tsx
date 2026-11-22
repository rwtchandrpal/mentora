// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import {
  LearningMode,
  ExplainStatus,
  ExplainStepType,
  InteractStatus,
  PracticeTier,
  BatchStatus,
  type TopicSessionDTO,
  type UserDTO,
  EducationLevel,
  ExplanationStyle,
} from '@mentora/shared';
import { createAppStore } from '../store/index.js';
import { WorkspacePage } from '../pages/WorkspacePage.js';
import { LeftHistorySidebar } from '../components/layout/LeftHistorySidebar.js';
import { StickyTopicHeader } from '../components/layout/StickyTopicHeader.js';

describe('Guest Mode Frontend UI Integration Tests', () => {
  afterEach(() => {
    cleanup();
  });

  const renderWithRouter = (
    ui: React.ReactElement,
    initialState: Parameters<typeof createAppStore>[0] = {},
    initialRoute = '/workspace'
  ) => {
    const store = createAppStore(initialState);
    return {
      store,
      ...render(
        <Provider store={store}>
          <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
              <Route path="/workspace" element={ui} />
              <Route path="/login" element={<div>LoginPage Mock</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      ),
    };
  };

  describe('1. Sidebar Adaptive UI', () => {
    it('displays no history and renders guest personalized learning message with Get Started button for unauthenticated users', () => {
      renderWithRouter(<LeftHistorySidebar />, {
        auth: {
          user: null,
          token: null,
          quota: null,
          authStatus: 'unauthenticated',
          error: null,
        },
      });

      // No guest-mode history placeholder
      expect(screen.queryByText(/no history in guest mode/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/recent topics/i)).not.toBeInTheDocument();

      // Bottom personalized learning card
      expect(screen.getByText('Personalized Learning')).toBeInTheDocument();
      expect(
        screen.getByText(/sign up to save topics and track progress/i)
      ).toBeInTheDocument();

      // Get started button in sidebar
      const getStartedBtn = screen.getByRole('button', { name: /get started/i });
      expect(getStartedBtn).toBeInTheDocument();

      // Clicking redirects to /login
      fireEvent.click(getStartedBtn);
      expect(screen.getByText('LoginPage Mock')).toBeInTheDocument();
    });

    it('displays saved topics, quota badge, and profile settings for authenticated users', () => {
      const authUser: UserDTO = {
        id: 'user-1',
        _id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        profile: {
          isCompleted: true,
          educationLevel: EducationLevel.UNDERGRADUATE,
          preferredStyle: ExplanationStyle.VISUAL,
        },
        usageQuota: {
          dailyCount: 5,
          dailyLimit: 50,
          windowResetAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      renderWithRouter(<LeftHistorySidebar />, {
        auth: {
          user: authUser,
          token: 'auth-token',
          quota: { used: 5, limit: 50, resetAt: new Date().toISOString() },
          authStatus: 'authenticated',
          error: null,
        },
        session: {
          sessionList: [
            {
              id: 's-1',
              _id: 's-1',
              topicQuery: 'Binary Search Trees',
              normalizedTitle: 'BST Data Structure',
              lastActiveMode: LearningMode.EXPLAIN,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          activeSession: null,
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          error: null,
          streamingState: {
            isStreaming: false,
            streamBuffer: '',
            streamError: null,
            activeTurnId: null,
            activeTurnMessage: null,
          },
          isInitializingExplain: false,
          explainError: null,
          isInitializingInteract: false,
          interactError: null,
          isGeneratingPractice: false,
          isSubmittingPractice: false,
          practiceError: null,
        },
      });

      // Renders history
      expect(screen.getByText(/recent topics \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('BST Data Structure')).toBeInTheDocument();

      // Renders user profile and quota badge
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /profile settings/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();

      // Does not render guest prompt
      expect(screen.queryByText(/no history in guest mode/i)).not.toBeInTheDocument();
    });
  });

  describe('2. Top Right Get Started Button', () => {
    it('renders Get Started button in top right of workspace landing page for guests', () => {
      renderWithRouter(<WorkspacePage />, {
        auth: {
          user: null,
          token: null,
          quota: null,
          authStatus: 'unauthenticated',
          error: null,
        },
      });

      // Form header
      expect(
        screen.getByRole('heading', { name: /what topic would you like to master/i })
      ).toBeInTheDocument();

      // Top right Get Started button exists
      const getStartedBtns = screen.getAllByRole('button', { name: /get started/i });
      expect(getStartedBtns.length).toBeGreaterThanOrEqual(1);

      // Click top-right button
      fireEvent.click(getStartedBtns[0]!);
      expect(screen.getByText('LoginPage Mock')).toBeInTheDocument();
    });

    it('renders Get Started button in StickyTopicHeader during active guest session', () => {
      const guestSession: TopicSessionDTO = {
        id: 'guest-session-1',
        _id: 'guest-session-1',
        userId: null,
        isGuest: true,
        topicQuery: 'Photosynthesis',
        normalizedTitle: 'Photosynthesis Mechanism',
        lastActiveMode: LearningMode.EXPLAIN,
        explainState: {
          status: ExplainStatus.READY,
          currentStepIndex: 0,
          cards: [
            {
              stepNumber: 1,
              stepType: ExplainStepType.INTUITION,
              title: 'Intuition',
              contentMarkdown: 'Solar energy to glucose',
              checkQuestion: null,
              checkAnswer: null,
            },
          ],
        },
        interactState: {
          status: InteractStatus.NOT_STARTED,
          activeMilestoneIndex: 0,
          strikeCount: 0,
          milestones: [],
          messages: [],
        },
        practiceState: {
          activeTier: PracticeTier.EASY,
          batches: {
            easy: {
              tier: PracticeTier.EASY,
              status: BatchStatus.NOT_STARTED,
              score: null,
              questions: [],
              userAnswers: [],
              completedAt: null,
            },
            medium: {
              tier: PracticeTier.MEDIUM,
              status: BatchStatus.LOCKED,
              score: null,
              questions: [],
              userAnswers: [],
              completedAt: null,
            },
            hard: {
              tier: PracticeTier.HARD,
              status: BatchStatus.LOCKED,
              score: null,
              questions: [],
              userAnswers: [],
              completedAt: null,
            },
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      renderWithRouter(<StickyTopicHeader />, {
        auth: {
          user: null,
          token: null,
          quota: null,
          authStatus: 'unauthenticated',
          error: null,
        },
        session: {
          sessionList: [],
          activeSession: guestSession,
          activeMode: LearningMode.EXPLAIN,
          isLoadingList: false,
          isLoadingSession: false,
          isCreatingSession: false,
          error: null,
          streamingState: {
            isStreaming: false,
            streamBuffer: '',
            streamError: null,
            activeTurnId: null,
            activeTurnMessage: null,
          },
          isInitializingExplain: false,
          explainError: null,
          isInitializingInteract: false,
          interactError: null,
          isGeneratingPractice: false,
          isSubmittingPractice: false,
          practiceError: null,
        },
      });

      expect(screen.getByText('Photosynthesis Mechanism')).toBeInTheDocument();
      const getStartedBtn = screen.getByRole('button', { name: /get started/i });
      expect(getStartedBtn).toBeInTheDocument();

      // LIVE-BUG-H1: on phones the header must wrap so the tabs get their own row instead of
      // overflowing over the menu button, clipping this CTA and hiding the title.
      const header = screen.getByTestId('sticky-topic-header');
      expect(header.className).toContain('flex-wrap');
      const menuBtn = screen.getByRole('button', { name: 'Open sidebar menu' });
      const tablist = screen.getByRole('tablist', { name: 'Learning Mode Switcher' });
      const tabsRow = tablist.parentElement!;
      expect(tabsRow.className).toContain('order-last');
      expect(tabsRow.className).toContain('w-full');
      expect(tablist.className).toContain('w-full');
      // Menu, title and CTA come before the tabs row, so the tabs never cover them.
      const following = Node.DOCUMENT_POSITION_FOLLOWING;
      expect(menuBtn.compareDocumentPosition(tabsRow) & following).toBeTruthy();
      expect(getStartedBtn.compareDocumentPosition(tabsRow) & following).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Photosynthesis Mechanism' }).className).toContain(
        'truncate'
      );
      // Short visible labels on phones keep the full accessible names.
      expect(screen.getByRole('tab', { name: 'Explain Mode' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Interact Mode' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Practice Mode' })).toBeInTheDocument();

      fireEvent.click(getStartedBtn);
      expect(screen.getByText('LoginPage Mock')).toBeInTheDocument();
    });
  });
});
