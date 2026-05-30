import { useEffect, useState, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getOutgoingSwapRequests, cancelMySwapRequest } from '../../api/api.js';
import StatusBadge from '../../components/StatusBadge.jsx';

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';
const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

const FILTERS = [
  { key: '',          label: 'All'      },
  { key: 'open',      label: 'Open'     },
  { key: 'terminal',  label: 'Terminal' },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Outgoing Requests — every request I've sent, any status. Cancel is only
//  available while status = pending_peer.
// ─────────────────────────────────────────────────────────────────────────────
export default function OutgoingRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (statusFilter = filter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOutgoingSwapRequests(statusFilter);
      setRequests(res.data?.requests || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load outgoing requests.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this swap request?')) return;
    setBusyId(id);
    try {
      await cancelMySwapRequest(id);
      toast.success('Swap request cancelled.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-[1100px]">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="mb-5 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-500 tracking-tight">My Swap Requests</h1>
          <p className="text-sm text-textMuted mt-1">Requests you've sent, with their current status.</p>
        </div>
        <div className="flex gap-1 bg-surface2 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); load(f.key); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${filter === f.key ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:text-text'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textFaint shadow-sm">Loading…</div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textMuted shadow-sm">
          You haven't sent any swap requests yet.
        </div>
      )}

      {requests.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface2 text-xs uppercase text-textMuted border-b border-border shadow-sm">
              <tr>
                <th className="p-3 font-bold tracking-wider">Created</th>
                <th className="p-3 font-bold tracking-wider">With</th>
                <th className="p-3 font-bold tracking-wider">My duty</th>
                <th className="p-3 font-bold tracking-wider">Their duty</th>
                <th className="p-3 font-bold tracking-wider">Status</th>
                <th className="p-3 font-bold tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-brand-500/5/40 transition-colors">
                  <td className="p-3 text-[11px] text-textMuted whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-text text-sm">{r.target.full_name}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${r.request_type === 'cover' ? 'bg-warning/15 text-warning' : 'bg-brand-500/15 text-brand-500'}`}>
                        {r.request_type === 'cover' ? 'Cover' : 'Swap'}
                      </span>
                    </div>
                    <div className="text-[11px] text-textFaint">{ROLE_LABEL[r.target.role] || r.target.role}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-xs text-text">{fmtDate(r.requester.exam_date)}</div>
                    <div className="font-mono text-[11px] text-textMuted">{fmtTime(r.requester.start_time)}–{fmtTime(r.requester.end_time)}</div>
                    <div className="text-[11px] text-textMuted">{r.requester.room_name}</div>
                  </td>
                  <td className="p-3">
                    {r.request_type === 'cover' ? (
                      <span className="text-[11px] text-textFaint italic">They cover mine</span>
                    ) : (
                      <>
                        <div className="text-xs text-text">{fmtDate(r.target.exam_date)}</div>
                        <div className="font-mono text-[11px] text-textMuted">{fmtTime(r.target.start_time)}–{fmtTime(r.target.end_time)}</div>
                        <div className="text-[11px] text-textMuted">{r.target.room_name}</div>
                      </>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                    {r.note && (
                      <div className="mt-1 text-[10px] text-textFaint italic max-w-[200px] truncate" title={r.note}>
                        {r.note}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {r.status === 'pending_peer' ? (
                      <button
                        onClick={() => cancel(r.id)}
                        disabled={busyId === r.id}
                        className="px-2.5 py-1 bg-surface text-danger text-xs font-bold rounded-md border border-danger/30 hover:bg-danger/10 hover:border-danger/50 cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    ) : (
                      <span className="text-[11px] text-textFaint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
