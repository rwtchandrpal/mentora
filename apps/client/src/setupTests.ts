import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { configureServerWake } from './services/apiClient.js';

// Component tests let incidental requests fail with network errors; waiting for the
// server to "wake up" there would only add delays. The wake-and-retry tests enable it.
configureServerWake({ enabled: false });

afterEach(() => {
  cleanup();
});
