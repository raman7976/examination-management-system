import { useEffect, useState, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useOutletContext } from 'react-router-dom';
import { getMyInvigilationSchedule } from '../../api/api.js';
import SwapRequestModal from './SwapRequestModal.jsx';

// Convert "09:00:00" → "09:00"
const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
// Convert "2026-05-28" → "Thu, May 28, 2026"
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';

// ─────────────────────────────────────────────────────────────────────────────
//  My Schedule — read-only list of duties in the active period.
//  Each row has a "Request Swap" button that opens SwapRequestModal.
// ─────────────────────────────────────────────────────────────────────────────
export default function MySchedule() {
  const ctx = useOutletContext() || {};
  const [examPeriod, setExamPeriod] = useState(null);
  const [duties, setDuties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [swapFor, setSwapFor] = useState(null);   // currently-open duty in the swap modal

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyInvigilationSchedule();
      setExamPeriod(res.data?.exam_period || null);
      setDuties(res.data?.duties || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-[1100px]">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-500 tracking-tight">My Invigilation Schedule</h1>
          <p className="text-sm text-textMuted mt-1">Your assigned duties for the active exam period.</p>
        </div>
        {examPeriod && (
          <div className="bg-surface rounded-xl border border-border px-4 py-2 flex items-center gap-3 text-xs shadow-sm">
            <span className="font-bold uppercase tracking-wider text-textFaint">Active</span>
            <span className="text-sm font-semibold text-text">{examPeriod.semester_label}</span>
            <span className="text-textFaint">·</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-500 text-white">
              {examPeriod.exam_type}
            </span>
          </div>
        )}
      </div>

      {loading && <div className="bg-surface rounded-xl border border-border p-10 text-center text-textFaint shadow-sm">Loading…</div>}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && !error && duties.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textMuted shadow-sm">
          You have no invigilation duties in the active exam period.
        </div>
      )}

      {!loading && duties.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface2 text-xs uppercase text-textMuted border-b border-border shadow-sm">
              <tr>
                <th className="p-3 font-bold tracking-wider">Date</th>
                <th className="p-3 font-bold tracking-wider">Time</th>
                <th className="p-3 font-bold tracking-wider">Room</th>
                <th className="p-3 font-bold tracking-wider">Courses</th>
                <th className="p-3 font-bold tracking-wider text-center">★</th>
                <th className="p-3 font-bold tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {duties.map((d) => (
                <tr key={d.assignment_id} className="border-b border-border hover:bg-brand-500/5/40 transition-colors">
                  <td className="p-3">
                    <span className="font-semibold text-text">{fmtDate(d.exam_date)}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs px-2 py-0.5 bg-brand-500/5 text-brand-500 rounded-md border border-brand-500/20">
                      {fmtTime(d.start_time)} – {fmtTime(d.end_time)}
                    </span>
                  </td>
                  <td className="p-3 font-semibold text-text">{d.room_name}</td>
                  <td className="p-3 text-textMuted text-xs">{d.course_codes || '—'}</td>
                  <td className="p-3 text-center">
                    {d.is_course_instructor && (
                      <span title="You teach a course in this room" className="text-warning text-base">★</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => setSwapFor(d)}
                      className="px-3 py-1 bg-surface text-brand-500 text-xs font-bold rounded-md border border-brand-500/30 hover:bg-brand-500/5 hover:border-brand-500 transition-all cursor-pointer"
                    >
                      Request Swap
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {swapFor && (
        <SwapRequestModal
          duty={swapFor}
          onClose={() => setSwapFor(null)}
          onSuccess={() => {
            setSwapFor(null);
            toast.success('Swap request sent. Waiting for the other invigilator to approve.');
            ctx.refreshIncoming?.();
          }}
        />
      )}
    </div>
  );
}
