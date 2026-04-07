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
            } catch (e) { /* skip */ }
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
            try { doc.addImage(logoBase64Ref.current, 'JPEG', mx, 7, 14, 14); } catch (e) { }
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
                <svg className="animate-spin h-8 w-8 text-[#8B1A1A]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
            </div>
        );
    }

    return (
        <div className="max-w-full">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">Past Exams</h2>
                <p className="text-sm text-slate-500 mt-1">View and download PDFs from previously saved exam sessions</p>
            </div>

            {/* ── Step 1: Select a Session ── */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5 mb-5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-[#8B1A1A] flex items-center justify-center text-white text-[10px] font-bold">1</span>
                    Select Saved Exam Session
                </h3>
                {sessions.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-sm text-slate-400">No saved sessions. Save one from the PDF Reports page first.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {sessions.map((session) => {
                            const isActive = selectedSession?.id === session.id;
                            return (
                                <div key={session.id}
                                    onClick={() => handleSelectSession(session)}
                                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${isActive
                                        ? 'border-[#8B1A1A] bg-[#8B1A1A]/5 shadow-md'
                                        : 'border-slate-200 hover:border-[#8B1A1A]/40 hover:bg-slate-50'}`}>
                                    {isActive && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-slate-800">{session.exam_type}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded">{session.semester_type} Sem</span>
                                                <span className="px-2 py-0.5 bg-[#8B1A1A]/10 text-[#8B1A1A] text-[10px] font-bold uppercase rounded">{session.academic_year}</span>
                                                <span className="text-[10px] text-slate-400">👥 {session.total_students} · 📚 {session.total_courses}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Saved: {formatSavedAt(session.saved_at)}</p>
                                        </div>
                                        <button onClick={(e) => handleDelete(e, session.id)}
                                            className="text-red-400 hover:text-red-600 text-xs cursor-pointer p-1">🗑</button>
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
                        <svg className="animate-spin h-6 w-6 text-[#8B1A1A]" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        <span className="ml-3 text-sm text-slate-500">Loading session data...</span>
                    </div>
                ) : (
                    <>
                        {/* ── Search ── */}
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5 mb-5">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={viewMode === 'course' ? 'Search by course code or name...' : 'Search by hall name...'}
                                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40" />
                            </div>
                        </div>

                        {/* ── Step 2: Day → Slot ── */}
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5 mb-5">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-[#8B1A1A] flex items-center justify-center text-white text-[10px] font-bold">2</span>
                                Select Day & Slot
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {slotsByDate.map((group) => (
                                    <button key={group.date}
                                        onClick={() => { setSelectedDay(group.date); setSelectedSlotKey(null); }}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border-2 cursor-pointer ${selectedDay === group.date
                                            ? 'bg-[#8B1A1A] text-white border-[#8B1A1A] shadow-md'
                                            : 'bg-white text-slate-700 border-slate-200 hover:border-[#8B1A1A]/40'}`}>
                                        <div className="font-bold">{formatDateDisplay(group.date)}</div>
                                    </button>
                                ))}
                            </div>
                            {selectedDay && daySlots.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <div className="flex flex-wrap gap-2">
                                        {daySlots.map((slot) => {
                                            const isActive = selectedSlotKey === slot.key;
                                            return (
                                                <button key={slot.key}
                                                    onClick={() => setSelectedSlotKey(isActive ? null : slot.key)}
                                                    className={`relative px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border-2 cursor-pointer ${isActive
                                                        ? 'bg-[#8B1A1A] text-white border-[#8B1A1A] shadow-md'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#8B1A1A]/40'}`}>
                                                    {formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}
                                                    {isActive && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Step 3: Download PDFs ── */}
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
                            <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-5 h-5 rounded bg-[#8B1A1A] flex items-center justify-center text-white text-[10px] font-bold">3</span>
                                        Download PDFs
                                    </h3>
                                    {((viewMode === 'course' && filteredCourses.length > 0) || (viewMode === 'hall' && filteredHalls.length > 0)) && (
                                        <button onClick={handleDownloadAll}
                                            className="px-4 py-2 bg-[#8B1A1A] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#721515] transition-all cursor-pointer shadow-sm hover:shadow-md">
                                            ⬇ Download All
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                                    <button onClick={() => setViewMode('course')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${viewMode === 'course' ? 'bg-[#8B1A1A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                                        📚 Course Wise
                                    </button>
                                    <button onClick={() => setViewMode('hall')}
                                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${viewMode === 'hall' ? 'bg-[#8B1A1A] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                                        🏛️ Hall Wise
                                    </button>
                                </div>
                            </div>

                            {!selectedSlotKey ? (
                                <div className="py-16 text-center">
                                    <p className="text-sm font-medium text-slate-400">Select a day and slot above to view courses/halls</p>
                                </div>
                            ) : viewMode === 'course' ? (
                                filteredCourses.length === 0 ? (
                                    <div className="py-16 text-center"><p className="text-sm text-slate-400">No courses found.</p></div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {filteredCourses.map((course) => (
                                            <div key={course.course_code} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-[#8B1A1A]/10 flex items-center justify-center text-[#8B1A1A] text-sm font-bold">📄</div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-bold text-[#8B1A1A]">{course.course_code}</span>
                                                            <span className="text-xs text-slate-400">·</span>
                                                            <span className="text-sm font-medium text-slate-800">{course.course_name}</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">{course.students.length} students</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDownloadCoursePDF(course)}
                                                    className="px-4 py-2 bg-white text-[#8B1A1A] text-[10px] font-bold uppercase tracking-wider rounded-lg border border-[#8B1A1A]/30 hover:bg-[#8B1A1A] hover:text-white transition-all cursor-pointer shadow-sm hover:shadow-md">
                                                    ⬇ Download PDF
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                filteredHalls.length === 0 ? (
                                    <div className="py-16 text-center"><p className="text-sm text-slate-400">No halls found.</p></div>
                                ) : (
                                    <div className="divide-y divide-slate-200">
                                        {filteredHalls.map((hall) => {
                                            const isOpen = expandedHalls[hall.room_name];
                                            return (
                                                <div key={hall.room_name}>
                                                    <div className="px-5 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer"
                                                        onClick={() => setExpandedHalls(prev => ({ ...prev, [hall.room_name]: !prev[hall.room_name] }))}>
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${isOpen ? 'bg-[#8B1A1A] text-white' : 'bg-blue-50 text-blue-700'}`}>
                                                                {isOpen ? '−' : '+'}
                                                            </div>
                                                            <div>
                                                                <span className="font-mono text-sm font-bold text-slate-800">{hall.room_name}</span>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[11px] text-slate-400">{hall.students.length} students</span>
                                                                    <span className="text-[11px] text-slate-300">·</span>
                                                                    <span className="text-[11px] text-slate-400">{hall.courseList.length} course{hall.courseList.length !== 1 ? 's' : ''}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadHallPDF(hall); }}
                                                            className="px-3 py-1.5 bg-white text-slate-600 text-[10px] font-bold uppercase rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer shadow-sm">
                                                            ⬇ All ({hall.room_name})
                                                        </button>
                                                    </div>
                                                    {isOpen && (
                                                        <div className="bg-slate-50/60 border-t border-slate-100">
                                                            {hall.courseList.map((course) => (
                                                                <div key={course.course_code} className="px-5 pl-16 py-3 flex items-center justify-between hover:bg-slate-100/60 border-b border-slate-100 last:border-b-0">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded bg-[#8B1A1A]/10 flex items-center justify-center text-[#8B1A1A] text-xs font-bold">📄</div>
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-mono text-xs font-bold text-[#8B1A1A]">{course.course_code}</span>
                                                                                <span className="text-xs text-slate-400">·</span>
                                                                                <span className="text-sm font-medium text-slate-700">{course.course_name}</span>
                                                                            </div>
                                                                            <p className="text-[10px] text-slate-400 mt-0.5">{course.students.length} students in {hall.room_name}</p>
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={() => handleDownloadHallCoursePDF(hall, course)}
                                                                        className="px-4 py-2 bg-white text-[#8B1A1A] text-[10px] font-bold uppercase tracking-wider rounded-lg border border-[#8B1A1A]/30 hover:bg-[#8B1A1A] hover:text-white transition-all cursor-pointer shadow-sm hover:shadow-md">
                                                                        ⬇ Download PDF
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
