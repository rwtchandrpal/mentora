// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import mermaid from 'mermaid';
import { MermaidDiagram } from '../components/common/MermaidDiagram.js';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue({}),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mocked-svg"></svg>' }),
  },
}));

describe('LIVE-FIX-013: Mermaid theme', () => {
  it('uses the dark theme, matching the dark slate diagram panel', async () => {
    render(<MermaidDiagram code="graph TD; A-->B" />);
    await screen.findByTestId('mermaid-diagram');
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
});
