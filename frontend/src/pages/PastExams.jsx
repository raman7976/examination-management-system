import { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getExamSessions, getExamSessionById, deleteExamSession } from '../api/api.js';
import logo from '../assets/lnmiitLogo.jpg';

// ── Helpers ──
function formatTime12(t) {
    if (!t) return '';
    const [h, m] = String(t).split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:${m} ${ampm}`;
}
function formatDatePDF(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
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

export default function PastExams() {
    // ── Step 1: Session selection ──
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);
    const [sessionData, setSessionData] = useState([]);
    const [loadingSession, setLoadingSession] = useState(false);

    // ── Step 2: Day/Slot/Course navigation (mirrors PDF Reports) ──
    const [selectedDay, setSelectedDay] = useState(null);
    const [selectedSlotKey, setSelectedSlotKey] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('course');
    const [expandedHalls, setExpandedHalls] = useState({});
    const logoBase64Ref = useRef(null);

    // Pre-load logo
    useEffect(() => {
        (async () => {
            try {
                const resp = await fetch(logo);
                const blob = await resp.blob();
                const reader = new FileReader();
                reader.onload = () => { logoBase64Ref.current = reader.result; };
                reader.readAsDataURL(blob);
            } catch { /* logo preload is best-effort — skip silently */ }
        })();
    }, []);

    // Fetch all sessions
    useEffect(() => {
        (async () => {
            try {
                const res = await getExamSessions();
                setSessions(res.data?.sessions || []);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, []);

    // When a session is selected, fetch its full data
    const handleSelectSession = async (session) => {
        if (selectedSession?.id === session.id) {
            setSelectedSession(null);
            setSessionData([]);
            setSelectedDay(null);
            setSelectedSlotKey(null);
            return;
        }
        setSelectedSession(session);
        setSelectedDay(null);
        setSelectedSlotKey(null);
        setSessionData([]);
        setLoadingSession(true);
        try {
            const res = await getExamSessionById(session.id);
            if (res.data?.success) setSessionData(res.data.data || []);
        } catch (e) { console.error(e); }
        finally { setLoadingSession(false); }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm('Delete this saved session permanently?')) return;
        try {
            await deleteExamSession(id);
            setSessions(prev => prev.filter(s => s.id !== id));
            if (selectedSession?.id === id) {
                setSelectedSession(null);
                setSessionData([]);
            }
        } catch (e) { console.error(e); }
    };

    // ── Group session data by date (days) ──
    const slotsByDate = useMemo(() => {
        const grouped = {};
        for (const row of sessionData) {
            const dayKey = row.exam_date;
            if (!grouped[dayKey]) grouped[dayKey] = {};
            const slotKey = `${row.start_time}_${row.end_time}`;
            if (!grouped[dayKey][slotKey]) {
                grouped[dayKey][slotKey] = { start_time: row.start_time, end_time: row.end_time, rows: [] };
            }
            grouped[dayKey][slotKey].rows.push(row);
        }
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => ({
            date,
            slots: Object.entries(slots).map(([key, val]) => ({ key, ...val }))
        }));
    }, [sessionData]);

    // Auto-select first day
    useEffect(() => {
        if (slotsByDate.length > 0 && !selectedDay) setSelectedDay(slotsByDate[0].date);
    }, [slotsByDate, selectedDay]);

    const daySlots = useMemo(() => {
        return slotsByDate.find(d => d.date === selectedDay)?.slots || [];
    }, [slotsByDate, selectedDay]);

    // Get rows for selected slot
    const slotRows = useMemo(() => {
        if (!selectedSlotKey) return [];
        const slot = daySlots.find(s => s.key === selectedSlotKey);
        return slot?.rows || [];
    }, [daySlots, selectedSlotKey]);

    // Group by course
    const courseGroups = useMemo(() => {
        const grouped = {};
        for (const row of slotRows) {
            if (!grouped[row.course_code]) {
                grouped[row.course_code] = { course_code: row.course_code, course_name: row.course_name, students: [] };
            }
            grouped[row.course_code].students.push(row);
        }
        for (const code of Object.keys(grouped)) {
            grouped[code].students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
        }
        return Object.values(grouped);
    }, [slotRows]);

    // Group by hall → course
    const hallGroups = useMemo(() => {
        const grouped = {};
        for (const row of slotRows) {
            if (!grouped[row.room_name]) {
                grouped[row.room_name] = { room_name: row.room_name, students: [], courses: {} };
            }
            grouped[row.room_name].students.push(row);
            if (!grouped[row.room_name].courses[row.course_code]) {
                grouped[row.room_name].courses[row.course_code] = { course_code: row.course_code, course_name: row.course_name, students: [] };
            }
            grouped[row.room_name].courses[row.course_code].students.push(row);
        }
        for (const key of Object.keys(grouped)) {
            grouped[key].students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
            grouped[key].courseList = Object.values(grouped[key].courses);
            for (const c of grouped[key].courseList) c.students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
        }
        return Object.values(grouped).sort((a, b) => a.room_name.localeCompare(b.room_name));
    }, [slotRows]);

    // Filter
    const filteredCourses = useMemo(() => {
        if (!searchQuery.trim()) return courseGroups;
        const q = searchQuery.toLowerCase();
        return courseGroups.filter(c => c.course_code.toLowerCase().includes(q) || c.course_name?.toLowerCase().includes(q));
    }, [courseGroups, searchQuery]);

    const filteredHalls = useMemo(() => {
        if (!searchQuery.trim()) return hallGroups;
        const q = searchQuery.toLowerCase();
        return hallGroups.filter(h => h.room_name.toLowerCase().includes(q));
    }, [hallGroups, searchQuery]);

    // Active slot info for PDF date/time
    const activeSlotInfo = useMemo(() => {
        if (!selectedSlotKey || daySlots.length === 0) return null;
        const slot = daySlots.find(s => s.key === selectedSlotKey);
        if (!slot) return null;
        return { exam_date: selectedDay, start_time: slot.start_time, end_time: slot.end_time };
    }, [selectedSlotKey, daySlots, selectedDay]);

    // PDF title from the saved session
    const pdfTitle = selectedSession
        ? `Seating Plan/Attendance Sheet of ${selectedSession.exam_type} (${selectedSession.semester_type} Semester ${selectedSession.academic_year})`
        : '';

    // ═══════════════════════════════════════════════════════════════════
    //  PDF GENERATORS — identical logic but uses snapshot data
    // ═══════════════════════════════════════════════════════════════════

    const drawPDFHeader = (doc) => {
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        if (logoBase64Ref.current) {
            try {
                doc.addImage(logoBase64Ref.current, 'JPEG', mx, 7, 14, 14);
            } catch { /* logo missing/invalid — render header without it */ }
        }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('The LNM Institute of Information Technology', pw / 2, 14, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Deemed-to-be-University, Jaipur', pw / 2, 19, { align: 'center' });
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(mx, 23, pw - mx, 23);

        let y = 30;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(pdfTitle, pw / 2, y, { align: 'center' });
        const tw = doc.getTextWidth(pdfTitle);
        doc.setLineWidth(0.3);
        doc.line((pw - tw) / 2, y + 1.2, (pw + tw) / 2, y + 1.2);
        return y + 9;
    };

    const drawPDFFooter = (doc, fy) => {
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;
        const ph = doc.internal.pageSize.getHeight();
        if (fy > ph - 40) { doc.addPage(); fy = 15; }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setLineWidth(0.3);
        doc.rect(mx, fy, cw, 8);
        doc.text('No. of Students    :    Present...............    Absent...............', mx + 3, fy + 5);
        fy += 10;
        doc.rect(mx, fy, cw, 8);
        doc.text('Sign of Invigilators  : 1..............................   2..............................   3..............................   4..............................', mx + 3, fy + 5);
        fy += 10;
        doc.rect(mx, fy, cw, 8);
        doc.text('Name of Invigilators :1..............................   2..............................   3..............................   4..............................', mx + 3, fy + 5);
    };

    // Course-wise PDF
    const handleDownloadCoursePDF = async (courseData) => {
        if (!activeSlotInfo) return;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;
        let y = drawPDFHeader(doc);

        doc.setLineWidth(0.3);
        doc.rect(mx, y - 4, cw, 9);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Course Name: ${courseData.course_name}`, mx + 3, y + 1);
        doc.text(`Date: ${formatDatePDF(activeSlotInfo.exam_date)}  Time: ${formatTime12(activeSlotInfo.start_time)} To ${formatTime12(activeSlotInfo.end_time)}`, pw - mx - 3, y + 1, { align: 'right' });
        y += 8;

        const rows = courseData.students.map((s, i) => [(i + 1).toString(), s.roll_number, s.student_name || '', s.section_name || '', s.seat_number, s.room_name, '']);
        autoTable(doc, {
            startY: y,
            head: [['S. No.', 'Roll. No.', 'Student Name', 'Section', 'Seat No.', 'Hall No.', 'Signature']],
            body: rows, theme: 'grid',
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3 },
            bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
            columnStyles: { 0: { halign: 'center', cellWidth: 14 }, 1: { cellWidth: 24 }, 2: { cellWidth: 50 }, 3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'center', cellWidth: 18 }, 5: { halign: 'center', cellWidth: 18 }, 6: { cellWidth: 30 } },
            margin: { left: mx, right: mx },
        });
        drawPDFFooter(doc, doc.lastAutoTable.finalY + 3);
        doc.save(`Past_${courseData.course_code}_${activeSlotInfo.exam_date?.split('T')[0] || 'exam'}.pdf`);
    };

    // Hall-wise PDF (all courses in a hall)
    const handleDownloadHallPDF = async (hallData) => {
        if (!activeSlotInfo) return;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;
        let y = drawPDFHeader(doc);

        doc.setLineWidth(0.3);
        doc.rect(mx, y - 4, cw, 9);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Hall No: ${hallData.room_name}`, mx + 3, y + 1);
        doc.text(`Date: ${formatDatePDF(activeSlotInfo.exam_date)}  Time: ${formatTime12(activeSlotInfo.start_time)} To ${formatTime12(activeSlotInfo.end_time)}`, pw - mx - 3, y + 1, { align: 'right' });
        y += 8;

        const rows = hallData.students.map((s, i) => [(i + 1).toString(), s.roll_number, s.student_name || '', s.section_name || '', s.course_code, s.seat_number, '']);
        autoTable(doc, {
            startY: y,
            head: [['S. No.', 'Roll. No.', 'Student Name', 'Section', 'Course', 'Seat No.', 'Signature']],
            body: rows, theme: 'grid',
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3 },
            bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
            columnStyles: { 0: { halign: 'center', cellWidth: 14 }, 1: { cellWidth: 24 }, 2: { cellWidth: 45 }, 3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'center', cellWidth: 22 }, 5: { halign: 'center', cellWidth: 18 }, 6: { cellWidth: 28 } },
            margin: { left: mx, right: mx },
        });
        drawPDFFooter(doc, doc.lastAutoTable.finalY + 3);
        doc.save(`Past_${hallData.room_name}_${activeSlotInfo.exam_date?.split('T')[0] || 'exam'}.pdf`);
    };

    // Hall + Course specific PDF
    const handleDownloadHallCoursePDF = async (hallData, courseData) => {
        if (!activeSlotInfo) return;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;
        let y = drawPDFHeader(doc);

        doc.setLineWidth(0.3);
        doc.rect(mx, y - 4, cw, 14);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Hall No: ${hallData.room_name}`, mx + 3, y);
        doc.text(`Date: ${formatDatePDF(activeSlotInfo.exam_date)}  Time: ${formatTime12(activeSlotInfo.start_time)} To ${formatTime12(activeSlotInfo.end_time)}`, pw - mx - 3, y, { align: 'right' });
        doc.text(`Course Name: ${courseData.course_name} (${courseData.course_code})`, mx + 3, y + 6);
        y += 14;

        const rows = courseData.students.map((s, i) => [(i + 1).toString(), s.roll_number, s.student_name || '', s.section_name || '', s.seat_number, '']);
        autoTable(doc, {
            startY: y,
            head: [['S. No.', 'Roll. No.', 'Student Name', 'Section', 'Seat No.', 'Signature']],
            body: rows, theme: 'grid',
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3 },
            bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
            columnStyles: { 0: { halign: 'center', cellWidth: 14 }, 1: { cellWidth: 26 }, 2: { cellWidth: 55 }, 3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'center', cellWidth: 20 }, 5: { cellWidth: 35 } },
            margin: { left: mx, right: mx },
        });
        drawPDFFooter(doc, doc.lastAutoTable.finalY + 3);
        doc.save(`Past_${hallData.room_name}_${courseData.course_code}_${activeSlotInfo.exam_date?.split('T')[0] || 'exam'}.pdf`);
    };

    const handleDownloadAll = async () => {
        if (viewMode === 'course') {
            for (const c of filteredCourses) await handleDownloadCoursePDF(c);
        } else {
            for (const h of filteredHalls) await handleDownloadHallPDF(h);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════════════════════════════════

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <svg className="animate-spin h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
            </div>
        );
    }

    return (
        <div className="max-w-full">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Past Exams</h2>
                <p className="text-sm text-textMuted mt-1">View and download PDFs from previously saved exam sessions</p>
            </div>

            {/* ── Step 1: Select a Session ── */}
            <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
                <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">1</span>
                    Select Saved Exam Session
                </h3>
                {sessions.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-sm text-textFaint">No saved sessions. Save one from the PDF Reports page first.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {sessions.map((session) => {
                            const isActive = selectedSession?.id === session.id;
                            return (
                                <div key={session.id}
                                    onClick={() => handleSelectSession(session)}
                                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${isActive
                                        ? 'border-brand-500 bg-brand-500/5 shadow-md'
                                        : 'border-border hover:border-brand-500/40 hover:bg-surface2'}`}>
                                    {isActive && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-success/100 rounded-full border-2 border-white" />}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-text">{session.exam_type}</span>
                                            </div>
                                            <div className="flex items-center flex-wrap gap-2">
                                                <span className="px-2 py-0.5 bg-surface2 text-textMuted text-[10px] font-bold uppercase rounded">{session.semester_type} Sem</span>
                                                <span className="px-2 py-0.5 bg-brand-500/10 text-brand-500 text-[10px] font-bold uppercase rounded">{session.academic_year}</span>
                                                <div className="flex items-center gap-2 text-textMuted ml-1">
                                                    <div className="flex items-center gap-1" title="Total Students">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                                        </svg>
                                                        <span className="text-[10px] font-bold">{session.total_students}</span>
                                                    </div>
                                                    <span className="text-[10px] text-textFaint">·</span>
                                                    <div className="flex items-center gap-1" title="Total Courses">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                                        </svg>
                                                        <span className="text-[10px] font-bold">{session.total_courses}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-textFaint mt-2">Saved: {formatSavedAt(session.saved_at)}</p>
                                        </div>
                                        <button onClick={(e) => handleDelete(e, session.id)}
                                            className="text-textFaint hover:text-danger hover:bg-danger/10 transition-colors p-2 rounded-lg cursor-pointer"
                                            title="Delete Session">
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

            {/* Below only shows when a session is selected and data loaded */}
            {selectedSession && (
                loadingSession ? (
                    <div className="flex items-center justify-center py-16">
                        <svg className="animate-spin h-6 w-6 text-brand-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        <span className="ml-3 text-sm text-textMuted">Loading session data...</span>
                    </div>
                ) : (
                    <>
                        {/* ── Search ── */}
                        <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={viewMode === 'course' ? 'Search by course code or name...' : 'Search by hall name...'}
                                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40" />
                            </div>
                        </div>

                        {/* ── Step 2: Day → Slot ── */}
                        <div className="bg-surface rounded-xl shadow-lg border border-border p-5 mb-5">
                            <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">2</span>
                                Select Day & Slot
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {slotsByDate.map((group) => (
                                    <button key={group.date}
                                        onClick={() => { setSelectedDay(group.date); setSelectedSlotKey(null); }}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border-2 cursor-pointer ${selectedDay === group.date
                                            ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                                            : 'bg-surface text-text border-border hover:border-brand-500/40'}`}>
                                        <div className="font-bold">{formatDateDisplay(group.date)}</div>
                                    </button>
                                ))}
                            </div>
                            {selectedDay && daySlots.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-border">
                                    <div className="flex flex-wrap gap-2">
                                        {daySlots.map((slot) => {
                                            const isActive = selectedSlotKey === slot.key;
                                            return (
                                                <button key={slot.key}
                                                    onClick={() => setSelectedSlotKey(isActive ? null : slot.key)}
                                                    className={`relative px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border-2 cursor-pointer ${isActive
                                                        ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                                                        : 'bg-surface text-text border-border hover:border-brand-500/40'}`}>
                                                    {formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}
                                                    {isActive && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-success/100 rounded-full border-2 border-white" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Step 3: Download PDFs ── */}
                        <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
                            <div className="px-5 pt-5 pb-3 border-b border-border">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold">3</span>
                                        Download PDFs
                                    </h3>
                                    {((viewMode === 'course' && filteredCourses.length > 0) || (viewMode === 'hall' && filteredHalls.length > 0)) && (
                                        <button onClick={handleDownloadAll}
                                            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-brand-600 transition-all cursor-pointer shadow-sm hover:shadow-md">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                            Download All
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-1 bg-surface2 rounded-lg p-1 w-fit">
                                    <button onClick={() => setViewMode('course')}
                                        className={`px-4 py-1.5 text-[11px] uppercase tracking-wider font-bold rounded-md transition-all cursor-pointer ${viewMode === 'course' ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:bg-surface2 hover:text-text'}`}>
                                        Course Wise
                                    </button>
                                    <button onClick={() => setViewMode('hall')}
                                        className={`px-4 py-1.5 text-[11px] uppercase tracking-wider font-bold rounded-md transition-all cursor-pointer ${viewMode === 'hall' ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:bg-surface2 hover:text-text'}`}>
                                        Hall Wise
                                    </button>
                                </div>
                            </div>

                            {!selectedSlotKey ? (
                                <div className="py-16 text-center">
                                    <p className="text-sm font-medium text-textFaint">Select a day and slot above to view courses/halls</p>
                                </div>
                            ) : viewMode === 'course' ? (
                                filteredCourses.length === 0 ? (
                                    <div className="py-16 text-center"><p className="text-sm text-textFaint">No courses found.</p></div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {filteredCourses.map((course) => (
                                            <div key={course.course_code} className="px-5 py-4 flex items-center justify-between hover:bg-surface2/80 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-brand-500/5 border border-brand-500/15 flex items-center justify-center text-brand-500">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-bold text-brand-500">{course.course_code}</span>
                                                            <span className="text-xs text-textFaint">·</span>
                                                            <span className="text-sm font-medium text-text">{course.course_name}</span>
                                                        </div>
                                                        <p className="text-[11px] text-textFaint mt-0.5">{course.students.length} students</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDownloadCoursePDF(course)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-surface text-brand-500 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-brand-500/30 hover:bg-brand-500 hover:text-white transition-all cursor-pointer shadow-sm hover:shadow-md group">
                                                    <svg className="w-3.5 h-3.5 group-hover:text-white text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                    </svg>
                                                    Download PDF
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                filteredHalls.length === 0 ? (
                                    <div className="py-16 text-center"><p className="text-sm text-textFaint">No halls found.</p></div>
                                ) : (
                                    <div className="divide-y divide-slate-200">
                                        {filteredHalls.map((hall) => {
                                            const isOpen = expandedHalls[hall.room_name];
                                            return (
                                                <div key={hall.room_name}>
                                                    <div className="px-5 py-4 flex items-center justify-between hover:bg-surface2/80 transition-colors cursor-pointer group"
                                                        onClick={() => setExpandedHalls(prev => ({ ...prev, [hall.room_name]: !prev[hall.room_name] }))}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${isOpen ? 'bg-brand-500 text-white border-brand-500' : 'bg-surface2 text-textFaint border-border group-hover:bg-surface2 group-hover:text-textMuted'}`}>
                                                                {isOpen ? (
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="font-mono text-sm font-bold text-text">{hall.room_name}</span>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[11px] text-textFaint">{hall.students.length} students</span>
                                                                    <span className="text-[11px] text-textFaint">·</span>
                                                                    <span className="text-[11px] text-textFaint">{hall.courseList.length} course{hall.courseList.length !== 1 ? 's' : ''}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadHallPDF(hall); }}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface text-textMuted text-[10px] font-bold uppercase tracking-wider rounded-lg border border-border hover:bg-surface2 hover:text-text transition-colors cursor-pointer shadow-sm">
                                                            <svg className="w-3 h-3 text-textMuted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                            </svg>
                                                            All ({hall.room_name})
                                                        </button>
                                                    </div>
                                                    {isOpen && (
                                                        <div className="bg-surface2/60 border-t border-border shadow-sm">
                                                            {hall.courseList.map((course) => (
                                                                <div key={course.course_code} className="px-5 pl-16 py-3 flex items-center justify-between hover:bg-surface2/60 border-b border-border last:border-b-0 shadow-sm">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded bg-brand-500/5 border border-brand-500/15 flex items-center justify-center text-brand-500">
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                                            </svg>
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-mono text-xs font-bold text-brand-500">{course.course_code}</span>
                                                                                <span className="text-xs text-textFaint">·</span>
                                                                                <span className="text-sm font-medium text-text">{course.course_name}</span>
                                                                            </div>
                                                                            <p className="text-[10px] text-textFaint mt-0.5">{course.students.length} students in {hall.room_name}</p>
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={() => handleDownloadHallCoursePDF(hall, course)}
                                                                        className="flex items-center gap-2 px-4 py-2 bg-surface text-brand-500 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-brand-500/30 hover:bg-brand-500 hover:text-white transition-all cursor-pointer shadow-sm hover:shadow-md group">
                                                                        <svg className="w-3.5 h-3.5 group-hover:text-white text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                                                        </svg>
                                                                        Download PDF
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            )}
                        </div>
                    </>
                )
            )}
        </div>
    );
}
