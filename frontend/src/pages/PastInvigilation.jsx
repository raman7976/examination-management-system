import { useState, useEffect, useMemo } from 'react';
import {
  getInvigilationSessions,
  getInvigilationSessionById,
  deleteInvigilationSession,
  saveInvigilationSession,
} from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';
import PdfExportMenu from '../components/PdfExportMenu.jsx';
import {
  gridFromArchive,
  downloadDutyChart,
  downloadInvigilatorRoster,
  downloadDutyLetters,
  downloadRoomSheet,
} from '../utils/invigilationPdf.js';

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}
function formatDateDisplay(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}
function formatSavedAt(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

export default function PastInvigilation() {
  const { activePeriod } = usePeriod();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [duties, setDuties] = useState([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getInvigilationSessions();
        setSessions(res.data?.sessions || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSelectSession = async (session) => {
    if (selectedSession?.id === session.id) {
      setSelectedSession(null);
      setDuties([]);
      setSelectedDay(null);
      setSelectedSlotKey(null);
      return;
    }
    setSelectedSession(session);
    setSelectedDay(null);
    setSelectedSlotKey(null);
    setDuties([]);
    setLoadingSession(true);
    try {
      const res = await getInvigilationSessionById(session.id);
      if (res.data?.success) setDuties(res.data.duties || []);
    } catch (e) { console.error(e); }
    finally { setLoadingSession(false); }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this saved invigilation session permanently?')) return;
    try {
      await deleteInvigilationSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (selectedSession?.id === id) {
        setSelectedSession(null);
        setDuties([]);
      }
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await saveInvigilationSession({ session_name: saveName.trim() });
      if (res.data?.success) {
        const refreshed = await getInvigilationSessions();
        setSessions(refreshed.data?.sessions || []);
        setSaveModalOpen(false);
        setSaveName('');
      }
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to save session.');
    } finally { setSaving(false); }
  };

  // Group duties by date → slot
  const slotsByDate = useMemo(() => {
    const grouped = {};
    for (const row of duties) {
      const dayKey = row.exam_date;
      if (!grouped[dayKey]) grouped[dayKey] = {};
      const slotKey = `${row.start_time}_${row.end_time}`;
      if (!grouped[dayKey][slotKey]) {
        grouped[dayKey][slotKey] = { start_time: row.start_time, end_time: row.end_time, slot_id: row.slot_id, rows: [] };
      }
      grouped[dayKey][slotKey].rows.push(row);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => ({
      date,
      slots: Object.entries(slots).map(([key, val]) => ({ key, ...val })),
    }));
  }, [duties]);

  useEffect(() => {
    if (slotsByDate.length > 0 && !selectedDay) setSelectedDay(slotsByDate[0].date);
  }, [slotsByDate, selectedDay]);

  const daySlots = useMemo(() => slotsByDate.find(d => d.date === selectedDay)?.slots || [], [slotsByDate, selectedDay]);

  const slotRows = useMemo(() => {
    if (!selectedSlotKey) return [];
    return daySlots.find(s => s.key === selectedSlotKey)?.rows || [];
  }, [daySlots, selectedSlotKey]);

  // Group by room
  const roomGroups = useMemo(() => {
    const grouped = {};
    for (const row of slotRows) {
      if (!grouped[row.room_name]) {
        grouped[row.room_name] = { room_name: row.room_name, classroom_id: row.classroom_id, course_codes: row.course_codes, invigilators: [] };
      }
      grouped[row.room_name].invigilators.push(row);
      if (row.course_codes && !grouped[row.room_name].course_codes) {
        grouped[row.room_name].course_codes = row.course_codes;
      }
    }
    return Object.values(grouped).sort((a, b) => a.room_name.localeCompare(b.room_name));
  }, [slotRows]);

  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return roomGroups;
    const q = searchQuery.toLowerCase();
    return roomGroups.filter(r =>
      r.room_name.toLowerCase().includes(q) ||
      r.invigilators.some(i => i.full_name?.toLowerCase().includes(q) || i.employee_id?.toLowerCase().includes(q)) ||
      (r.course_codes || '').toLowerCase().includes(q)
    );
  }, [roomGroups, searchQuery]);

  const activeSlotInfo = useMemo(() => {
    if (!selectedSlotKey || daySlots.length === 0) return null;
    const slot = daySlots.find(s => s.key === selectedSlotKey);
    if (!slot) return null;
    return { exam_date: selectedDay, start_time: slot.start_time, end_time: slot.end_time };
  }, [selectedSlotKey, daySlots, selectedDay]);

  // ── PDF records (shared builders in utils/invigilationPdf.js) ──
  const pdfMeta = selectedSession
    ? {
        semesterLabel: selectedSession.semester_label,
        examType: selectedSession.exam_type,
        scopeNote: `Archived session: ${selectedSession.session_name} (saved ${formatSavedAt(selectedSession.saved_at)})`,
        fileSuffix: 'archived',
      }
    : null;
  const sessionGrid = useMemo(() => gridFromArchive(duties), [duties]);
  const runPdf = (fn) => {
    setPdfError(null);
    fn().catch((e) => setPdfError(e?.message || 'Could not generate the PDF.'));
  };

  const sessionExportItems = [
    {
      key: 'chart',
      label: 'Duty chart',
      description: 'Every session, room and invigilator in this archive. One page per exam day.',
      onSelect: () => downloadDutyChart(sessionGrid, pdfMeta),
    },
    {
      key: 'roster',
      label: 'Invigilator-wise roster',
      description: 'Alphabetical list of invigilators with each of their duties.',
      onSelect: () => downloadInvigilatorRoster(sessionGrid, pdfMeta),
    },
    {
      key: 'letters',
      label: 'Duty letters (all)',
      description: 'A formal duty letter for every invigilator, one per page.',
      onSelect: () => downloadDutyLetters(sessionGrid, pdfMeta),
    },
  ];

  // Chart for the selected slot only (respects the search filter on screen).
  const handleDownloadSlotPDF = () => {
    if (!activeSlotInfo || filteredRooms.length === 0) return;
    const grid = gridFromArchive(filteredRooms.flatMap(r => r.invigilators));
    runPdf(() => downloadDutyChart(grid, pdfMeta));
  };

  const handleDownloadRoomPDF = (room) => {
    const [slot] = gridFromArchive(room.invigilators);
    if (!slot) return;
    runPdf(() => downloadRoomSheet(slot, slot.rooms[0], pdfMeta));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-full">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Past Invigilation</h2>
          <p className="text-sm text-textMuted mt-1">Save, view, and download duty charts from past invigilation schedules</p>
        </div>
        {activePeriod && (
          <button
            onClick={() => { setSaveModalOpen(true); setSaveName(`${activePeriod.semester_label} ${activePeriod.exam_type}`); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-brand-600 transition-all cursor-pointer shadow-sm hover:shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Save Current Schedule
          </button>
        )}
      </div>

      {/* Save modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSaveModalOpen(false)}>
          <div className="bg-surface rounded-xl shadow-2xl border border-border p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider mb-4">Save Invigilation Session</h3>
            <label className="block text-xs font-semibold text-textMuted mb-1">Session Name</label>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="e.g. 2025-26 Even Semester Midterm"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40 mb-4"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaveModalOpen(false)} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-textMuted hover:text-text rounded-lg border border-border hover:bg-surface2 transition-colors cursor-pointer">Cancel</button>
              <button onClick={handleSave} disabled={saving || !saveName.trim()} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Select Session */}
      <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
        <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">1</span>
          Select Saved Invigilation Session
        </h3>
        {sessions.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-textFaint">No saved sessions yet. Use the "Save Current Schedule" button to archive the active invigilation schedule.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sessions.map(session => {
              const isActive = selectedSession?.id === session.id;
              return (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${isActive
                    ? 'border-brand-500 bg-brand-500/5 shadow-md'
                    : 'border-border hover:border-brand-500/40 hover:bg-surface2'}`}
                >
                  {isActive && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-success/100 rounded-full border-2 border-white" />}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-text">{session.session_name}</span>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="px-2 py-0.5 bg-surface2 text-textMuted text-[10px] font-bold uppercase rounded">{session.semester_label}</span>
                        <span className="px-2 py-0.5 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase rounded">{session.exam_type}</span>
                        <div className="flex items-center gap-2 text-textMuted ml-1">
                          <div className="flex items-center gap-1" title="Total Assignments">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                            <span className="text-[10px] font-bold">{session.total_assignments} duties</span>
                          </div>
                          <span className="text-[10px] text-textFaint">·</span>
                          <div className="flex items-center gap-1" title="Total Invigilators">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                            </svg>
                            <span className="text-[10px] font-bold">{session.total_invigilators}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-textFaint mt-2">Saved: {formatSavedAt(session.saved_at)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="text-textFaint hover:text-danger hover:bg-danger/10 transition-colors p-2 rounded-lg cursor-pointer"
                      title="Delete Session"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session data */}
      {selectedSession && (
        loadingSession ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin h-6 w-6 text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="ml-3 text-sm text-textMuted">Loading session data...</span>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by room, name, employee ID, or course..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40"
                  />
                </div>
                <PdfExportMenu
                  label="Session PDF"
                  items={sessionExportItems}
                  disabled={duties.length === 0}
                  disabledReason="This session has no duty records."
                  onError={(e) => setPdfError(e?.message || 'Could not generate the PDF.')}
                />
              </div>
              {pdfError && <p className="mt-2 text-xs text-danger">{pdfError}</p>}
            </div>

            {/* Step 2: Day & Slot */}
            <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
              <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">2</span>
                Select Day & Slot
              </h3>
              <div className="flex flex-wrap gap-2">
                {slotsByDate.map(group => (
                  <button
                    key={group.date}
                    onClick={() => { setSelectedDay(group.date); setSelectedSlotKey(null); }}
                    className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border-2 cursor-pointer ${selectedDay === group.date
                      ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                      : 'bg-surface text-text border-border hover:border-brand-500/40'}`}
                  >
                    <div className="font-bold">{formatDateDisplay(group.date)}</div>
                  </button>
                ))}
              </div>
              {selectedDay && daySlots.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map(slot => {
                      const isActive = selectedSlotKey === slot.key;
                      return (
                        <button
                          key={slot.key}
                          onClick={() => setSelectedSlotKey(isActive ? null : slot.key)}
                          className={`relative px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border-2 cursor-pointer ${isActive
                            ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                            : 'bg-surface text-text border-border hover:border-brand-500/40'}`}
                        >
                          {formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}
                          {isActive && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-success/100 rounded-full border-2 border-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Duty Grid */}
            <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">3</span>
                    Duty Chart
                  </h3>
                  {selectedSlotKey && filteredRooms.length > 0 && (
                    <button
                      onClick={handleDownloadSlotPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-brand-600 transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download Slot PDF
                    </button>
                  )}
                </div>
              </div>

              {!selectedSlotKey ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-textFaint">Select a day and slot above to view the duty chart</p>
                </div>
              ) : filteredRooms.length === 0 ? (
                <div className="py-16 text-center"><p className="text-sm text-textFaint">No duties found.</p></div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredRooms.map(room => (
                    <div key={room.room_name} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-brand-500/5 border border-brand-500/15 flex items-center justify-center text-brand-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                            </svg>
                          </div>
                          <div>
                            <span className="font-mono text-sm font-bold text-text">{room.room_name}</span>
                            {room.course_codes && (
                              <p className="text-[10px] text-textFaint mt-0.5">{room.course_codes}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownloadRoomPDF(room)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface text-textMuted text-[10px] font-bold uppercase tracking-wider rounded-lg border border-border hover:bg-surface2 hover:text-text transition-colors cursor-pointer shadow-sm"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          PDF
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                        {room.invigilators.map(inv => (
                          <div
                            key={inv.id}
                            className="rounded-md px-3 py-2 border border-border bg-surface2/60 text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              {inv.is_course_instructor ? <span className="text-warning" title="Course instructor">★</span> : null}
                              <span className="font-semibold text-text">{inv.full_name}</span>
                            </div>
                            <div className="text-[10px] text-textFaint mt-0.5">
                              {inv.employee_id || '—'} · {ROLE_LABEL[inv.role] || inv.role}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
