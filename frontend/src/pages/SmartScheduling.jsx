import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getExamSlots, getUnscheduledCourses, getScheduledCourses, assignCoursesToSlot, unassignCourse } from '../api/api.js';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PeriodScopedEmptyState from '../components/PeriodScopedEmptyState.jsx';

// ═════════════════════════════════════════════════════════════════════════════
//  Helper: Format time string from "HH:MM:SS" → "9:00 AM"
// ═════════════════════════════════════════════════════════════════════════════
function formatTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Helper: Format date string for slot card header
// ═════════════════════════════════════════════════════════════════════════════
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SMART SCHEDULING COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

function SmartScheduling() {
  // ── State ──
  const [slots, setSlots] = useState([]);
  const [courses, setCourses] = useState([]);
  const [activeSlotId, setActiveSlotId] = useState(null);
  const [selectedCodes, setSelectedCodes] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [activeTab, setActiveTab] = useState('assign');
  const [scheduledCourses, setScheduledCourses] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [expandedSlots, setExpandedSlots] = useState({});

  // ── Initial Data Fetch ──
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [slotsRes, coursesRes] = await Promise.all([
          getExamSlots(),
          getUnscheduledCourses(),
        ]);
        setSlots(slotsRes.data.slots || []);
        setCourses(coursesRes.data.courses || []);
      } catch (err) {
        console.error('Fetch error:', err);
        toast.error('Failed to load data. Please refresh.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // ── Fetch scheduled courses ──
  const fetchScheduled = useCallback(async () => {
    setScheduledLoading(true);
    try {
      const res = await getScheduledCourses();
      setScheduledCourses(res.data.scheduled || []);
    } catch (err) { console.error('Fetch scheduled error:', err); }
    finally { setScheduledLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'scheduled') fetchScheduled(); }, [activeTab, fetchScheduled]);

  // ── Group scheduled courses by slot ──
  const scheduledBySlot = useMemo(() => {
    const grouped = {};
    for (const c of scheduledCourses) {
      if (!grouped[c.slot_id]) grouped[c.slot_id] = { slot_id: c.slot_id, exam_date: c.exam_date, exam_day: c.exam_day, start_time: c.start_time, end_time: c.end_time, courses: [] };
      grouped[c.slot_id].courses.push(c);
    }
    return Object.values(grouped);
  }, [scheduledCourses]);

  // ── Handle unassign ──
  const handleUnassign = async (entry) => {
    if (!window.confirm(`Remove ${entry.course_code} – ${entry.course_name} from this slot?`)) return;
    try {
      await unassignCourse(entry.id);
      toast.success(`${entry.course_code} unassigned.`, { autoClose: 2000 });
      fetchScheduled();
      // Also refresh unscheduled list so the course reappears
      const refreshed = await getUnscheduledCourses();
      setCourses(refreshed.data.courses || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unassign.', { autoClose: 3000 });
    }
  };

  // ── Group slots by exam_date ──
  const slotsByDate = useMemo(() => {
    const grouped = {};
    for (const slot of slots) {
      const key = slot.exam_date;
      if (!grouped[key]) grouped[key] = { date: key, day: slot.exam_day, slots: [] };
      grouped[key].slots.push(slot);
    }
    return Object.values(grouped);
  }, [slots]);

  // ── Filter courses by search query ──
  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;
    const q = searchQuery.toLowerCase().trim();

    return courses.filter((c) => {
      const code = c.course_code.toLowerCase();
      const name = c.course_name.toLowerCase();
      const inst = c.instructors ? c.instructors.toLowerCase() : '';

      return (
        code.includes(q) ||
        name.includes(q) ||
        inst.includes(q) ||
        (c.short_name && c.short_name.toLowerCase().includes(q))
      );
    });
  }, [courses, searchQuery]);

  // ── Toggle course selection ──
  const toggleCourse = (code) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // ── Select / Deselect all visible ──
  const toggleAllVisible = () => {
    const allVisibleCodes = filteredCourses.map((c) => c.course_code);
    const allSelected = allVisibleCodes.every((c) => selectedCodes.has(c));
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allVisibleCodes.forEach((c) => next.delete(c));
      } else {
        allVisibleCodes.forEach((c) => next.add(c));
      }
      return next;
    });
  };

  // ── Assign courses to active slot ──
  const handleAssign = async () => {
    if (!activeSlotId || selectedCodes.size === 0) return;

    setAssigning(true);
    try {
      const res = await assignCoursesToSlot({
        slot_id: activeSlotId,
        course_codes: Array.from(selectedCodes),
      });

      toast.success(res.data.message || `Scheduled ${selectedCodes.size} course(s)!`, {
        autoClose: 3000,
      });

      // Refresh unscheduled courses & clear selection
      const refreshed = await getUnscheduledCourses();
      setCourses(refreshed.data.courses || []);
      setSelectedCodes(new Set());
    } catch (err) {
      console.error('Assign error:', err);
      const msg = err.response?.data?.message || 'Failed to schedule courses.';
      toast.error(msg, { autoClose: 4000 });
    } finally {
      setAssigning(false);
    }
  };

  // ── Active slot object ──
  const activeSlot = slots.find((s) => s.id === activeSlotId);

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span className="text-sm text-textMuted font-medium">Loading scheduling data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full">
      {/* ── Page Header ── */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Smart Scheduling</h2>
        <p className="text-sm text-textMuted mt-1">Manage exam course assignments.</p>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-1 mb-5 bg-surface2 rounded-lg p-1 w-fit">
        {[{ key: 'assign', label: 'Assign Courses' }, { key: 'scheduled', label: 'Scheduled Courses' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer ${
              activeTab === tab.key ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:text-text hover:bg-surface/60'
            }`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'assign' && (<>
      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — SLOT CALENDAR GRID
          ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
        <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">1</span>
          Select an Exam Slot
        </h3>

        {slotsByDate.length === 0 ? (
          <PeriodScopedEmptyState noun="exam slots">
            Add slots for this period in <b className="text-text">Add Exam Slot</b>, or
            switch to another period that already has slots.
          </PeriodScopedEmptyState>
        ) : (
          <div className="space-y-4">
            {slotsByDate.map((group) => (
              <div key={group.date}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-text uppercase tracking-wide">
                    {group.day}
                  </span>
                  <span className="text-[11px] text-textFaint font-medium">
                    {formatDate(group.date)}
                  </span>
                  <div className="flex-1 h-px bg-surface2 ml-2" />
                </div>

                {/* Slot chips in a row */}
                <div className="flex flex-wrap gap-2">
                  {group.slots.map((slot) => {
                    const isActive = activeSlotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => {
                          setActiveSlotId(isActive ? null : slot.id);
                          setSelectedCodes(new Set());
                        }}
                        className={`
                          group relative px-4 py-2.5 rounded-lg text-xs font-semibold 
                          transition-all duration-200 border-2 cursor-pointer
                          ${isActive
                            ? 'bg-brand-500 text-white border-brand-500 shadow-md shadow-brand-500/20'
                            : 'bg-surface text-text border-border hover:border-brand-500/40 hover:bg-danger/10/50 hover:shadow-sm'
                          }
                        `}
                      >
                        <span className="tracking-wide">
                          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                        </span>
                        {isActive && (
                          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-success/100 rounded-full border-2 border-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — COURSE ASSIGNMENT PANEL (HIGH-DENSITY TABLE)
          ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">

        {/* Panel header + Active slot indicator */}
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">2</span>
              Assign Courses
            </h3>

            {activeSlot && (
              <div className="flex items-center gap-2 bg-brand-500/5 border border-brand-500/15 rounded-lg px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-brand-500">
                  Active: {activeSlot.exam_day}, {formatDate(activeSlot.exam_date)} · {formatTime(activeSlot.start_time)} – {formatTime(activeSlot.end_time)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Gate: must select a slot first */}
        {!activeSlotId ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-surface2 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <p className="text-sm font-medium text-textFaint">Select an exam slot above to view available courses</p>
          </div>
        ) : (
          <>
            {/* ── Sticky Search Bar ── */}
            <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm px-5 py-3 border-b border-border shadow-sm">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  id="course-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by code, name, short name, or instructor…"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-border 
                    bg-surface2 text-text placeholder-slate-400
                    focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40
                    transition-all duration-200"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-textFaint hover:text-textMuted transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Quick stats row */}
              <div className="flex items-center gap-4 mt-2 text-[11px] text-textFaint">
                <span>{filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''} shown</span>
                {searchQuery && <span>· filtered from {courses.length} total</span>}
              </div>
            </div>

            {/* ── Data Table ── */}
            <div className="max-h-[420px] overflow-y-auto">
              {filteredCourses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-textFaint">
                    {courses.length === 0
                      ? 'All courses have been scheduled! 🎉'
                      : `No courses match "${searchQuery}"`}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface2 z-[5]">
                    <tr className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                      <th className="w-12 px-5 py-2.5 text-left">
                        <input
                          id="select-all-checkbox"
                          type="checkbox"
                          checked={
                            filteredCourses.length > 0 &&
                            filteredCourses.every((c) => selectedCodes.has(c.course_code))
                          }
                          onChange={toggleAllVisible}
                          className="w-3.5 h-3.5 rounded border-borderStrong text-brand-500 
                            focus:ring-1 focus:ring-brand-500/30 cursor-pointer accent-brand-500"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left">Code</th>
                      <th className="px-3 py-2.5 text-left">Course Name</th>
                      <th className="px-3 py-2.5 text-left hidden md:table-cell">Instructor(s)</th>
                      <th className="px-3 py-2.5 text-right pr-5">Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredCourses.map((course) => {
                      const isSelected = selectedCodes.has(course.course_code);
                      return (
                        <tr
                          key={course.course_code}
                          onClick={() => toggleCourse(course.course_code)}
                          className={`
                            cursor-pointer transition-colors duration-100
                            ${isSelected
                              ? 'bg-brand-500/[0.04] hover:bg-brand-500/[0.07]'
                              : 'hover:bg-surface2/80'
                            }
                          `}
                        >
                          <td className="w-12 px-5 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCourse(course.course_code)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 rounded border-borderStrong text-brand-500 
                                focus:ring-1 focus:ring-brand-500/30 cursor-pointer accent-brand-500"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-mono text-xs font-bold tracking-wide ${isSelected ? 'text-brand-500' : 'text-text'}`}>
                              {course.course_code}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-text text-[13px]">
                            {course.course_name}
                          </td>
                          <td className="px-3 py-2.5 text-textFaint text-xs hidden md:table-cell truncate max-w-[200px]">
                            {course.instructors || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right pr-5">
                            <span className="inline-flex items-center justify-center bg-surface2 text-textMuted text-[11px] font-semibold rounded-full px-2.5 py-0.5 min-w-[36px]">
                              {course.total_students}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Sticky Action Bar ── */}
            <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                {selectedCodes.size > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-brand-500/10 text-brand-500 text-xs font-bold rounded-full px-3 py-1.5">
                    <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {selectedCodes.size}
                    </span>
                    course{selectedCodes.size !== 1 ? 's' : ''} selected
                  </span>
                )}
                {selectedCodes.size > 0 && (
                  <button
                    onClick={() => setSelectedCodes(new Set())}
                    className="text-[11px] text-textFaint hover:text-textMuted underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <button
                id="schedule-button"
                onClick={handleAssign}
                disabled={assigning || selectedCodes.size === 0}
                className={`
                  px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg 
                  shadow-sm transition-all duration-200 flex items-center gap-2
                  ${assigning || selectedCodes.size === 0
                    ? 'bg-textFaint cursor-not-allowed'
                    : 'bg-brand-500 hover:bg-brand-600 hover:shadow-md cursor-pointer active:scale-[0.98]'
                  }
                `}
              >
                {assigning && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                )}
                {assigning ? 'Scheduling…' : 'Schedule Selected Courses'}
              </button>
            </div>
          </>
        )}
      </div>
      </>)}

      {/* ════════════════════════════════════════════════════════════════════
          SCHEDULED COURSES TAB
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scheduled' && (
        <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scheduled Courses
            </h3>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-brand-500/8 text-brand-500">
              {scheduledCourses.length} course{scheduledCourses.length !== 1 ? 's' : ''} across {scheduledBySlot.length} slot{scheduledBySlot.length !== 1 ? 's' : ''}
            </span>
          </div>

          {scheduledLoading ? (
            <div className="p-12 text-center text-sm text-textFaint">Loading scheduled courses…</div>
          ) : scheduledBySlot.length === 0 ? (
            <div className="p-12 text-center text-sm text-textFaint">No courses have been scheduled yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {scheduledBySlot.map(group => {
                const isOpen = expandedSlots[group.slot_id] !== false;
                return (
                  <div key={group.slot_id}>
                    <div className="px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-surface2/60 transition-colors"
                      onClick={() => setExpandedSlots(prev => ({ ...prev, [group.slot_id]: !isOpen }))}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${isOpen ? 'bg-brand-500 text-white border-brand-500' : 'bg-surface2 text-textFaint border-border'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d={isOpen ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
                          </svg>
                        </div>
                        <div>
                          <span className="text-sm font-bold text-text">{group.exam_day}, {formatDate(group.exam_date)}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-textFaint">{formatTime(group.start_time)} – {formatTime(group.end_time)}</span>
                            <span className="text-[11px] text-textFaint">·</span>
                            <span className="text-[11px] text-brand-500 font-semibold">{group.courses.length} course{group.courses.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-textFaint bg-surface2 px-2 py-1 rounded">
                        {group.courses.reduce((s, c) => s + c.total_students, 0)} students
                      </span>
                    </div>
                    {isOpen && (
                      <div className="bg-surface2/40 border-t border-border shadow-sm">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] font-bold text-textFaint uppercase tracking-wider">
                              <th className="px-5 py-2 text-left pl-16">Code</th>
                              <th className="px-3 py-2 text-left">Course Name</th>
                              <th className="px-3 py-2 text-left">Short Name</th>
                              <th className="px-3 py-2 text-left hidden md:table-cell">Instructor(s)</th>
                              <th className="px-3 py-2 text-right">Students</th>
                              <th className="px-3 py-2 text-right pr-5">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.courses.map(c => (
                              <tr key={c.id} className="hover:bg-surface/80 transition-colors">
                                <td className="px-5 py-2.5 pl-16 font-mono text-xs font-bold text-brand-500">{c.course_code}</td>
                                <td className="px-3 py-2.5 text-[13px] text-text">{c.course_name}</td>
                                <td className="px-3 py-2.5 text-xs text-textFaint">{c.short_name || '—'}</td>
                                <td className="px-3 py-2.5 text-xs text-textFaint hidden md:table-cell truncate max-w-[180px]">{c.instructors || '—'}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <span className="inline-flex items-center justify-center bg-surface2 text-textMuted text-[11px] font-semibold rounded-full px-2.5 py-0.5">{c.total_students}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right pr-5">
                                  <button onClick={(e) => { e.stopPropagation(); handleUnassign(c); }}
                                    className="text-[10px] font-bold uppercase tracking-wider text-danger hover:text-white hover:bg-danger/100 border border-danger/30 hover:border-danger px-2.5 py-1 rounded-md transition-all cursor-pointer">
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SmartScheduling;
