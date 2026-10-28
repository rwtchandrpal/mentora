import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from './authSlice.js';
import sessionReducer from './sessionSlice.js';
import uiReducer from './uiSlice.js';

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
  return configureStore({
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
          ],
        },
      }),
  });
};

export const store = createAppStore();

export type AppDispatch = typeof store.dispatch;

export * from './authSlice.js';
export * from './sessionSlice.js';
export * from './uiSlice.js';
export * from './hooks.js';
