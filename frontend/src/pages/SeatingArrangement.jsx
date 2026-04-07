import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getExamSlots, generateMicroPlan, getPlanView } from '../api/api.js';

export default function SeatingArrangement() {
    const [slots, setSlots] = useState([]);
    const [selectedSlotId, setSelectedSlotId] = useState('');

    // Data grouped by classroom_id
    const [groupedPlanData, setGroupedPlanData] = useState({});
    const [loadingGrid, setLoadingGrid] = useState(false);

    const [isGenerating, setIsGenerating] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Track which accordions are open by classroom_id
    const [openRooms, setOpenRooms] = useState(new Set());

    // Fetch Slots on mount
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const slotRes = await getExamSlots();
                if (slotRes.data?.slots) {
                    setSlots(slotRes.data.slots);
                }
            } catch (err) {
                console.error("Failed to load selectors:", err);
            }
        };
        loadInitialData();
    }, []);

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
            case 'G': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'Y': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            default: return 'bg-slate-100 text-slate-800 border-slate-200';
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
                    <h1 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">Micro-Seating View</h1>
                    <p className="text-sm text-slate-500 mt-1">Final Student-to-Chair Allocation</p>
                </div>

                <button
                    onClick={handleGenerateMicroPlan}
                    disabled={isGenerating || !selectedSlotId}
                    className={`uppercase tracking-wider text-xs font-bold px-4 py-2.5 rounded shadow-sm border transition-all ${isGenerating || !selectedSlotId
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-white text-[#8B1A1A] border-[#8B1A1A] hover:bg-red-50 hover:shadow-md cursor-pointer"
                        }`}
                >
                    {isGenerating ? 'Running Algorithm...' : ' Run Seating Algorithm'}
                </button>
            </div>

            {/* Status Message */}
            {message.text && (
                <div className={`mb-6 p-4 rounded-lg border text-sm flex items-center justify-between shadow-sm animate-fade-in ${message.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' :
                        message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            'bg-blue-50 text-blue-800 border-blue-200'
                    }`}>
                    <span>{message.text}</span>
                    <button onClick={() => setMessage({ type: '', text: '' })} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
                </div>
            )}

            {/* Selector Panel */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-100 mb-8 flex items-end gap-5 font-medium">
                <div className="w-full relative">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                        1. Select Exam Slot (Loads all rooms)
                    </label>
                    <select
                        className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-[#8B1A1A] focus:ring-1 focus:ring-[#8B1A1A] transition-all appearance-none cursor-pointer"
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                    >
                        <option value="">-- Choose Slot --</option>
                        {slots.map(s => (
                            <option key={s.id} value={s.id}>
                                Slot {s.id}: {new Date(s.exam_date).toLocaleDateString()} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Data Accordions */}
            <div className="flex flex-col gap-4">
                {loadingGrid ? (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-100 flex items-center justify-center p-20 text-slate-400">
                        <span className="animate-pulse font-medium tracking-wide">Loading Classrooms...</span>
                    </div>
                ) : !selectedSlotId ? (
                    null
                ) : roomEntries.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col items-center justify-center p-20 text-slate-400">
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
                            <div key={roomId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md">
                                {/* Accordion Header */}
                                <div
                                    className="px-6 py-4 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => toggleRoom(roomId)}
                                >
                                    {/* Left Side */}
                                    <div className="flex items-center gap-3 w-1/4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${isOpen ? "bg-[#8B1A1A] text-white" : "bg-slate-200 text-slate-600"
                                            }`}>
                                            {isOpen ? '−' : '+'}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">
                                                {roomItem.room_name}
                                            </h3>
                                            <span className="text-[11px] text-slate-500 font-semibold tracking-wider">
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
                                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
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
                                            className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded border border-[#8B1A1A] text-[#8B1A1A] bg-white hover:bg-[#8B1A1A] hover:text-white transition-all shadow-sm"
                                        >
                                            <span>⬇ Download Excel</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Accordion Body */}
                                {isOpen && (
                                    <div className="border-t border-slate-200 overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-white border-b border-slate-200">
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">S.No.</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Seat Number</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Lane</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Roll No</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Student Name</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Section</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Course Name</th>
                                                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Course</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sortedData.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors bg-white">
                                                        <td className="px-6 py-2.5 text-xs text-slate-500 font-semibold text-center">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-6 py-2.5 font-mono text-sm font-bold text-slate-700">
                                                            {row.seat_number}
                                                        </td>
                                                        <td className="px-6 py-2.5">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${getLaneColor(row.lane)}`}>
                                                                {getLaneLabel(row.lane)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-2.5 font-mono text-xs text-slate-600 font-semibold tracking-wide">
                                                            {row.roll_number}
                                                        </td>
                                                        <td className="px-6 py-2.5 text-xs text-slate-800 font-medium">
                                                            {row.student_name || <span className="text-slate-300 italic">Unknown</span>}
                                                        </td>
                                                        <td className="px-6 py-2.5 text-xs text-slate-600 font-medium">
                                                            {row.section_name || '—'}
                                                        </td>
                                                        <td className="px-6 py-2.5 text-xs text-slate-700">
                                                            {row.course_name || '—'}
                                                        </td>
                                                        <td className="px-6 py-2.5">
                                                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold tracking-widest rounded uppercase">
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
