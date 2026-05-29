import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { getExamSlots, generateMicroPlan, getPlanView, getSeatingArrangementStatus } from '../api/api.js';
import PeriodScopedEmptyState from '../components/PeriodScopedEmptyState.jsx';

export default function SeatingArrangement() {
    const [slots, setSlots] = useState([]);
    const [selectedSlotId, setSelectedSlotId] = useState('');
    // Map<slot_id (string), { has_plan, plan_count }>
    const [slotStatus, setSlotStatus] = useState({});

    // Data grouped by classroom_id
    const [groupedPlanData, setGroupedPlanData] = useState({});
    const [loadingGrid, setLoadingGrid] = useState(false);

    const [isGenerating, setIsGenerating] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Track which accordions are open by classroom_id
    const [openRooms, setOpenRooms] = useState(new Set());

    // Fetch Slots + per-slot algorithm-run status on mount
    const loadInitialData = async () => {
        try {
            const [slotRes, statusRes] = await Promise.all([
                getExamSlots(),
                getSeatingArrangementStatus(),
            ]);
            if (slotRes.data?.slots) setSlots(slotRes.data.slots);
            const map = {};
            for (const s of (statusRes.data?.slots || [])) {
                map[String(s.slot_id)] = { has_plan: s.has_plan, plan_count: s.plan_count };
            }
            setSlotStatus(map);
        } catch (err) {
            console.error("Failed to load selectors:", err);
        }
    };
    useEffect(() => { loadInitialData(); }, []);

    // Summary string for top banner
    const statusSummary = useMemo(() => {
        const total = slots.length;
        const done = slots.filter(s => slotStatus[String(s.id)]?.has_plan).length;
        return { total, done };
    }, [slots, slotStatus]);

    // Fetch Plan Grid when slot changes
    useEffect(() => {
        if (!selectedSlotId) {
            setGroupedPlanData({});
            setOpenRooms(new Set());
            return;
        }

        const fetchGrid = async () => {
            setLoadingGrid(true);
            setMessage({ type: '', text: '' });
            try {
                // Not passing classroom_id ensures we fetch for ALL rooms in this slot
                const res = await getPlanView(selectedSlotId);
                if (res.data?.success) {
                    const data = res.data.data || [];

                    // Group data by classroom_id (or room_name)
                    const grouped = data.reduce((acc, row) => {
                        const roomId = row.classroom_id;
                        if (!acc[roomId]) {
                            acc[roomId] = {
                                room_name: row.room_name,
                                data: [],
                                laneCounts: { P: 0, G: 0, Y: 0 }
                            };
                        }
                        acc[roomId].data.push(row);

                        if (row.lane === 'P') acc[roomId].laneCounts.P++;
                        if (row.lane === 'G') acc[roomId].laneCounts.G++;
                        if (row.lane === 'Y') acc[roomId].laneCounts.Y++;

                        return acc;
                    }, {});

                    setGroupedPlanData(grouped);
                    setOpenRooms(new Set()); // Start with all collapsed

                    if (data.length === 0) {
                        setMessage({ type: 'info', text: 'No micro-seating plan found for this slot. Run the algorithm first.' });
                    }
                } else {
                    setGroupedPlanData({});
                }
            } catch (err) {
                console.error(err);
                setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to fetch the view.' });
            } finally {
                setLoadingGrid(false);
            }
        };

        fetchGrid();
    }, [selectedSlotId]);

    // Handle Generation
    const handleGenerateMicroPlan = async () => {
        if (!selectedSlotId) {
            setMessage({ type: 'error', text: 'Please select an Exam Slot to run the algorithm.' });
            return;
        }

        setIsGenerating(true);
        setMessage({ type: 'info', text: 'Generating Micro-Seating Plan...' });

        try {
            const res = await generateMicroPlan({ slot_id: selectedSlotId });
            setMessage({ type: 'success', text: res.data?.message || 'Generated successfully!' });

            // Refresh the algorithm-run status for the slot dropdown
            try {
                const statusRes = await getSeatingArrangementStatus();
                const map = {};
                for (const s of (statusRes.data?.slots || [])) {
                    map[String(s.slot_id)] = { has_plan: s.has_plan, plan_count: s.plan_count };
                }
                setSlotStatus(map);
            } catch { /* non-fatal */ }

            // Reload grid for all rooms in this slot
            const gridRes = await getPlanView(selectedSlotId);
            if (gridRes.data?.success) {
                const data = gridRes.data.data || [];
                const grouped = data.reduce((acc, row) => {
                    const roomId = row.classroom_id;
                    if (!acc[roomId]) {
                        acc[roomId] = { room_name: row.room_name, data: [], laneCounts: { P: 0, G: 0, Y: 0 } };
                    }
                    acc[roomId].data.push(row);
                    if (row.lane === 'P') acc[roomId].laneCounts.P++;
                    if (row.lane === 'G') acc[roomId].laneCounts.G++;
                    if (row.lane === 'Y') acc[roomId].laneCounts.Y++;
                    return acc;
                }, {});
                setGroupedPlanData(grouped);
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to generate plan.' });
        } finally {
            setIsGenerating(false);
        }
    };

    // Accordion Toggle
    const toggleRoom = (roomId) => {
        setOpenRooms(prev => {
            const next = new Set(prev);
            if (next.has(roomId)) {
                next.delete(roomId);
            } else {
                next.add(roomId);
            }
            return next;
        });
    };

    // Export individual room to Excel
    const handleExport = (e, roomId, roomData) => {
        e.stopPropagation(); // crucial to prevent accordion toggle

        if (roomData.data.length === 0) return;

        const lanePri = { P: 1, G: 2, Y: 3 };
        const sortedExportData = [...roomData.data].sort((a, b) => (lanePri[a.lane] || 99) - (lanePri[b.lane] || 99));
        const formattedData = sortedExportData.map((row, idx) => ({
            'S.No.': idx + 1,
            'Seat Number': row.seat_number,
            'Lane': row.lane === 'P' ? 'Purple' : row.lane === 'G' ? 'Green' : 'Yellow',
            'Roll No': row.roll_number,
            'Student Name': row.student_name || '',
            'Section': row.section_name || '',
            'Course Name': row.course_name || '',
            'Course Code': row.course_code
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);

        // Auto-size columns heuristically
        worksheet['!cols'] = [
            { wpx: 50 },  // S.No.
            { wpx: 100 }, // Seat Number
            { wpx: 80 },  // Lane
            { wpx: 120 }, // Roll No
            { wpx: 200 }, // Student Name
            { wpx: 100 }, // Section
            { wpx: 200 }, // Course Name
            { wpx: 120 }  // Course Code
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Seating');
        XLSX.writeFile(workbook, `Seating_${roomData.room_name}_Slot${selectedSlotId}.xlsx`);
    };

    const getLaneColor = (lane) => {
        switch (lane) {
            case 'P': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'G': return 'bg-success/15 text-success border-success/30';
            case 'Y': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            default: return 'bg-surface2 text-text border-border';
        }
    };

    const getLaneLabel = (lane) => {
        switch (lane) {
            case 'P': return 'Purple';
            case 'G': return 'Green';
            case 'Y': return 'Yellow';
            default: return lane;
        }
    };

    const roomEntries = Object.entries(groupedPlanData);

    return (
        <div className="max-w-[1100px] mx-auto min-h-screen">
            {/* Header */}
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-brand-500 tracking-tight">Micro-Seating View</h1>
                    <p className="text-sm text-textMuted mt-1">Final Student-to-Chair Allocation</p>
                </div>

                <button
                    onClick={handleGenerateMicroPlan}
                    disabled={isGenerating || !selectedSlotId}
                    className={`uppercase tracking-wider text-xs font-bold px-4 py-2.5 rounded shadow-sm border transition-all ${isGenerating || !selectedSlotId
                            ? "bg-surface2 text-textFaint border-border cursor-not-allowed"
                            : "bg-surface text-brand-500 border-brand-500 hover:bg-danger/10 hover:shadow-md cursor-pointer"
                        }`}
                >
                    {isGenerating ? 'Running Algorithm...' : ' Run Seating Algorithm'}
                </button>
            </div>

            {/* Status Message */}
            {message.text && (
                <div className={`mb-6 p-4 rounded-lg border text-sm flex items-center justify-between shadow-sm animate-fade-in ${message.type === 'error' ? 'bg-danger/10 text-danger border-danger/30' :
                        message.type === 'success' ? 'bg-success/10 text-success border-success/30' :
                            'bg-info/10 text-info border-info/30'
                    }`}>
                    <span>{message.text}</span>
                    <button onClick={() => setMessage({ type: '', text: '' })} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
                </div>
            )}

            {/* Selector Panel — replace with period-scoped empty state if no slots */}
            {slots.length === 0 ? (
                <div className="mb-8">
                    <PeriodScopedEmptyState noun="exam slots">
                        Add slots via <b className="text-text">Add Exam Slot</b> first, or
                        switch to another period that already has slots.
                    </PeriodScopedEmptyState>
                </div>
            ) : (
            <div className="bg-surface p-6 rounded-xl shadow-md border border-border mb-8">
                <div className="flex items-end gap-5 font-medium">
                    <div className="w-full relative">
                        <label className="block text-[11px] font-bold text-textFaint uppercase tracking-widest mb-2">
                            1. Select Exam Slot (Loads all rooms)
                        </label>
                        <select
                            className="w-full bg-surface2 border border-border text-text rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none cursor-pointer shadow-sm"
                            value={selectedSlotId}
                            onChange={(e) => setSelectedSlotId(e.target.value)}
                        >
                            <option value="">-- Choose Slot --</option>
                            {slots.map((s, idx) => {
                                const done = slotStatus[String(s.id)]?.has_plan;
                                const marker = done ? '✓ ' : '— ';
                                // Show a position-based slot number per the active period instead
                                // of the DB id (which is an AUTO_INCREMENT counter and looks weird).
                                return (
                                    <option key={s.id} value={s.id}>
                                        {marker}Slot {idx + 1}: {new Date(s.exam_date).toLocaleDateString()} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>
                {/* Status summary + legend */}
                {slots.length > 0 && (
                    <div className="mt-3 flex items-center gap-4 text-[11px] text-textMuted">
                        <span><b className="text-success">{statusSummary.done}</b> of <b>{statusSummary.total}</b> slots have a saved seating plan</span>
                        <span className="text-textFaint">·</span>
                        <span><span className="text-success font-bold">✓</span> algorithm run · <span className="text-textFaint font-bold">—</span> pending</span>
                    </div>
                )}
            </div>
            )}

            {/* Data Accordions */}
            <div className="flex flex-col gap-4">
                {loadingGrid ? (
                    <div className="bg-surface rounded-xl shadow-lg border border-border flex items-center justify-center p-20 text-textFaint">
                        <span className="animate-pulse font-medium tracking-wide">Loading Classrooms...</span>
                    </div>
                ) : !selectedSlotId ? (
                    null
                ) : roomEntries.length === 0 ? (
                    <div className="bg-surface rounded-xl shadow-lg border border-border flex flex-col items-center justify-center p-20 text-textFaint">
                        <p className="font-medium text-sm">No classrooms scheduled for this slot.</p>
                        <p className="text-xs mt-1 opacity-70">Run the algorithm or generate the seating layout first.</p>
                    </div>
                ) : (
                    roomEntries.map(([roomId, roomItem]) => {
                        const isOpen = openRooms.has(roomId);
                        const totalStudents = roomItem.data.length;
                        const lanePriority = { P: 1, G: 2, Y: 3 };
                        const sortedData = [...roomItem.data].sort((a, b) => (lanePriority[a.lane] || 99) - (lanePriority[b.lane] || 99));

                        return (
                            <div key={roomId} className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden transition-all hover:shadow-md">
                                {/* Accordion Header */}
                                <div
                                    className="px-6 py-4 bg-surface2 flex items-center justify-between cursor-pointer hover:bg-surface2 transition-colors"
                                    onClick={() => toggleRoom(roomId)}
                                >
                                    {/* Left Side */}
                                    <div className="flex items-center gap-3 w-1/4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${isOpen ? "bg-brand-500 text-white" : "bg-surface2 text-textMuted"
                                            }`}>
                                            {isOpen ? '−' : '+'}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-text uppercase tracking-widest leading-none">
                                                {roomItem.room_name}
                                            </h3>
                                            <span className="text-[11px] text-textMuted font-semibold tracking-wider">
                                                {totalStudents} STUDENTS
                                            </span>
                                        </div>
                                    </div>

                                    {/* Middle: Lane Badges */}
                                    <div className="flex gap-2 items-center flex-1 justify-center">
                                        {roomItem.laneCounts.P > 0 && (
                                            <span className="bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
                                                <span className="opacity-60 mr-1">Purple:</span> {roomItem.laneCounts.P}
                                            </span>
                                        )}
                                        {roomItem.laneCounts.G > 0 && (
                                            <span className="bg-success/15 text-success border border-success/30 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
                                                <span className="opacity-60 mr-1">Green:</span> {roomItem.laneCounts.G}
                                            </span>
                                        )}
                                        {roomItem.laneCounts.Y > 0 && (
                                            <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
                                                <span className="opacity-60 mr-1">Yellow:</span> {roomItem.laneCounts.Y}
                                            </span>
                                        )}
                                    </div>

                                    {/* Right Side: Download Button */}
                                    <div className="w-1/4 flex justify-end">
                                        <button
                                            onClick={(e) => handleExport(e, roomId, roomItem)}
                                            className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded border border-brand-500 text-brand-500 bg-surface hover:bg-brand-500 hover:text-white transition-all shadow-sm"
                                        >
                                            <span>⬇ Download Excel</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Accordion Body */}
                                {isOpen && (
                                    <div className="border-t border-border overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-surface border-b border-border shadow-sm">
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">S.No.</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Seat Number</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Lane</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Roll No</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Student Name</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Section</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Course Name</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-textFaint">Course</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sortedData.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-surface2 transition-colors bg-surface">
                                                        <td className="px-6 py-2.5 text-xs text-textMuted font-semibold text-center">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-6 py-2.5 font-mono text-sm font-bold text-text">
                                                            {row.seat_number}
                                                        </td>
                                                        <td className="px-6 py-2.5">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${getLaneColor(row.lane)}`}>
                                                                {getLaneLabel(row.lane)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-2.5 font-mono text-xs text-textMuted font-semibold tracking-wide">
                                                            {row.roll_number}
                                                        </td>
                                                        <td className="px-6 py-2.5 text-xs text-text font-medium">
                                                            {row.student_name || <span className="text-textFaint italic">Unknown</span>}
                                                        </td>
                                                        <td className="px-6 py-2.5 text-xs text-textMuted font-medium">
                                                            {row.section_name || '—'}
                                                        </td>
                                                        <td className="px-6 py-2.5 text-xs text-text">
                                                            {row.course_name || '—'}
                                                        </td>
                                                        <td className="px-6 py-2.5">
                                                            <span className="px-2 py-0.5 bg-surface2 border border-border text-textMuted text-[10px] font-bold tracking-widest rounded uppercase shadow-sm">
                                                                {row.course_code}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
