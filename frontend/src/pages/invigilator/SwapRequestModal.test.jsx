import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import SwapRequestModal from './SwapRequestModal.jsx';
import { server } from '../../../test/setup/mswServer.js';

const SWAP_URL = '/api/invigilator-scheduling/swap-requests';

// The clicked invigilator's duty (fixed). assignment_id 100 is the duty I'd
// receive in a swap — it must never appear in MY offer list.
const target = {
  assignment_id: 100,
  user_id: 55,
  full_name: 'Tara Target',
  employee_id: 'EMP55',
  exam_date: '2026-06-01',
  start_time: '09:00:00',
  end_time: '12:00:00',
  room_name: 'TARGET_ROOM',
  role: 'faculty',
  course_codes: 'CS101',
};

// My duties — one collides with the target (must be filtered out), two are
// genuine offers.
const myDuties = [
  { assignment_id: 100, exam_date: '2026-06-01', start_time: '09:00:00', end_time: '12:00:00', room_name: 'EXCLUDED_ROOM', course_codes: 'X' },
  { assignment_id: 101, exam_date: '2026-06-02', start_time: '09:00:00', end_time: '12:00:00', room_name: 'OFFER_ROOM_A', course_codes: 'CS201' },
  { assignment_id: 102, exam_date: '2026-06-03', start_time: '14:00:00', end_time: '17:00:00', room_name: 'OFFER_ROOM_B', course_codes: 'CS301' },
];

const renderModal = (props = {}) =>
  render(
    <SwapRequestModal
      target={target}
      myDuties={myDuties}
      onClose={props.onClose || vi.fn()}
      onSuccess={props.onSuccess || vi.fn()}
    />,
  );

describe('<SwapRequestModal>', () => {
  it('opens in swap mode and shows the target duty block', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Request a Swap' })).toBeInTheDocument();
    expect(screen.getByText('TARGET_ROOM')).toBeInTheDocument();
  });

  it('switches to cover mode (different heading, no target-take block)', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('button', { name: /They cover mine/i }));
    expect(screen.getByRole('heading', { name: 'Ask Someone to Cover' })).toBeInTheDocument();
    // In cover mode the "you would take this" target block is gone.
    expect(screen.queryByText(/would take this/i)).not.toBeInTheDocument();
  });

  it('excludes the targeted duty from the offer list', () => {
    renderModal();
    expect(screen.getByText('OFFER_ROOM_A')).toBeInTheDocument();
    expect(screen.getByText('OFFER_ROOM_B')).toBeInTheDocument();
    // The duty whose assignment_id equals the target's is never offerable.
    expect(screen.queryByText('EXCLUDED_ROOM')).not.toBeInTheDocument();
  });

  it('clamps the optional note to 500 characters', () => {
    renderModal();
    const note = screen.getByPlaceholderText(/medical appointment/i);
    fireEvent.change(note, { target: { value: 'x'.repeat(600) } });
    expect(note.value).toHaveLength(500);
  });

  it('posts a SWAP body (target_assignment_id) and calls onSuccess', async () => {
    let captured;
    server.use(
      http.post(SWAP_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ request: { id: 1, status: 'pending_peer' } }, { status: 201 });
      }),
    );
    const onSuccess = vi.fn();
    renderModal({ onSuccess });

    // Pick one of my duties, then send.
    await userEvent.click(screen.getByText('OFFER_ROOM_A'));
    await userEvent.click(screen.getByRole('button', { name: 'Send Swap Request' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(captured).toMatchObject({
      request_type: 'swap',
      requester_assignment_id: 101,
      target_assignment_id: 100,
    });
    expect(captured.target_user_id).toBeUndefined();
  });

  it('posts a COVER body (target_user_id, no target_assignment_id)', async () => {
    let captured;
    server.use(
      http.post(SWAP_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ request: { id: 2, status: 'pending_peer' } }, { status: 201 });
      }),
    );
    const onSuccess = vi.fn();
    renderModal({ onSuccess });

    await userEvent.click(screen.getByRole('button', { name: /They cover mine/i }));
    await userEvent.click(screen.getByText('OFFER_ROOM_B'));
    await userEvent.click(screen.getByRole('button', { name: 'Send Cover Request' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(captured).toMatchObject({
      request_type: 'cover',
      requester_assignment_id: 102,
      target_user_id: 55,
    });
    expect(captured.target_assignment_id).toBeUndefined();
  });

  it('surfaces the server error message and does not call onSuccess', async () => {
    server.use(
      http.post(SWAP_URL, () =>
        HttpResponse.json({ message: 'That duty is no longer swappable.' }, { status: 409 }),
      ),
    );
    const onSuccess = vi.fn();
    renderModal({ onSuccess });

    await userEvent.click(screen.getByText('OFFER_ROOM_A'));
    await userEvent.click(screen.getByRole('button', { name: 'Send Swap Request' }));

    expect(await screen.findByText('That duty is no longer swappable.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the right empty-state per mode and disables submit when nothing to offer', async () => {
    render(<SwapRequestModal target={target} myDuties={[]} onClose={vi.fn()} onSuccess={vi.fn()} />);
    // swap mode default
    expect(screen.getByText('You have no other duty to offer in exchange.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Swap Request' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /They cover mine/i }));
    expect(screen.getByText('You have no duty to hand over.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Cover Request' })).toBeDisabled();
  });

  it('Cancel button invokes onClose', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
