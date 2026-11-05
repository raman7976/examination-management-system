import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvigilationProgress from './InvigilationProgress.jsx';
import { deriveInvigilationSteps } from '../utils/invigilationProgress.js';

const progress = (schedule = {}) => ({
    seating: { slots_total: 5, slots_with_exams: 5, slots_with_seating: 5, rooms: 30 },
    targets: { faculty: 3, phd_student: 2, lab_staff: 1 },
    schedule: { duties: 63, invigilators: 20, required: 63, unfilled_positions: 0, understaffed_rooms: 0, unassigned_rooms: 0, orphan_duties: 0, ...schedule },
    swaps: { pending_admin: 2, pending_peer: 0 },
});

const renderTracker = (p, { draftCount = 0 } = {}) => {
    const onAction = vi.fn();
    render(
        <InvigilationProgress
            derived={deriveInvigilationSteps(p, { draftCount })}
            progress={p}
            onAction={onAction}
            pdfItems={[{ key: 'chart', label: 'Duty chart', onSelect: vi.fn() }]}
        />,
    );
    return { onAction };
};

describe('InvigilationProgress', () => {
    it('shows the next step with a button that runs its action', async () => {
        const { onAction } = renderTracker(progress(), { draftCount: 5 });
        expect(screen.getByText('3 of 4 steps done')).toBeInTheDocument();
        expect(screen.getByText('Next step:')).toBeInTheDocument();
        // On the step card and repeated in the "Next step" bar.
        expect(screen.getAllByText('5 unsaved changes: click Save Changes to publish them.')).toHaveLength(2);
        await userEvent.click(screen.getByRole('button', { name: /review & save/i }));
        expect(onAction).toHaveBeenCalledWith({ label: 'Review & save', tab: 'schedule' });
    });

    it('confirms completion and offers the follow-up actions', async () => {
        const { onAction } = renderTracker(progress());
        expect(screen.getByText('Schedule complete')).toBeInTheDocument();
        expect(screen.getByText('Invigilation schedule is complete')).toBeInTheDocument();
        expect(screen.queryByText('Next step:')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /2 swap requests to review/i }));
        expect(onAction).toHaveBeenCalledWith({ route: '/dashboard/swap-approval' });
    });

    it('marks the step that needs attention', () => {
        renderTracker(progress({ unfilled_positions: 2, understaffed_rooms: 1 }));
        expect(screen.queryByText('Schedule complete')).not.toBeInTheDocument();
        const current = screen.getByRole('button', { current: 'step' });
        expect(current).toHaveTextContent('All rooms staffed');
        expect(current).toHaveTextContent('2 positions unfilled in 1 room.');
    });
});
