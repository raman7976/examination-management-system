import { useEffect, useState, useMemo } from 'react';
import { getSwapEligibleTargets, createSwapRequest } from '../../api/api.js';

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

// ─────────────────────────────────────────────────────────────────────────────
//  Modal: pick another invigilator's duty to swap into.
//
//  Two-step UX:
//    1. Pick a target from the eligible list (server-side feasibility filtered).
//    2. Confirm step shows BOTH sides side-by-side, with an optional note.
// ─────────────────────────────────────────────────────────────────────────────
export default function SwapRequestModal({ duty, onClose, onSuccess }) {
  const [eligible, setEligible] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getSwapEligibleTargets(duty.assignment_id);
        if (!mounted) return;
        setEligible(res.data?.eligible || []);
      } catch (err) {
        if (!mounted) return;
        setError(err.response?.data?.message || 'Failed to load swap targets.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [duty.assignment_id]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return eligible;
    const q = filter.toLowerCase();
    return eligible.filter((e) =>
      [e.other_user?.full_name, e.other_user?.employee_id, e.room_name, e.course_codes, e.exam_day]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [eligible, filter]);

  const submit = async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      await createSwapRequest({
        requester_assignment_id: duty.assignment_id,
        target_assignment_id:    picked.assignment_id,
        note: note.trim() || undefined,
      });
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send swap request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-brand-500">Request a Swap</h2>
            <p className="text-xs text-textMuted mt-0.5">
              Your duty: {fmtDate(duty.exam_date)} · {fmtTime(duty.start_time)}–{fmtTime(duty.end_time)} · {duty.room_name}
            </p>
          </div>
          <button onClick={onClose} className="text-textFaint hover:text-text text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-3 py-2 text-sm mb-3">
              {error}
            </div>
          )}

          {!picked ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search by invigilator, room, course, day…"
                  className="flex-1 bg-surface2 border border-border text-text rounded-lg p-2.5 text-sm focus:outline-none focus:border-brand-500 shadow-sm"
                />
                <span className="text-xs text-textFaint">{filtered.length} of {eligible.length}</span>
              </div>

              {loading ? (
                <div className="text-center text-textFaint p-10">Loading eligible swap targets…</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-textMuted p-10">
                  {eligible.length === 0
                    ? 'No invigilators are eligible to swap with this duty.'
                    : 'No matches for your filter.'}
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface2 text-[11px] uppercase text-textMuted border-b border-border shadow-sm">
                      <tr>
                        <th className="p-2.5 text-left font-bold">Invigilator</th>
                        <th className="p-2.5 text-left font-bold">Their Duty</th>
                        <th className="p-2.5 text-left font-bold">Room / Courses</th>
                        <th className="p-2.5 text-center font-bold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e) => (
                        <tr key={e.assignment_id} className="border-b border-border hover:bg-brand-500/5/40 transition-colors">
                          <td className="p-2.5">
                            <div className="font-semibold text-text text-sm">{e.other_user.full_name}</div>
                            <div className="text-[11px] text-textFaint">
                              {ROLE_LABEL[e.other_user.role] || e.other_user.role}
                              {e.other_user.employee_id && ` · ${e.other_user.employee_id}`}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="text-xs text-text">{fmtDate(e.exam_date)}</div>
                            <div className="font-mono text-[11px] text-textMuted">
                              {fmtTime(e.start_time)}–{fmtTime(e.end_time)}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-text text-sm">{e.room_name}</div>
                            <div className="text-[11px] text-textFaint">{e.course_codes || '—'}</div>
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => setPicked(e)}
                              className="px-3 py-1 bg-brand-500 text-white text-xs font-bold rounded-md hover:bg-brand-600 transition-colors cursor-pointer"
                            >
                              Pick
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            // ── Confirm step ───────────────────────────────────────────────
            <div>
              <p className="text-sm text-textMuted mb-4">
                You'll trade duties with <b>{picked.other_user.full_name}</b>. After both they and the admin approve,
                <b> you'll take their slot+room</b> and they'll take yours.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-border rounded-lg p-3 bg-surface2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-textFaint mb-1">You give up</div>
                  <div className="text-sm font-semibold text-text">{fmtDate(duty.exam_date)}</div>
                  <div className="font-mono text-xs text-textMuted">{fmtTime(duty.start_time)}–{fmtTime(duty.end_time)}</div>
                  <div className="text-sm text-text mt-1">{duty.room_name}</div>
                  <div className="text-[11px] text-textFaint">{duty.course_codes || '—'}</div>
                </div>
                <div className="border border-brand-500/30 rounded-lg p-3 bg-brand-500/5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">You take</div>
                  <div className="text-sm font-semibold text-text">{fmtDate(picked.exam_date)}</div>
                  <div className="font-mono text-xs text-textMuted">{fmtTime(picked.start_time)}–{fmtTime(picked.end_time)}</div>
                  <div className="text-sm text-text mt-1">{picked.room_name}</div>
                  <div className="text-[11px] text-textFaint">{picked.course_codes || '—'}</div>
                </div>
              </div>

              <label className="block text-[11px] font-bold uppercase tracking-wider text-textFaint mb-1">
                Optional note for {picked.other_user.full_name}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. I have a medical appointment on that morning…"
                className="w-full bg-surface2 border border-border rounded-lg p-2.5 text-sm focus:outline-none focus:border-brand-500 shadow-sm"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3">
          {picked ? (
            <button onClick={() => setPicked(null)} className="text-sm text-textMuted hover:text-text cursor-pointer">
              ← Pick a different invigilator
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-surface2 text-text text-xs font-bold rounded-md hover:bg-textFaint cursor-pointer">
              Cancel
            </button>
            {picked && (
              <button
                onClick={submit}
                disabled={submitting}
                className={`px-4 py-2 text-xs font-bold rounded-md transition-colors ${submitting
                  ? 'bg-surface2 text-textFaint cursor-not-allowed'
                  : 'bg-brand-500 text-white hover:bg-brand-600 cursor-pointer'}`}
              >
                {submitting ? 'Sending…' : 'Send Swap Request'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
