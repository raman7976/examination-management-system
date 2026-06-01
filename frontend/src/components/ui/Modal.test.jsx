import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Modal from './Modal.jsx';

const open = (props = {}) =>
  render(
    <Modal open title="Confirm" onClose={props.onClose} {...props}>
      <input aria-label="field" />
      <button>Inner action</button>
    </Modal>,
  );

describe('<Modal>', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}}>hidden</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an accessible dialog with a labelled title', () => {
    open({ onClose: vi.fn() });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    expect(screen.getByRole('heading', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('Escape closes when dismissible (the default)', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape does NOT close when dismissible={false}', () => {
    const onClose = vi.fn();
    open({ onClose, dismissible: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('backdrop click closes; clicking the dialog body does not', async () => {
    const onClose = vi.fn();
    open({ onClose });
    // Clicking the dialog content must NOT bubble to the backdrop.
    await userEvent.click(screen.getByRole('heading', { name: 'Confirm' }));
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the backdrop (role=presentation) closes.
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close (X) button calls onClose', async () => {
    const onClose = vi.fn();
    open({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close (X) button when not dismissible', () => {
    open({ onClose: vi.fn(), dismissible: false });
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
  });

  it('moves focus to the first focusable child on open', async () => {
    open({ onClose: vi.fn() });
    // Header close button is the first focusable element in the dialog.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus(),
    );
  });
});
