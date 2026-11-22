import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from './authSlice.js';
import sessionReducer from './sessionSlice.js';
import uiReducer from './uiSlice.js';
import { logout } from './authSlice.js';
import { setServerWaking } from './uiSlice.js';
import { setServerWakeListener, setUnauthorizedHandler } from '../services/apiClient.js';

export const rootReducer = combineReducers({
  auth: authReducer,
  session: sessionReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export type PreloadedRootState = {
  [K in keyof RootState]?: Partial<RootState[K]>;
};

export const createAppStore = (preloadedState?: PreloadedRootState) => {
  const appStore = configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as unknown as undefined,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActionPaths: ['payload.error', 'error'],
          ignoredPaths: [
            'auth.error',
            'session.error',
            'session.explainError',
            'session.interactError',
            'session.practiceError',
          ],
        },
      }),
  });

  // An expired token logs the user out on the first rejected request (A-09). The app
  // creates a single store; tests that build their own store re-bind the handler to it.
  setUnauthorizedHandler(() => {
    if (appStore.getState().auth.token) {
      appStore.dispatch(logout());
    }
  });

  // Drives the "server is waking up" banner while the API client waits (LIVE-BUG-H4).
  setServerWakeListener((isWaking) => {
    appStore.dispatch(setServerWaking(isWaking));
  });

  return appStore;
};

export const store = createAppStore();

export type AppDispatch = typeof store.dispatch;

export * from './authSlice.js';
export * from './sessionSlice.js';
export * from './uiSlice.js';
export * from './hooks.js';
