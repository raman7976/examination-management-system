import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useOutletContext } from 'react-router-dom';
import { getFullInvigilationSchedule } from '../../api/api.js';
import SwapRequestModal from './SwapRequestModal.jsx';
import PdfExportMenu from '../../components/PdfExportMenu.jsx';
import { gridFromSchedule, downloadDutyLetters, downloadDutyChart } from '../../utils/invigilationPdf.js';

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
const fmtDayTab = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const fmtDayFull = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

// ─────────────────────────────────────────────────────────────────────────────
//  My Invigilation Schedule
//
//  Shows the WHOLE published grid for the active exam period, one day at a time.
//    • Day selector across the top (distinct exam dates).
//    • Grid for the chosen day: ROWS = time slots, COLUMNS = lecture halls.
//      Each cell lists the invigilators (name + employee ID, ★ = teaches here)
//      assigned to that room in that slot. My own duties are highlighted.
//    • Click any OTHER invigilator's chip → request a swap with them. The swap
//      only takes effect after the peer AND the admin approve.
// ─────────────────────────────────────────────────────────────────────────────
export default function MySchedule() {
  const ctx = useOutletContext() || {};
  const [examPeriod, setExamPeriod] = useState(null);
  const [schedule, setSchedule] = useState([]);       // [{ slot_id, exam_date, start_time, end_time, rooms:[...] }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [swapTarget, setSwapTarget] = useState(null); // a clicked invigilator chip (+ slot/room context)

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFullInvigilationSchedule();
      setExamPeriod(res.data?.exam_period || null);
      setSchedule(res.data?.schedule || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Distinct exam days, sorted ascending.
  const days = useMemo(() => {
    const set = new Set(schedule.map((s) => s.exam_date).filter(Boolean));
    return Array.from(set).sort((a, b) => new Date(a) - new Date(b));
  }, [schedule]);

  // Default the day selector to the first available day once data arrives.
  useEffect(() => {
    if (days.length > 0 && (!selectedDay || !days.includes(selectedDay))) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  // All of MY duties (across every day) — used as the "offer" list in the modal.
  const myDuties = useMemo(() => {
    const out = [];
    for (const slot of schedule) {
      for (const room of slot.rooms || []) {
        for (const inv of room.invigilators || []) {
          if (inv.is_me) {
            out.push({
              assignment_id: inv.assignment_id,
              slot_id: slot.slot_id,
              classroom_id: room.classroom_id,
              room_name: room.room_name,
              exam_date: slot.exam_date,
              exam_day: slot.exam_day,
              start_time: slot.start_time,
              end_time: slot.end_time,
              course_codes: room.course_codes,
            });
          }
        }
      }
    }
    return out;
  }, [schedule]);

  const canSwap = myDuties.length > 0;

  // ── PDF downloads ──
  const myUserId = useMemo(() => {
    for (const slot of schedule)
      for (const room of slot.rooms || [])
        for (const inv of room.invigilators || [])
          if (inv.is_me) return inv.user_id;
    return null;
  }, [schedule]);
  const pdfMeta = { semesterLabel: examPeriod?.semester_label, examType: examPeriod?.exam_type };
  const pdfItems = [
    {
      key: 'letter',
      label: 'My duty letter',
      description: myUserId ? 'Your duties for this exam, with instructions.' : 'You have no duties in this exam period.',
      disabled: !myUserId,
      onSelect: () => downloadDutyLetters(gridFromSchedule(schedule), pdfMeta, { onlyKeys: [myUserId], fileLabel: 'My' }),
    },
    {
      key: 'chart',
      label: 'Full duty chart',
      description: 'Every session, room and invigilator for this exam.',
      onSelect: () => downloadDutyChart(gridFromSchedule(schedule), pdfMeta),
    },
  ];

  // Slots for the selected day, ordered by start time (these become grid ROWS).
  const daySlots = useMemo(
    () =>
      schedule
        .filter((s) => s.exam_date === selectedDay)
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    [schedule, selectedDay]
  );

  // Lecture halls used anywhere that day (these become grid COLUMNS), ordered
  // by location_order then name. De-duplicated by classroom_id.
  const columns = useMemo(() => {
    const map = new Map();
    for (const slot of daySlots) {
      for (const room of slot.rooms || []) {
        if (!map.has(room.classroom_id)) {
          map.set(room.classroom_id, {
            classroom_id: room.classroom_id,
            room_name: room.room_name,
            location_order: room.location_order ?? 9999,
          });
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.location_order - b.location_order) || String(a.room_name).localeCompare(String(b.room_name))
    );
  }, [daySlots]);

  const openSwap = (inv, slot, room) => {
    if (!canSwap) return;
    setSwapTarget({
      assignment_id: inv.assignment_id,
      user_id: inv.user_id,
      full_name: inv.full_name,
      employee_id: inv.employee_id,
      role: inv.role,
      slot_id: slot.slot_id,
      classroom_id: room.classroom_id,
      room_name: room.room_name,
      exam_date: slot.exam_date,
      exam_day: slot.exam_day,
      start_time: slot.start_time,
      end_time: slot.end_time,
      course_codes: room.course_codes,
    });
  };

  return (
    <div className="max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-500 tracking-tight">Invigilation Schedule</h1>
          <p className="text-sm text-textMuted mt-1">
            Duty grid for the active exam period. Click another invigilator to request a swap.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
          <PdfExportMenu
            items={pdfItems}
            disabled={loading || !!error || schedule.length === 0}
            disabledReason="No invigilation schedule has been published yet."
            onError={(err) => toast.error(err?.message || 'Could not generate the PDF.')}
          />
        </div>
      </div>

      {loading && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textFaint shadow-sm">Loading…</div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {!loading && !error && schedule.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-textMuted shadow-sm">
          No invigilation schedule has been published for the active exam period yet.
        </div>
      )}

      {!loading && !error && schedule.length > 0 && (
        <>
          {/* Day selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {days.map((d) => {
              const active = d === selectedDay;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-surface text-textMuted border-border hover:border-brand-500/50'
                  }`}
                >
                  {fmtDayTab(d)}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px] text-textFaint">
            <span className="font-semibold text-text">{fmtDayFull(selectedDay)}</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-brand-500/20 border border-brand-500/40" /> Your duty
            </span>
            <span className="flex items-center gap-1"><span className="text-warning">★</span> Teaches a course in this room</span>
            {canSwap
              ? <span>Click any other invigilator to request a swap.</span>
              : <span className="text-warning">You have no duties this period, so you cannot request swaps.</span>}
          </div>

          {/* Grid: rows = slots, columns = lecture halls */}
          {daySlots.length === 0 || columns.length === 0 ? (
            <div className="bg-surface rounded-xl border border-border p-10 text-center text-textMuted shadow-sm">
              No rooms are scheduled for this day.
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-border shadow-sm overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-surface2 border-b border-border">
                    <th className="p-3 font-bold text-[11px] uppercase tracking-wider text-textMuted sticky left-0 bg-surface2 z-10 min-w-[120px]">
                      Slot
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c.classroom_id}
                        className="p-3 font-bold text-[11px] uppercase tracking-wider text-textMuted text-center min-w-[160px] border-l border-border"
                      >
                        {c.room_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daySlots.map((slot) => {
                    const roomById = new Map((slot.rooms || []).map((r) => [r.classroom_id, r]));
                    return (
                      <tr key={slot.slot_id} className="border-b border-border align-top">
                        {/* Row header: time slot */}
                        <td className="p-3 sticky left-0 bg-surface z-10 border-r border-border">
                          <span className="font-mono text-xs px-2 py-0.5 bg-brand-500/5 text-brand-500 rounded-md border border-brand-500/20 whitespace-nowrap">
                            {fmtTime(slot.start_time)}–{fmtTime(slot.end_time)}
                          </span>
                        </td>

                        {/* One cell per lecture hall */}
                        {columns.map((c) => {
                          const room = roomById.get(c.classroom_id);
                          if (!room) {
                            return (
                              <td key={c.classroom_id} className="p-3 text-center text-textFaint border-l border-border">
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={c.classroom_id} className="p-2.5 border-l border-border">
                              {room.course_codes && (
                                <div className="text-[10px] text-textFaint mb-1.5 truncate" title={room.course_codes}>
                                  {room.course_codes}
                                  <span className="ml-1 text-textFaint">· {room.students} stu / need {room.required}</span>
                                </div>
                              )}
                              <div className="flex flex-col gap-1.5">
                                {(room.invigilators || []).length === 0 && (
                                  <span className="text-[11px] text-textFaint italic">Unassigned</span>
                                )}
                                {(room.invigilators || []).map((inv) => {
                                  const mine = inv.is_me;
                                  const clickable = !mine && canSwap;
                                  return (
                                    <button
                                      key={inv.assignment_id}
                                      data-testid={`invig-chip-${inv.assignment_id}`}
                                      disabled={!clickable}
                                      onClick={() => openSwap(inv, slot, room)}
                                      title={
                                        mine
                                          ? 'This is your duty'
                                          : clickable
                                            ? `Request a swap with ${inv.full_name}`
                                            : inv.full_name
                                      }
                                      className={`text-left rounded-md px-2 py-1.5 border text-xs transition-all ${
                                        mine
                                          ? 'bg-brand-500/15 border-brand-500/40 cursor-default'
                                          : clickable
                                            ? 'bg-surface2 border-border hover:border-brand-500 hover:bg-brand-500/5 cursor-pointer'
                                            : 'bg-surface2 border-border cursor-default'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1">
                                        {inv.is_course_instructor && <span className="text-warning" title="Teaches here">★</span>}
                                        <span className={`font-semibold ${mine ? 'text-brand-500' : 'text-text'}`}>
                                          {inv.full_name}
                                        </span>
                                        {mine && (
                                          <span className="text-[9px] font-bold uppercase tracking-wider bg-brand-500 text-white px-1 py-0.5 rounded ml-1">
                                            You
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-textFaint mt-0.5">
                                        {inv.employee_id || '—'} · {ROLE_LABEL[inv.role] || inv.role}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {swapTarget && (
        <SwapRequestModal
          target={swapTarget}
          myDuties={myDuties}
          onClose={() => setSwapTarget(null)}
          onSuccess={() => {
            setSwapTarget(null);
            toast.success('Swap request sent. Waiting for the other invigilator, then admin approval.');
            ctx.refreshIncoming?.();
          }}
        />
      )}
    </div>
  );
}
