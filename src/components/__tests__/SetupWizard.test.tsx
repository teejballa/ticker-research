// src/components/__tests__/SetupWizard.test.tsx
// Wave 0 stubs for SetupWizard component.
// Tests fail at runtime (module not found) — not at parse time.
import { describe, it, expect } from 'vitest';

describe('SetupWizard', () => {
  it('renders without crashing', async () => {
    const { SetupWizard } = await import('../SetupWizard');
    expect(SetupWizard).toBeDefined();
  });

  it('shows install step as active when notebooklmOk is false', async () => {
    const { SetupWizard } = await import('../SetupWizard');
    expect(SetupWizard).toBeDefined();
  });

  it('shows Connect Account button when authOk is false', async () => {
    const { SetupWizard } = await import('../SetupWizard');
    expect(SetupWizard).toBeDefined();
  });
});
