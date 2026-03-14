// src/components/__tests__/ResearchProgress.test.tsx
// Wave 0 stubs for ResearchProgress component.
// These fail at runtime (module not found) until Task 2 creates the component.

import { describe, it, expect } from 'vitest';

describe('ResearchProgress', () => {
  it('renders without crashing', async () => {
    const mod = await import('../ResearchProgress');
    expect(mod.default).toBeDefined();
  });

  it('shows spinning icon for active step', async () => {
    const mod = await import('../ResearchProgress');
    expect(mod.default).toBeDefined();
  });

  it('calls onComplete when result event arrives', async () => {
    const mod = await import('../ResearchProgress');
    expect(mod.default).toBeDefined();
  });
});
