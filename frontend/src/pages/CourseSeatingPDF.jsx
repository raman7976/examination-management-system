import { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getExamSlots, getPlanView, saveExamSession } from '../api/api.js';
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

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CourseSeatingPDF() {
    const [slots, setSlots] = useState([]);
    const [selectedDay, setSelectedDay] = useState(null);
    const [selectedSlotId, setSelectedSlotId] = useState(null);
    const [seatingData, setSeatingData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('course'); // 'course' or 'hall'
    const [expandedHalls, setExpandedHalls] = useState({});
    const [examType, setExamType] = useState('Mid Term Examination');
    const [semesterType, setSemesterType] = useState('Even');
    const [academicYear, setAcademicYear] = useState('2025-26');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState({ type: '', text: '' });
    const logoBase64Ref = useRef(null);

    // ── Pre-load logo as base64 for PDF ──
    useEffect(() => {
        (async () => {
            try {
                const resp = await fetch(logo);
                const blob = await resp.blob();
                const reader = new FileReader();
                reader.onload = () => { logoBase64Ref.current = reader.result; };
                reader.readAsDataURL(blob);
            } catch (e) { console.warn('Logo load failed:', e); }
        })();
    }, []);

    // ── Fetch slots on mount ──
    useEffect(() => {
        (async () => {
            try {
                const res = await getExamSlots();
                setSlots(res.data?.slots || []);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, []);

    // ── Group slots by date ──
    const slotsByDate = useMemo(() => {
        const grouped = {};
        for (const slot of slots) {
            const key = slot.exam_date;
            if (!grouped[key]) grouped[key] = { date: key, day: slot.exam_day, slots: [] };
            grouped[key].slots.push(slot);
        }
        return Object.values(grouped);
    }, [slots]);

    // ── Auto-select first day ──
    useEffect(() => {
        if (slotsByDate.length > 0 && !selectedDay) setSelectedDay(slotsByDate[0].date);
    }, [slotsByDate, selectedDay]);

    const daySlots = useMemo(() => {
        if (!selectedDay) return [];
        return slotsByDate.find(d => d.date === selectedDay)?.slots || [];
    }, [slotsByDate, selectedDay]);

    // ── Fetch seating data when slot changes ──
    useEffect(() => {
        if (!selectedSlotId) { setSeatingData([]); return; }
        (async () => {
            setLoadingPlan(true);
            try {
                const res = await getPlanView(selectedSlotId);
                if (res.data?.success) setSeatingData(res.data.data || []);
            } catch (e) { console.error(e); setSeatingData([]); }
            finally { setLoadingPlan(false); }
        })();
    }, [selectedSlotId]);

    // ── Group seating data by course ──
    const courseGroups = useMemo(() => {
        const grouped = {};
        for (const row of seatingData) {
            if (!grouped[row.course_code]) {
                grouped[row.course_code] = { course_code: row.course_code, course_name: row.course_name || row.course_code, students: [] };
            }
            grouped[row.course_code].students.push(row);
        }
        for (const code of Object.keys(grouped)) {
            grouped[code].students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
        }
        return Object.values(grouped);
    }, [seatingData]);

    // ── Group seating data by hall → course ──
    const hallGroups = useMemo(() => {
        const grouped = {};
        for (const row of seatingData) {
            const key = row.room_name;
            if (!grouped[key]) {
                grouped[key] = { room_name: key, classroom_id: row.classroom_id, students: [], courses: {} };
            }
            grouped[key].students.push(row);
            // Sub-group by course within the hall
            if (!grouped[key].courses[row.course_code]) {
                grouped[key].courses[row.course_code] = { course_code: row.course_code, course_name: row.course_name || row.course_code, students: [] };
            }
            grouped[key].courses[row.course_code].students.push(row);
        }
        for (const key of Object.keys(grouped)) {
            grouped[key].students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
            for (const cc of Object.keys(grouped[key].courses)) {
                grouped[key].courses[cc].students.sort((a, b) => a.roll_number.localeCompare(b.roll_number));
            }
            grouped[key].courseList = Object.values(grouped[key].courses);
        }
        return Object.values(grouped).sort((a, b) => a.room_name.localeCompare(b.room_name));
    }, [seatingData]);

    // ── Filter by search ──
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

    const activeSlot = slots.find(s => s.id === Number(selectedSlotId));

    // ═════════════════════════════════════════════════════════════════════════════
    //  PDF GENERATION — matches the exact format from user's reference
    // ═════════════════════════════════════════════════════════════════════════════

    const handleDownloadPDF = async (courseData) => {
        if (!activeSlot) return;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;

        // ── Logo + Institute Header ──
        if (logoBase64Ref.current) {
            try { doc.addImage(logoBase64Ref.current, 'JPEG', mx, 7, 14, 14); } catch (e) { /* skip */ }
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

        // ── Title (underlined) ──
        let y = 30;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const title = pdfTitle;
        doc.text(title, pw / 2, y, { align: 'center' });
        const tw = doc.getTextWidth(title);
        doc.setLineWidth(0.3);
        doc.line((pw - tw) / 2, y + 1.2, (pw + tw) / 2, y + 1.2);

        y += 9;

        // ── Course Name + Date/Time (boxed row) ──
        doc.setLineWidth(0.3);
        doc.rect(mx, y - 4, cw, 9);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Course Name: ${courseData.course_name}`, mx + 3, y + 1);
        const dateStr = formatDatePDF(activeSlot.exam_date);
        const timeStr = `${formatTime12(activeSlot.start_time)} To ${formatTime12(activeSlot.end_time)}`;
        doc.text(`Date: ${dateStr}  Time: ${timeStr}`, pw - mx - 3, y + 1, { align: 'right' });

        y += 8;

        // ── Student Table ──
        const tableRows = courseData.students.map((s, i) => [
            (i + 1).toString(), s.roll_number, s.student_name || '', s.section_name || '', s.seat_number, s.room_name, ''
        ]);

        autoTable(doc, {
            startY: y,
            head: [['S. No.', 'Roll. No.', 'Student Name', 'Section', 'Seat No.', 'Hall No.', 'Signature']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3 },
            bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 14 },
                1: { cellWidth: 24 },
                2: { cellWidth: 50 },
                3: { halign: 'center', cellWidth: 18 },
                4: { halign: 'center', cellWidth: 18 },
                5: { halign: 'center', cellWidth: 18 },
                6: { cellWidth: 30 },
            },
            margin: { left: mx, right: mx },
        });

        // ── Footer ──
        let fy = doc.lastAutoTable.finalY + 3;
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

        doc.save(`Seating_${courseData.course_code}_${activeSlot.exam_date?.split('T')[0] || 'exam'}.pdf`);
    };

    // ═════════════════════════════════════════════════════════════════════════════
    //  HALL-WISE PDF GENERATION
    // ═════════════════════════════════════════════════════════════════════════════

    const handleDownloadHallPDF = async (hallData) => {
        if (!activeSlot) return;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;

        if (logoBase64Ref.current) {
            try { doc.addImage(logoBase64Ref.current, 'JPEG', mx, 7, 14, 14); } catch (e) { /* skip */ }
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
        const title = pdfTitle;
        doc.text(title, pw / 2, y, { align: 'center' });
        const tw = doc.getTextWidth(title);
        doc.setLineWidth(0.3);
        doc.line((pw - tw) / 2, y + 1.2, (pw + tw) / 2, y + 1.2);

        y += 9;

        // ── Hall No + Date/Time (boxed row) ──
        doc.setLineWidth(0.3);
        doc.rect(mx, y - 4, cw, 9);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Hall No: ${hallData.room_name}`, mx + 3, y + 1);
        const dateStr = formatDatePDF(activeSlot.exam_date);
        const timeStr = `${formatTime12(activeSlot.start_time)} To ${formatTime12(activeSlot.end_time)}`;
        doc.text(`Date: ${dateStr}  Time: ${timeStr}`, pw - mx - 3, y + 1, { align: 'right' });

        y += 8;

        // ── Table with Course column ──
        const tableRows = hallData.students.map((s, i) => [
            (i + 1).toString(), s.roll_number, s.student_name || '', s.section_name || '', s.course_code, s.seat_number, ''
        ]);

        autoTable(doc, {
            startY: y,
            head: [['S. No.', 'Roll. No.', 'Student Name', 'Section', 'Course', 'Seat No.', 'Signature']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3 },
            bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 14 },
                1: { cellWidth: 24 },
                2: { cellWidth: 45 },
                3: { halign: 'center', cellWidth: 18 },
                4: { halign: 'center', cellWidth: 22 },
                5: { halign: 'center', cellWidth: 18 },
                6: { cellWidth: 28 },
            },
            margin: { left: mx, right: mx },
        });

        let fy = doc.lastAutoTable.finalY + 3;
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

        doc.save(`Seating_${hallData.room_name}_${activeSlot.exam_date?.split('T')[0] || 'exam'}.pdf`);
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    //  HALL + COURSE PDF (e.g., LH-10 × CSE437)
    // ═══════════════════════════════════════════════════════════════════════════════

    const handleDownloadHallCoursePDF = async (hallData, courseData) => {
        if (!activeSlot) return;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth();
        const mx = 15;
        const cw = pw - 2 * mx;

        if (logoBase64Ref.current) {
            try { doc.addImage(logoBase64Ref.current, 'JPEG', mx, 7, 14, 14); } catch (e) { /* skip */ }
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
        const title = pdfTitle;
        doc.text(title, pw / 2, y, { align: 'center' });
        const tw = doc.getTextWidth(title);
        doc.setLineWidth(0.3);
        doc.line((pw - tw) / 2, y + 1.2, (pw + tw) / 2, y + 1.2);

        y += 9;

        // ── Two-row info box: Hall + Course, Date + Time ──
        doc.setLineWidth(0.3);
        doc.rect(mx, y - 4, cw, 14);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Hall No: ${hallData.room_name}`, mx + 3, y);
        const dateStr = formatDatePDF(activeSlot.exam_date);
        const timeStr = `${formatTime12(activeSlot.start_time)} To ${formatTime12(activeSlot.end_time)}`;
        doc.text(`Date: ${dateStr}  Time: ${timeStr}`, pw - mx - 3, y, { align: 'right' });
        doc.text(`Course Name: ${courseData.course_name} (${courseData.course_code})`, mx + 3, y + 6);

        y += 14;

        const tableRows = courseData.students.map((s, i) => [
            (i + 1).toString(), s.roll_number, s.student_name || '', s.section_name || '', s.seat_number, ''
        ]);

        autoTable(doc, {
            startY: y,
            head: [['S. No.', 'Roll. No.', 'Student Name', 'Section', 'Seat No.', 'Signature']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3 },
            bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 14 },
                1: { cellWidth: 26 },
                2: { cellWidth: 55 },
                3: { halign: 'center', cellWidth: 18 },
                4: { halign: 'center', cellWidth: 20 },
                5: { cellWidth: 35 },
            },
            margin: { left: mx, right: mx },
        });

        let fy = doc.lastAutoTable.finalY + 3;
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

        doc.save(`Seating_${hallData.room_name}_${courseData.course_code}_${activeSlot.exam_date?.split('T')[0] || 'exam'}.pdf`);
    };

    const handleDownloadAll = async () => {
        if (viewMode === 'course') {
            for (const course of filteredCourses) await handleDownloadPDF(course);
        } else {
            for (const hall of filteredHalls) await handleDownloadHallPDF(hall);
        }
    };

    // ── Build dynamic PDF title ──
    const pdfTitle = `Seating Plan/Attendance Sheet of ${examType} (${semesterType} Semester ${academicYear})`;

    // ── Save session handler ──
    const handleSaveSession = async () => {
        setSaving(true);
        setSaveMsg({ type: '', text: '' });
        try {
            const res = await saveExamSession({ exam_type: examType, semester_type: semesterType, academic_year: academicYear });
            setSaveMsg({ type: 'success', text: res.data?.message || 'Session saved!' });
        } catch (e) {
            setSaveMsg({ type: 'error', text: e.response?.data?.message || 'Failed to save session.' });
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg({ type: '', text: '' }), 5000);
        }
    };

    // ═════════════════════════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════════════════════════

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
            {/* Page Header + Save Button */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">PDF Reports</h2>
                    <p className="text-sm text-slate-500 mt-1">Generate course-wise or hall-wise seating plan / attendance sheet PDFs</p>
                </div>
                <button onClick={handleSaveSession} disabled={saving}
                    className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer ${saving ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#8B1A1A] text-white hover:bg-[#721515] hover:shadow-md'}`}>
                    {saving ? 'Saving...' : '💾 Save Session'}
                </button>
            </div>

            {/* Save Message */}
            {saveMsg.text && (
                <div className={`mb-4 p-3 rounded-lg border text-sm ${saveMsg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {saveMsg.text}
                </div>
            )}

            {/* Exam Config: Type + Semester + Year */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5 mb-5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Exam Configuration</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Exam Type</label>
                        <select value={examType} onChange={(e) => setExamType(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40 cursor-pointer">
                            <option value="Mid Term Examination">Mid Term Examination</option>
                            <option value="End Term Examination">End Term Examination</option>
                            <option value="Summer Term Examination">Summer Term Examination</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Semester</label>
                        <select value={semesterType} onChange={(e) => setSemesterType(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40 cursor-pointer">
                            <option value="Even">Even Semester</option>
                            <option value="Odd">Odd Semester</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Academic Year</label>
                        <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40 cursor-pointer">
                            <option value="2024-25">2024-25</option>
                            <option value="2025-26">2025-26</option>
                            <option value="2026-27">2026-27</option>
                            <option value="2027-28">2027-28</option>
                        </select>
                    </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-3">PDF Title: <span className="font-semibold text-slate-600">{pdfTitle}</span></p>
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5 mb-5">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={viewMode === 'course' ? 'Search by course code or name...' : 'Search by hall name (e.g. LH-1)...'}
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40 transition-all" />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Day → Slot Selection */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5 mb-5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-[#8B1A1A] flex items-center justify-center text-white text-[10px] font-bold">1</span>
                    Select Exam Day
                </h3>
                {slotsByDate.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No exam days found.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {slotsByDate.map((group) => (
                            <button key={group.date}
                                onClick={() => { setSelectedDay(group.date); setSelectedSlotId(null); setSeatingData([]); }}
                                className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border-2 cursor-pointer ${selectedDay === group.date
                                    ? 'bg-[#8B1A1A] text-white border-[#8B1A1A] shadow-md'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-[#8B1A1A]/40 hover:bg-red-50/50'
                                    }`}>
                                <div className="font-bold">{group.day}</div>
                                <div className="text-[10px] mt-0.5 opacity-80">{formatDateDisplay(group.date)}</div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Slot Chips */}
                {selectedDay && daySlots.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-[#8B1A1A] flex items-center justify-center text-white text-[10px] font-bold">2</span>
                            Select Time Slot
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {daySlots.map((slot) => {
                                const isActive = selectedSlotId === slot.id;
                                return (
                                    <button key={slot.id}
                                        onClick={() => setSelectedSlotId(isActive ? null : slot.id)}
                                        className={`relative px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border-2 cursor-pointer ${isActive
                                            ? 'bg-[#8B1A1A] text-white border-[#8B1A1A] shadow-md'
                                            : 'bg-white text-slate-700 border-slate-200 hover:border-[#8B1A1A]/40 hover:bg-red-50/50'
                                            }`}>
                                        {formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}
                                        {isActive && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Download Section */}
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
                                ⬇ Download All PDFs
                            </button>
                        )}
                    </div>
                    {/* Mode Toggle */}
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

                {!selectedSlotId ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                            <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-400">Select a day and time slot to view {viewMode === 'course' ? 'courses' : 'halls'}</p>
                    </div>
                ) : loadingPlan ? (
                    <div className="flex items-center justify-center py-16">
                        <svg className="animate-spin h-6 w-6 text-[#8B1A1A]" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        <span className="ml-3 text-sm text-slate-500">Loading seating data...</span>
                    </div>
                ) : viewMode === 'course' ? (
                    /* ── COURSE-WISE LIST ── */
                    filteredCourses.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-slate-400">
                                {courseGroups.length === 0 ? 'No micro-seating plan found. Generate it from the Seating Arrangement page first.' : `No courses match "${searchQuery}"`}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredCourses.map((course) => (
                                <div key={course.course_code} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-[#8B1A1A]/10 flex items-center justify-center text-[#8B1A1A] text-sm font-bold">📄</div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-[#8B1A1A] tracking-wide">{course.course_code}</span>
                                                <span className="text-xs text-slate-400">·</span>
                                                <span className="text-sm font-medium text-slate-800">{course.course_name}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{course.students.length} student{course.students.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDownloadPDF(course)}
                                        className="px-4 py-2 bg-white text-[#8B1A1A] text-[10px] font-bold uppercase tracking-wider rounded-lg border border-[#8B1A1A]/30 hover:bg-[#8B1A1A] hover:text-white transition-all cursor-pointer shadow-sm hover:shadow-md">
                                        ⬇ Download PDF
                                    </button>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    /* ── HALL-WISE LIST ── */
                    filteredHalls.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-slate-400">
                                {hallGroups.length === 0 ? 'No micro-seating plan found. Generate it from the Seating Arrangement page first.' : `No halls match "${searchQuery}"`}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {filteredHalls.map((hall) => {
                                const isOpen = expandedHalls[hall.room_name];
                                return (
                                    <div key={hall.room_name}>
                                        {/* Hall Header (clickable) */}
                                        <div
                                            className="px-5 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer"
                                            onClick={() => setExpandedHalls(prev => ({ ...prev, [hall.room_name]: !prev[hall.room_name] }))}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${isOpen ? 'bg-[#8B1A1A] text-white' : 'bg-blue-50 text-blue-700'}`}>
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
                                            <div className="flex items-center gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); handleDownloadHallPDF(hall); }}
                                                    className="px-3 py-1.5 bg-white text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer shadow-sm">
                                                    ⬇ All ({hall.room_name})
                                                </button>
                                            </div>
                                        </div>
                                        {/* Expanded: courses inside this hall */}
                                        {isOpen && (
                                            <div className="bg-slate-50/60 border-t border-slate-100">
                                                {hall.courseList.map((course) => (
                                                    <div key={course.course_code} className="px-5 pl-16 py-3 flex items-center justify-between hover:bg-slate-100/60 transition-colors border-b border-slate-100 last:border-b-0">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded bg-[#8B1A1A]/10 flex items-center justify-center text-[#8B1A1A] text-xs font-bold">📄</div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-xs font-bold text-[#8B1A1A] tracking-wide">{course.course_code}</span>
                                                                    <span className="text-xs text-slate-400">·</span>
                                                                    <span className="text-sm font-medium text-slate-700">{course.course_name}</span>
                                                                </div>
                                                                <p className="text-[10px] text-slate-400 mt-0.5">{course.students.length} student{course.students.length !== 1 ? 's' : ''} in {hall.room_name}</p>
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
        </div>
    );
}
