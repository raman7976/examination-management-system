import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api/exams';

/** Build headers with the JWT token from localStorage */
function authHeaders(extra = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tiny helpers
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ status }) {
    const map = {
        saved:   { bg: '#d1fae5', color: '#065f46', label: 'Saved' },
        pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
        empty:   { bg: '#f3f4f6', color: '#6b7280', label: 'No courses' },
    };
    const s = map[status] ?? map.empty;
    return (
        <span style={{
            background: s.bg, color: s.color,
            padding: '2px 10px', borderRadius: 99,
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
            {s.label}
        </span>
    );
}

function Step({ num, title, active, done }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? '#10b981' : active ? '#e30712ff' : '#e5e7eb',
                color: done || active ? '#fff' : '#9ca3af',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                transition: 'background 0.3s',
            }}>
                {done ? '✓' : num}
            </div>
            <span style={{
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#1e293b' : done ? '#10b981' : '#94a3b8',
            }}>
                {title}
            </span>
        </div>
    );
}

function Toast({ message, type, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
    const c = { success: ['#d1fae5','#10b981','#065f46'], error: ['#fee2e2','#ef4444','#991b1b'], info: ['#dbeafe','#e80505ff','#d00606ff'] }[type] ?? ['#dbeafe','#ea092bff','#ee0b29ff'];
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: c[0], border: `1.5px solid ${c[1]}`, color: c[2],
            borderRadius: 10, padding: '12px 18px', maxWidth: 380,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            animation: 'slideUp 0.25s ease',
        }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{message}</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c[2], fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
    );
}

