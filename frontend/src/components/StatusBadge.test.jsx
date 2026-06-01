import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import StatusBadge from './StatusBadge.jsx';

describe('<StatusBadge>', () => {
  // Every status the swap state machine can emit → its human label.
  const CASES = [
    ['pending_peer', 'Awaiting peer'],
    ['pending_admin', 'Awaiting admin'],
    ['approved', 'Approved'],
    ['rejected_by_peer', 'Rejected (peer)'],
    ['rejected_by_admin', 'Rejected (admin)'],
    ['cancelled', 'Cancelled'],
  ];

  it.each(CASES)('maps %s → "%s"', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('falls back to the raw status string for an unknown value', () => {
    render(<StatusBadge status="weird_unknown" />);
    expect(screen.getByText('weird_unknown')).toBeInTheDocument();
  });

  it('uses the colour palette mapped to the status', () => {
    const { container } = render(<StatusBadge status="approved" />);
    const pill = container.firstChild;
    expect(pill.className).toContain('bg-emerald-100');
    expect(pill.className).toContain('text-emerald-800');
  });
});
