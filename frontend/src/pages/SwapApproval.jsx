import { useEffect, useState, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { adminListSwapRequests, adminRespondToSwap } from '../api/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { usePeriod } from '../context/usePeriod.js';

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';
const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

const HISTORY_FILTERS = [
  { key: 'all',               label: 'All'           },
  { key: 'approved',          label: 'Approved'      },
  { key: 'rejected_by_admin', label: 'Rejected'      },
  { key: 'rejected_by_peer',  label: 'Peer rejected' },
  { key: 'cancelled',         label: 'Cancelled'     },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Swap Approval — admin queue + history.
//  Top section = pending_admin (action required).
//  Bottom section = full history with status filter.
// ─────────────────────────────────────────────────────────────────────────────
export default function SwapApproval() {
  const { periodVersion } = usePeriod();
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [rejectFormFor, setRejectFormFor] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async (filter = historyFilter) => {
    setLoading(true);
    setError(null);
    try {
      // Two parallel fetches — pending queue (status=pending_admin) + history (status=<filter>).
      const [pRes, hRes] = await Promise.all([
        adminListSwapRequests('pending_admin'),
        adminListSwapRequests(filter),
      ]);
      setPending(pRes.data?.requests || []);
      // History query may include the pending rows when filter='all' — strip duplicates by id.
      const hRaw = hRes.data?.requests || [];
      const pIds = new Set((pRes.data?.requests || []).map((r) => r.id));
      setHistory(filter === 'pending_admin' ? [] : hRaw.filter((r) => !pIds.has(r.id)));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load swap requests.');
    } finally {
      setLoading(false);
    }
  }, [historyFilter]);

  useEffect(() => { load(); }, [load, periodVersion]);

  const respond = async (id, accept, note) => {
    setBusyId(id);
    try {
      const res = await adminRespondToSwap(id, { accept, note });
      toast.success(accept
        ? (res.data?.message || 'Swap approved and executed.')
        : 'Swap request rejected.'
      );
      setRejectFormFor(null);
      setRejectNote('');
      await load();
    } catch (err) {
      // Defensive failure (409 from backend) carries a status='rejected_by_admin' note —
      // reload so the admin sees the system-generated rejection in the history.
      const msg = err.response?.data?.message || 'Failed to respond to swap request.';
      toast.error(msg);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-[1300px]">
      <ToastContainer position="top-right" autoClose={4000} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-500 tracking-tight">Swap Approval</h1>
        <p className="text-sm text-textMuted mt-1">
          Peer-approved swap requests awaiting your final approval. Approving executes the swap atomically.
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* ── Pending queue ─────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-textMuted mb-3">
          Pending admin review {pending.length > 0 && <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 bg-warning text-white rounded-full text-[10px]">{pending.length}</span>}
        </h2>

        {loading ? (
          <div className="bg-surface rounded-xl border border-border p-10 text-center text-textFaint shadow-sm">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-8 text-center text-textMuted shadow-sm">
            No swap requests waiting for admin approval.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => {
              const isBusy = busyId === r.id;
              const isRejecting = rejectFormFor === r.id;
              return (
                <div key={r.id} className="bg-surface rounded-xl border border-warning/30 p-5 shadow-sm">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <PartyCard label="Requester" person={r.requester} side={r.requester} />
                    <PartyCard label="Target"    person={r.target}    side={r.target}    accent />
                  </div>

                  {r.note && (
                    <div className="mb-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-text">
                      <span className="font-bold text-warning">Note:</span> {r.note}
                    </div>
                  )}

                  <div className="text-[11px] text-textFaint mb-3">
                    Requested {new Date(r.created_at).toLocaleString()} ·
                    Peer approved {r.peer_responded_at ? new Date(r.peer_responded_at).toLocaleString() : '—'}
                  </div>

                  {isRejecting ? (
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="flex-1 min-w-[240px]">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-textFaint mb-1">
                          Reason (optional, stored on the request)
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
                        Approve &amp; execute swap
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
        )}
      </section>

      {/* ── History table ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-textMuted">All requests</h2>
          <div className="flex gap-1 bg-surface2 rounded-lg p-1">
            {HISTORY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setHistoryFilter(f.key); load(f.key); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${historyFilter === f.key ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:text-text'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-8 text-center text-textMuted shadow-sm">
            No requests match this filter.
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface2 text-xs uppercase text-textMuted border-b border-border shadow-sm">
                <tr>
                  <th className="p-3 font-bold tracking-wider">Created</th>
                  <th className="p-3 font-bold tracking-wider">Requester</th>
                  <th className="p-3 font-bold tracking-wider">Their duty</th>
                  <th className="p-3 font-bold tracking-wider">Target</th>
                  <th className="p-3 font-bold tracking-wider">Their duty</th>
                  <th className="p-3 font-bold tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-brand-500/5/40 transition-colors">
                    <td className="p-3 text-[11px] text-textMuted whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="font-semibold text-text text-sm">{r.requester.full_name}</div>
                      <div className="text-[11px] text-textFaint">{ROLE_LABEL[r.requester.role] || r.requester.role}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-text">{fmtDate(r.requester.exam_date)}</div>
                      <div className="font-mono text-[11px] text-textMuted">{fmtTime(r.requester.start_time)}–{fmtTime(r.requester.end_time)}</div>
                      <div className="text-[11px] text-textMuted">{r.requester.room_name}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-text text-sm">{r.target.full_name}</div>
                      <div className="text-[11px] text-textFaint">{ROLE_LABEL[r.target.role] || r.target.role}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-text">{fmtDate(r.target.exam_date)}</div>
                      <div className="font-mono text-[11px] text-textMuted">{fmtTime(r.target.start_time)}–{fmtTime(r.target.end_time)}</div>
                      <div className="text-[11px] text-textMuted">{r.target.room_name}</div>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={r.status} />
                      {r.note && (
                        <div className="mt-1 text-[10px] text-textFaint italic max-w-[220px] truncate" title={r.note}>
                          {r.note}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PartyCard({ label, person, side, accent }) {
  return (
    <div className={`border rounded-lg p-3 ${accent ? 'border-brand-500/30 bg-brand-500/5' : 'border-border bg-surface2'}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${accent ? 'text-brand-500' : 'text-textFaint'}`}>{label}</div>
      <div className="text-sm font-semibold text-text">{person.full_name}</div>
      <div className="text-[11px] text-textFaint mb-2">
        {ROLE_LABEL[person.role] || person.role}
        {person.employee_id && ` · ${person.employee_id}`}
      </div>
      <div className="text-xs text-text">{fmtDate(side.exam_date)}</div>
      <div className="font-mono text-[11px] text-textMuted">{fmtTime(side.start_time)}–{fmtTime(side.end_time)}</div>
      <div className="text-sm text-text mt-1">{side.room_name}</div>
      <div className="text-[11px] text-textFaint">{side.course_codes || '—'}</div>
    </div>
  );
}
