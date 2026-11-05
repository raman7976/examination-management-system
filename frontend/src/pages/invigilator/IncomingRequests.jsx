import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getIncomingSwapRequests, peerRespondToSwap } from '../../api/api.js';

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';
const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

// ─────────────────────────────────────────────────────────────────────────────
//  Incoming Requests — swap requests sent TO me, awaiting my response.
//  Each card shows both sides; Approve passes it on to the admin queue,
//  Reject terminates the request.
// ─────────────────────────────────────────────────────────────────────────────
export default function IncomingRequests() {
  const ctx = useOutletContext() || {};
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // For the reject path — opening this set means show a textarea for the note.
  const [rejectFormFor, setRejectFormFor] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getIncomingSwapRequests();
      setRequests(res.data?.requests || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load incoming requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = async (id, accept, note) => {
    setBusyId(id);
    try {
      await peerRespondToSwap(id, { accept, note });
      toast.success(accept ? 'Forwarded to admin for final approval.' : 'Swap request rejected.');
      setRejectFormFor(null);
      setRejectNote('');
      await load();
      ctx.refreshIncoming?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to respond to swap request.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-500 tracking-tight">Incoming Swap Requests</h1>
        <p className="text-sm text-textMuted mt-1">
          Other invigilators have asked to swap duties with you. Approve to forward to the admin for final approval.
        </p>
      </div>

      {loading && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textFaint shadow-sm">Loading…</div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textMuted shadow-sm">
          You have no pending swap requests right now.
        </div>
      )}

      <div className="space-y-3">
        {requests.map((r) => {
          const isBusy = busyId === r.id;
          const isRejecting = rejectFormFor === r.id;
          const isCover = r.request_type === 'cover';
          return (
            <div key={r.id} className="bg-surface rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-textFaint mb-1">From</div>
                  <div className="text-sm font-semibold text-text">{r.requester.full_name}</div>
                  <div className="text-[11px] text-textFaint">
                    {ROLE_LABEL[r.requester.role] || r.requester.role}
                    {r.requester.employee_id && ` · ${r.requester.employee_id}`}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isCover ? 'bg-warning/15 text-warning' : 'bg-brand-500/15 text-brand-500'}`}>
                    {isCover ? 'Cover request' : 'Swap'}
                  </span>
                  <div className="text-[11px] text-textFaint">
                    Requested {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {isCover && (
                <div className="mb-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-text">
                  <b>{r.requester.full_name}</b> asks you to <b>take over</b> the duty below.
                  You would do it on their behalf; you give up nothing in return.
                </div>
              )}

              <div className={`grid gap-3 mb-3 ${isCover ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div className="border border-brand-500/30 rounded-lg p-3 bg-brand-500/5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1">
                    {isCover ? 'Their duty — you would take this over' : 'Their duty (you would take this)'}
                  </div>
                  <div className="text-sm font-semibold text-text">{fmtDate(r.requester.exam_date)}</div>
                  <div className="font-mono text-xs text-textMuted">{fmtTime(r.requester.start_time)}–{fmtTime(r.requester.end_time)}</div>
                  <div className="text-sm text-text mt-1">{r.requester.room_name}</div>
                  <div className="text-[11px] text-textFaint">{r.requester.course_codes || '—'}</div>
                </div>
                {!isCover && (
                  <div className="border border-border rounded-lg p-3 bg-surface2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-textFaint mb-1">Your duty (they would take this)</div>
                    <div className="text-sm font-semibold text-text">{fmtDate(r.target.exam_date)}</div>
                    <div className="font-mono text-xs text-textMuted">{fmtTime(r.target.start_time)}–{fmtTime(r.target.end_time)}</div>
                    <div className="text-sm text-text mt-1">{r.target.room_name}</div>
                    <div className="text-[11px] text-textFaint">{r.target.course_codes || '—'}</div>
                  </div>
                )}
              </div>

              {r.note && (
                <div className="mb-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-text">
                  <span className="font-bold text-warning">Note:</span> {r.note}
                </div>
              )}

              {isRejecting ? (
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-textFaint mb-1">
                      Optional reason
                    </label>
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value.slice(0, 500))}
                      rows={2}
                      className="w-full bg-surface2 border border-border rounded-lg p-2 text-xs focus:outline-none focus:border-brand-500 shadow-sm"
                    />
                  </div>
                  <button
                    onClick={() => respond(r.id, false, rejectNote.trim() || undefined)}
                    disabled={isBusy}
                    className={`px-3 py-2 text-xs font-bold rounded-md ${isBusy ? 'bg-surface2 text-textFaint cursor-not-allowed' : 'bg-danger text-white hover:bg-danger/90 cursor-pointer'}`}
                  >
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => { setRejectFormFor(null); setRejectNote(''); }}
                    className="px-3 py-2 bg-surface2 text-text text-xs font-bold rounded-md hover:bg-textFaint cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => respond(r.id, true)}
                    disabled={isBusy}
                    className={`px-4 py-2 text-xs font-bold rounded-md ${isBusy ? 'bg-surface2 text-textFaint cursor-not-allowed' : 'bg-success text-white hover:bg-success/90 cursor-pointer'}`}
                  >
                    Approve & forward to admin
                  </button>
                  <button
                    onClick={() => setRejectFormFor(r.id)}
                    disabled={isBusy}
                    className="px-4 py-2 bg-surface text-danger text-xs font-bold rounded-md border border-danger/30 hover:bg-danger/10 hover:border-danger/50 cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
