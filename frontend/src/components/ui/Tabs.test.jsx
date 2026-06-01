import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Tabs from './Tabs.jsx';

const TABS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('<Tabs>', () => {
  it('renders a button per tab', () => {
    render(<Tabs tabs={TABS} value="a" onChange={() => {}} />);
    for (const t of TABS) {
      expect(screen.getByRole('button', { name: t.label })).toBeInTheDocument();
    }
  });

  it('marks the active tab with the brand colour and others muted', () => {
    render(<Tabs tabs={TABS} value="b" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Beta' }).className).toContain('text-brand-500');
    expect(screen.getByRole('button', { name: 'Alpha' }).className).toContain('text-textMuted');
  });

  it('calls onChange with the clicked tab value', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('does not fire onChange merely from rendering', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders an optional per-tab icon', () => {
    const withIcon = [{ value: 'a', label: 'Alpha', icon: <span data-testid="ic" /> }];
    render(<Tabs tabs={withIcon} value="a" onChange={() => {}} />);
    expect(screen.getByTestId('ic')).toBeInTheDocument();
  });
});
