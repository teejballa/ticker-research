import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// Wave 4 exports CompositeHeadline
describe('CompositeHeadline (REASON-03)', () => {
  it('renders "X%" and CI range when gate_status = active', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CompositeHeadline } = require('@/components/CompositeHeadline');
    render(<CompositeHeadline prob={0.72} ciLow={0.64} ciHigh={0.79} classCount={3} gateStatus="active" />);
    expect(screen.getByText(/72%/)).toBeTruthy();
    expect(screen.getByText(/64%.*79%/)).toBeTruthy();
  });
  it('renders "insufficient signal coverage" when gate_status = insufficient_coverage', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CompositeHeadline } = require('@/components/CompositeHeadline');
    render(<CompositeHeadline prob={null} ciLow={null} ciHigh={null} classCount={1} gateStatus="insufficient_coverage" />);
    expect(screen.getByText(/insufficient signal coverage/i)).toBeTruthy();
  });
});
