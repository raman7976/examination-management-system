import { useMemo, useState } from 'react';
import { createSwapRequest } from '../../api/api.js';

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

// ─────────────────────────────────────────────────────────────────────────────
//  Swap / Cover modal — TARGET-FIRST.
//
//  Opened by clicking another invigilator's chip in the grid. The clicked
//  person (`target`) is fixed. Two modes:
//
//   • SWAP  — a two-way trade. I give up one of MY duties and take the target's
//     clicked duty in exchange. Both people keep one duty each.
//
//   • COVER — I hand one of MY duties entirely to the target. They do both
//     their own duty AND mine; I do nothing for that slot, and my duty becomes
//     "due" — the next exam period's generation gives me one extra to balance.
//
//  Either way the requester chooses which of THEIR OWN duties is involved.
//  On submit a request is created (pending_peer). Nothing on the schedule
//  changes until the peer AND the admin both approve.
// ─────────────────────────────────────────────────────────────────────────────
export default function SwapRequestModal({ target, myDuties = [], onClose, onSuccess }) {
  const [mode, setMode] = useState('swap'); // 'swap' | 'cover'

  // Can't offer the very duty we're targeting; everything else is fair game
  // (backend re-validates feasibility and returns a clear error).
  const offerable = useMemo(
    () => myDuties.filter((d) => d.assignment_id !== target.assignment_id),
    [myDuties, target.assignment_id]
  );

  const [picked, setPicked] = useState(offerable.length === 1 ? offerable[0] : null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'cover') {
        await createSwapRequest({
          request_type: 'cover',
          requester_assignment_id: picked.assignment_id,
          target_user_id: target.user_id,
          note: note.trim() || undefined,
        });
      } else {
        await createSwapRequest({
          request_type: 'swap',
          requester_assignment_id: picked.assignment_id,
          target_assignment_id: target.assignment_id,
          note: note.trim() || undefined,
        });
      }
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send request.');
    } finally {
      setSubmitting(false);
    }
  };

  const TabBtn = ({ value, label, sub }) => {
    const active = mode === value;
    return (
      <button
        onClick={() => setMode(value)}
        className={`flex-1 text-left px-4 py-3 rounded-lg border transition-all cursor-pointer ${
          active
            ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
            : 'border-border bg-surface2 hover:border-brand-500/50'
        }`}
      >
        <div className={`text-sm font-bold ${active ? 'text-brand-500' : 'text-text'}`}>{label}</div>
        <div className="text-[11px] text-textFaint mt-0.5">{sub}</div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-brand-500">
              {mode === 'cover' ? 'Ask Someone to Cover' : 'Request a Swap'}
            </h2>
            <p className="text-xs text-textMuted mt-0.5">
              with <b className="text-text">{target.full_name}</b>
              {target.employee_id ? ` · ${target.employee_id}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-textFaint hover:text-text text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <TabBtn value="swap" label="Swap duties" sub="Trade one of mine for theirs" />
            <TabBtn value="cover" label="They cover mine" sub="Give my duty away (becomes due)" />
          </div>

          {/* Target's duty — only meaningful for a swap */}
          {mode === 'swap' && (
            <div className="border border-brand-500/30 rounded-lg p-3 bg-brand-500/5 mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">
                {target.full_name}&apos;s duty — you would take this
              </div>
              <div className="text-sm font-semibold text-text">{fmtDate(target.exam_date)}</div>
              <div className="font-mono text-xs text-textMuted">{fmtTime(target.start_time)}–{fmtTime(target.end_time)}</div>
              <div className="text-sm text-text mt-1">
                {target.room_name}
                <span className="text-[11px] text-textFaint"> · {ROLE_LABEL[target.role] || target.role}</span>
              </div>
              <div className="text-[11px] text-textFaint">{target.course_codes || '—'}</div>
            </div>
          )}

          {mode === 'cover' && (
            <div className="border border-warning/30 rounded-lg p-3 bg-warning/5 mb-4 text-xs text-textMuted">
              <b className="text-text">{target.full_name}</b> would take over the duty you pick below — doing it
              <i> instead of you</i>. Your duty count drops, so the next exam period gives you one extra to balance it out.
            </div>
          )}

          {offerable.length === 0 ? (
            <div className="text-center text-textMuted bg-surface2 border border-border rounded-lg p-6 text-sm">
              {mode === 'cover'
                ? 'You have no duty to hand over.'
                : 'You have no other duty to offer in exchange.'}
            </div>
          ) : (
            <>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-textFaint mb-2">
                {mode === 'cover' ? 'Which of your duties do you want covered?' : 'Which of your duties will you give up?'}
              </label>
              <div className="space-y-2 mb-4">
                {offerable.map((d) => {
                  const active = picked?.assignment_id === d.assignment_id;
                  return (
                    <button
                      key={d.assignment_id}
                      onClick={() => setPicked(d)}
                      className={`w-full text-left border rounded-lg p-3 transition-all cursor-pointer ${
                        active
                          ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                          : 'border-border bg-surface2 hover:border-brand-500/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-text">{fmtDate(d.exam_date)}</span>
                        <span className="font-mono text-[11px] text-textMuted">
                          {fmtTime(d.start_time)}–{fmtTime(d.end_time)}
                        </span>
                      </div>
                      <div className="text-sm text-text mt-0.5">{d.room_name}</div>
                      <div className="text-[11px] text-textFaint">{d.course_codes || '—'}</div>
                    </button>
                  );
                })}
              </div>

              <label className="block text-[11px] font-bold uppercase tracking-wider text-textFaint mb-1">
                Optional note for {target.full_name}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. I have a medical appointment that morning…"
                className="w-full bg-surface2 border border-border rounded-lg p-2.5 text-sm focus:outline-none focus:border-brand-500 shadow-sm"
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-surface2 text-text text-xs font-bold rounded-md hover:bg-border cursor-pointer">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !picked}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-colors ${
              submitting || !picked
                ? 'bg-surface2 text-textFaint cursor-not-allowed'
                : 'bg-brand-500 text-white hover:bg-brand-600 cursor-pointer'
            }`}
          >
            {submitting ? 'Sending…' : mode === 'cover' ? 'Send Cover Request' : 'Send Swap Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