function Spinner() {
    return (
        <span style={{
            width: 14, height: 14, border: '2px solid currentColor',
            borderTopColor: 'transparent', borderRadius: '50%',
            display: 'inline-block', animation: 'spin 0.7s linear infinite',
        }} />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Per-slot room selector panel (expanded inline under a slot row)
// ─────────────────────────────────────────────────────────────────────────────

function SlotRoomSelector({ slotId, classrooms, selectedIds, onChange }) {
    const toggle   = (id) => onChange(slotId, selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    const selectAll = () => onChange(slotId, classrooms.map(r => r.id));
    const clearAll  = () => onChange(slotId, []);

    const building1 = classrooms.filter(r => r.location_order < 50);
    const building2 = classrooms.filter(r => r.location_order >= 50);

    const RoomGroup = ({ title, rooms }) => (
        <div style={{ marginBottom: 10 }}>
            <p style={{
                fontSize: 10, fontWeight: 700, color: '#94a3b8',
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
            }}>{title}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {rooms.map(r => {
                    const on = selectedIds.includes(r.id);
                    return (
                        <button key={r.id} onClick={() => toggle(r.id)}
                            title={`Purple:${r.cap_purple} Green:${r.cap_green} Yellow:${r.cap_yellow} | ${r.type}`}
                            style={{
                                padding: '3px 10px', borderRadius: 5,
                                border: `1.5px solid ${on ? '#eb2539ff' : '#e2e8f0'}`,
                                background: on ? '#dbeafe' : '#f8fafc',
                                color: on ? '#d70505ff' : '#64748b',
                                fontSize: 11, fontWeight: on ? 700 : 500,
                                cursor: 'pointer',
                                fontFamily: "'DM Mono', monospace",
                                transition: 'all 0.12s',
                            }}>
                            {r.room_name}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div style={{
            padding: '14px 16px', background: '#f0f7ff',
            borderRadius: 8, border: '1px solid #bfdbfe',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#080102ff' }}>
                    Rooms for this slot
                    <span style={{
                        marginLeft: 8,
                        background: selectedIds.length === 0 ? '#fee2e2' : '#2bed76ff',
                        color:      selectedIds.length === 0 ? '#991b1b' : '#030303ff',
                        borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                    }}>
                        {selectedIds.length} selected
                    </span>
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={selectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#2563eb', fontFamily: 'inherit', fontWeight: 700 }}>All</button>
                    <button onClick={clearAll}  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#ef4444', fontFamily: 'inherit', fontWeight: 700 }}>None</button>
                </div>
            </div>

            <RoomGroup title="Academic Block  (LH-1 → CP)" rooms={building1} />
            {building2.length > 0 && (
                <RoomGroup title="Incubation Centre  (LH-16 → LH-19)" rooms={building2} />
            )}

            {selectedIds.length === 0 && (
                <p style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 6 }}>
                    ⚠ No rooms selected — this slot will be skipped during export.
                </p>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SeatingManager() {
    const [slots,         setSlots]         = useState([]);
    const [classrooms,    setClassrooms]    = useState([]);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [generating,    setGenerating]    = useState(false);
    const [uploading,     setUploading]     = useState(false);
    const [workflowStep,  setWorkflowStep]  = useState(1);
    const [toast,         setToast]         = useState(null);
    const [dragOver,      setDragOver]      = useState(false);
    const [fetchError,    setFetchError]    = useState(null);   // stores server error message

    // expandedSlots: Set<slot_id>
    const [expandedSlots,  setExpandedSlots]  = useState(new Set());
    // slotRoomConfig: { [slot_id]: number[] }
    const [slotRoomConfig, setSlotRoomConfig] = useState({});

    const fileInputRef = useRef(null);
    const notify = useCallback((msg, type = 'info') => setToast({ message: msg, type }), []);

    // ── Initial load ─────────────────────────────────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch both endpoints; capture non-2xx responses as errors
                const [sRes, cRes] = await Promise.all([
                    fetch(`${API}/seating-status`, { headers: authHeaders() }),
                    fetch(`${API}/classrooms`,     { headers: authHeaders() }),
                ]);

                // Surface server-side error messages in the UI
                if (!sRes.ok) {
                    const errBody = await sRes.json().catch(() => ({}));
                    throw new Error(
                        `[${sRes.status}] seating-status: ${errBody.error ?? errBody.message ?? sRes.statusText}`
                    );
                }
                if (!cRes.ok) {
                    const errBody = await cRes.json().catch(() => ({}));
                    throw new Error(
                        `[${cRes.status}] classrooms: ${errBody.error ?? errBody.message ?? cRes.statusText}`
                    );
                }

                const [statusData, classData] = await Promise.all([sRes.json(), cRes.json()]);

                const slotList = Array.isArray(statusData) ? statusData : [];
                const roomList = Array.isArray(classData)  ? classData  : [];

                setSlots(slotList);
                setClassrooms(roomList);
                setFetchError(null);

                // Default: all rooms enabled for every slot
                const allIds = roomList.map(r => r.id);
                const init   = {};
                slotList.forEach(s => { init[s.slot_id] = [...allIds]; });
                setSlotRoomConfig(init);

            } catch (err) {
                console.error('SeatingManager load error:', err);
                setFetchError(err.message);
                notify(`Load failed: ${err.message}`, 'error');
            } finally {
                setLoadingStatus(false);
            }
        };
        loadData();
    }, [notify]);

    const refreshStatus = useCallback(() => {
        fetch(`${API}/seating-status`, { headers: authHeaders() }).then(r => r.json())
            .then(d => { if (Array.isArray(d)) setSlots(d); })
            .catch(() => {});
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSlotRoomChange = useCallback((slotId, newIds) => {
        setSlotRoomConfig(prev => ({ ...prev, [slotId]: newIds }));
    }, []);

    const toggleExpand = (slotId) => setExpandedSlots(prev => {
        const next = new Set(prev);
        next.has(slotId) ? next.delete(slotId) : next.add(slotId);
        return next;
    });

    // Apply same room list to ALL slots at once
    const setGlobalRooms = (ids) => {
        const next = {};
        slots.forEach(s => { next[s.slot_id] = [...ids]; });
        setSlotRoomConfig(next);
    };

    const handleGenerateExport = async () => {
        const slotsWithExams = slots.filter(s => s.exam_count > 0);
        if (!slotsWithExams.length) return notify('No slots have scheduled exams yet.', 'error');

        const emptySlots = slotsWithExams.filter(
            s => !(slotRoomConfig[s.slot_id]?.length > 0)
        );
        if (emptySlots.length)
            return notify(`${emptySlots.length} slot(s) have no rooms selected. Please fix them first.`, 'error');

        setGenerating(true);
        try {
            const res = await fetch(`${API}/generate-export`, {
                method:  'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body:    JSON.stringify({ slotRoomConfig }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            const cd   = res.headers.get('Content-Disposition') ?? '';
            a.download = (cd.match(/filename="?([^"]+)"?/) ?? [])[1] ?? 'seating_plan.xlsx';
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);

            notify('Excel downloaded! Review it, then upload the finalised version.', 'success');
            setWorkflowStep(3);
        } catch (err) {
            notify(`Export failed: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    const handleUpload = async (file) => {
        if (!file) return;
        if (!file.name.endsWith('.xlsx')) return notify('Please upload a .xlsx file.', 'error');
        setUploading(true);
        const form = new FormData();
        form.append('seatingFile', file);
        try {
            const res  = await fetch(`${API}/upload-seating`, { method: 'POST', headers: authHeaders(), body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
            notify(`✓ Saved! ${data.exams_processed} exams · ${data.allocations_saved} allocations.`, 'success');
            setWorkflowStep(4);
            refreshStatus();
        } catch (err) {
            notify(`Upload failed: ${err.message}`, 'error');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const slotsWithExams   = slots.filter(s => s.exam_count > 0);
    const slotsWithSeating = slots.filter(s => s.has_seating);
    const totalRooms       = classrooms.length;
    const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const formatTime = t => t ? t.slice(0, 5) : '';

    // ─────────────────────────────────────────────────────────────────────────
    //  Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600;700&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Outfit', sans-serif; background: #f1f5f9; }
                @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
                @keyframes spin    { to { transform: rotate(360deg) } }
                .slot-row:hover td  { background: #f0f9ff !important; }
                .upload-zone:hover, .upload-zone.drag { border-color: #e10606ff !important; background: #eff6ff !important; }
                .action-btn:hover:not(:disabled) { filter: brightness(1.08); }
                .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            `}</style>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div style={{ minHeight: '100vh', padding: '28px 24px' }}>
                <div style={{ maxWidth: 1180, margin: '0 auto' }}>

                    {/* ── Page header ── */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
                        <div>
                            
                            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1.15 }}>Seating Plan Assignment</h1>
                            
                            <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Per-slot room assignment</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {[['Total Slots', slots.length], ['With Exams', slotsWithExams.length], ['Seating Saved', slotsWithSeating.length]].map(([label, value]) => (
                                <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 18px', textAlign: 'center', minWidth: 90, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>{value}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

                        {/* ── LEFT ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                            {/* Workflow stepper */}
                            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 14 }}>Workflow</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                                    <Step num={1} title="Expand each slot row to configure its rooms" active={workflowStep === 1} done={workflowStep > 1} />
                                    <Step num={2} title="Generate Excel — algorithm runs per-slot"   active={workflowStep === 2} done={workflowStep > 2} />
                                    <Step num={3} title="Review & edit the downloaded Excel"          active={workflowStep === 3} done={workflowStep > 3} />
                                    <Step num={4} title="Upload finalised Excel → saved to Data Base"        active={workflowStep === 4} done={workflowStep > 4} />
                                </div>
                            </div>

                            {/* ── Slot table with expandable room rows ── */}
                            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                                {/* Toolbar */}
                                <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>Exam Slots</span>
                                        <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>— click ▾ to configure rooms per slot</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>All slots:</span>
                                        <button onClick={() => setGlobalRooms(classrooms.map(r => r.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#ae0606ff', fontFamily: 'inherit', fontWeight: 700 }}>All rooms</button>
                                        <button onClick={() => setGlobalRooms([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#ef4444', fontFamily: 'inherit', fontWeight: 700 }}>Clear rooms</button>
                                        <span style={{ color: '#e2e8f0', padding: '0 4px' }}>|</span>
                                        <button onClick={refreshStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#64748b', fontFamily: 'inherit' }}>↻ Refresh</button>
                                    </div>
                                </div>

                                {loadingStatus ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading…</div>
                                ) : fetchError ? (
                                    <div style={{ padding: 28, margin: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
                                        <p style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
                                            ⚠ Could not load data from server
                                        </p>
                                        <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, marginBottom: 12, wordBreak: 'break-all' }}>
                                            {fetchError}
                                        </p>
                                        <p style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.6 }}>
                                            <strong>Common causes:</strong><br />
                                            1. <code>seating_allocations</code> table missing → run <code>migration.sql</code> on your Aiven DB<br />
                                            2. No Vite proxy → add <code>server.proxy</code> in <code>vite.config.js</code> (see below)<br />
                                            3. Backend not running on port 5001
                                        </p>
                                        <pre style={{ fontSize: 11, background: '#1e293b', color: '#7dd3fc', padding: '10px 14px', borderRadius: 6, marginTop: 10, overflowX: 'auto' }}>{`// vite.config.js
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:5001'
    }
  }
}`}</pre>
                                    </div>
                                ) : slots.length === 0 ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                        No exam slots found in the database.<br />
                                        <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                                            Add slots via <strong>Add Exam Slot</strong> in the sidebar first.
                                        </span>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                {['', 'Date', 'Day', 'Time', 'Courses', 'Rooms', 'Status'].map(h => (
                                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {slots.map((sl, i) => {
                                                const expanded      = expandedSlots.has(sl.slot_id);
                                                const roomsSelected = (slotRoomConfig[sl.slot_id] ?? []).length;
                                                const hasWarning    = sl.exam_count > 0 && roomsSelected === 0;
                                                const rowBg         = expanded ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa';

                                                return (
                                                    <>
                                                        {/* ── Main slot row ── */}
                                                        <tr
                                                            key={sl.slot_id}
                                                            className="slot-row"
                                                            onClick={() => toggleExpand(sl.slot_id)}
                                                            style={{ cursor: 'pointer', borderBottom: expanded ? 'none' : '1px solid #f1f5f9' }}
                                                        >
                                                            {/* Expand button */}
                                                            <td style={{ padding: '10px 6px 10px 14px', background: rowBg, width: 32 }}>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); toggleExpand(sl.slot_id); }}
                                                                    style={{
                                                                        width: 24, height: 24, borderRadius: 5,
                                                                        border: `1.5px solid ${expanded ? '#93c5fd' : '#e2e8f0'}`,
                                                                        background: expanded ? '#dbeafe' : '#f1f5f9',
                                                                        color: expanded ? '#2563eb' : '#64748b',
                                                                        cursor: 'pointer', fontSize: 11, fontWeight: 700,
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        lineHeight: 1, transition: 'all 0.15s',
                                                                    }}
                                                                >
                                                                    {expanded ? '▲' : '▾'}
                                                                </button>
                                                            </td>
                                                            <td style={{ padding: '10px 12px', background: rowBg, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{formatDate(sl.exam_date)}</td>
                                                            <td style={{ padding: '10px 12px', background: rowBg, fontSize: 13, color: '#64748b' }}>{sl.exam_day}</td>
                                                            <td style={{ padding: '10px 12px', background: rowBg, fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#475569' }}>
                                                                {formatTime(sl.start_time)} – {formatTime(sl.end_time)}
                                                            </td>
                                                            <td style={{ padding: '10px 12px', background: rowBg, fontSize: 13, color: '#475569', textAlign: 'center' }}>{sl.exam_count}</td>
                                                            {/* Room count badge */}
                                                            <td style={{ padding: '10px 12px', background: rowBg }}>
                                                                <span style={{
                                                                    fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700,
                                                                    color:      hasWarning ? '#ef4444' : '#2563eb',
                                                                    background: hasWarning ? '#fee2e2' : '#eff6ff',
                                                                    padding: '2px 8px', borderRadius: 5,
                                                                }}>
                                                                    {roomsSelected}/{totalRooms}{hasWarning ? ' ⚠' : ''}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '10px 12px', background: rowBg }}>
                                                                <Badge status={sl.exam_count === 0 ? 'empty' : sl.has_seating ? 'saved' : 'pending'} />
                                                            </td>
                                                        </tr>

                                                        {/* ── Expandable room selector row ── */}
                                                        {expanded && (
                                                            <tr key={`${sl.slot_id}-expand`} style={{ borderBottom: '2px solid #bfdbfe' }}>
                                                                <td colSpan={7} style={{ padding: '6px 14px 14px 14px', background: '#eff6ff' }}>
                                                                    <SlotRoomSelector
                                                                        slotId={sl.slot_id}
                                                                        classrooms={classrooms}
                                                                        selectedIds={slotRoomConfig[sl.slot_id] ?? []}
                                                                        onChange={handleSlotRoomChange}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* ── Upload zone ── */}
                            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 14 }}>
                                    Step 3 – Upload Reviewed Excel
                                </p>
                                <div
                                    className={`upload-zone${dragOver ? ' drag' : ''}`}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ border: '2px dashed #cbd5e1', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: dragOver ? '#eff6ff' : '#fafafa' }}
                                >
                                    <div style={{ fontSize: 30, marginBottom: 6 }}>{uploading ? '⏳' : '📂'}</div>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>
                                        {uploading ? 'Uploading & saving…' : 'Drop reviewed Excel here, or click to browse'}
                                    </p>
                                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>Only .xlsx accepted</p>
                                    <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                                        onChange={e => { handleUpload(e.target.files[0]); e.target.value = ''; }} />
                                </div>
                                <button
                                    className="action-btn"
                                    disabled={uploading}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ marginTop: 10, width: '100%', padding: '11px 0', background: uploading ? '#94a3b8' : '#db070bff', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'filter 0.15s' }}
                                >
                                    {uploading && <Spinner />}
                                    {uploading ? 'Saving to database…' : 'Upload & Save Seating Plan'}
                                </button>
                            </div>
                        </div>

                        {/* ── RIGHT ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                            {/* Generate card */}
                            <div style={{ background: 'linear-gradient(135deg, #db070bff 0%, #db070bff 100%)', borderRadius: 5, padding: '22px 20px', boxShadow: '0 0px 0px rgba(37,99,235,0.25)', color: '#fff' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 5 }}>Step 2</p>
                                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>Generate Seating Plan</h2>
                                <p style={{ fontSize: 13, opacity: 0.82, lineHeight: 1.6, marginBottom: 16 }}>
                                    1. The algorithm is applied for each slot using its own room config and exports a colour-coded Excel workbook.               
                                 <br></br>2. Make the changes as you see fit then upload the excel.
                                </p>

                                {/* Per-slot readiness list */}
                                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12 }}>
                                    {slotsWithExams.length === 0 ? (
                                        <span style={{ opacity: 0.7 }}>No slots with exams yet.</span>
                                    ) : (
                                        slotsWithExams.map(sl => {
                                            const n  = (slotRoomConfig[sl.slot_id] ?? []).length;
                                            const ok = n > 0;
                                            return (
                                                <div key={sl.slot_id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                                                    <span style={{ opacity: 0.85 }}>{formatDate(sl.exam_date)} · {formatTime(sl.start_time)}</span>
                                                    <span style={{ fontWeight: 700, fontSize: 11, color: ok ? '#6ee7b7' : '#fca5a5' }}>
                                                        {ok ? `${n} rooms ✓` : '⚠ no rooms'}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <button
                                    className="action-btn"
                                    disabled={generating || slotsWithExams.length === 0}
                                    onClick={handleGenerateExport}
                                    style={{ width: '100%', padding: '12px 0', background: '#fff', color: '#1e40af', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'filter 0.15s' }}
                                >
                                    {generating && <Spinner />}
                                    {generating ? 'Generating…' : '⬇ Generate & Download Excel'}
                                </button>
                            </div>

                            {/* Legend */}
                            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12 }}>Excel Lane Legend</p>
                                {[
                                    ['#d9d2e9', 'Purple', 'Undivided room'],
                                    ['#d9ead3', 'Green',  'Giant course lane'],
                                    ['#fff2cc', 'Yellow', 'Other courses lane'],
                                ].map(([color, label, desc]) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <div style={{ width: 26, height: 16, background: color, borderRadius: 4, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{label}</span>
                                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{desc}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Info */}
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px' }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>How it works</p>
                                <ul style={{ fontSize: 12, color: '#166534', lineHeight: 1.65, paddingLeft: 16 }}>
                                    <li>Each slot uses <strong>its own room list</strong></li>
                                    <li></li>
                                    <li></li>
                                    <li></li>
                                    <li> <strong></strong></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}