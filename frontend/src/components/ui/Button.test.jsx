import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Button from './Button.jsx';

describe('<Button>', () => {
  it('renders its children and defaults to type="button" + primary/md', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
    // primary variant + md size class signatures
    expect(btn.className).toContain('bg-brand-500');
    expect(btn.className).toContain('h-10');
  });

  it('applies the requested variant and size classes', () => {
    render(<Button variant="danger" size="sm">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-danger');
    expect(btn.className).toContain('h-8');
  });

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading shows a spinner, disables the button, and keeps the label', () => {
    const { container } = render(<Button loading>Submit</Button>);
    const btn = screen.getByRole('button', { name: 'Submit' });
    expect(btn).toBeDisabled();
    expect(container.querySelector('svg.animate-spin')).toBeTruthy();
  });

  it('hides iconLeft while loading but renders it otherwise', () => {
    const Icon = () => <span data-testid="left-icon" />;
    const { rerender } = render(<Button iconLeft={<Icon />}>Next</Button>);
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();

    rerender(<Button loading iconLeft={<Icon />}>Next</Button>);
    expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument();
  });

  it('forwards a submit type for use inside forms', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });
});
