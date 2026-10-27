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

export const createAppStore = (preloadedState?: Partial<RootState>) => {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActionPaths: ['payload.error', 'error'],
          ignoredPaths: ['auth.error', 'session.error'],
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
