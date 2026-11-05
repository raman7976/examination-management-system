// ─────────────────────────────────────────────────────────────────────────────
//  Invigilation PDF records (jsPDF + jspdf-autotable).
//
//  Every report is built from one normalised "grid":
//      slots[] → rooms[] → invigilators[]
//  gridFromSchedule() adapts the live API shape (admin /schedule and the
//  invigilator /full-schedule); gridFromArchive() adapts saved
//  invigilation_session_duties rows. The build*() functions are pure (they
//  return a jsPDF doc, which the unit tests inspect); the download*() wrappers
//  load the logo and save the file.
//
//  The standard PDF fonts only cover Latin-1, so there are no ★ / – / — glyphs
//  in these documents: course instructors are marked "CI" and ranges use "-".
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '../assets/lnmiitLogo.jpg';

export const INSTITUTE_NAME = 'The LNM Institute of Information Technology';
export const INSTITUTE_SUBTITLE = 'Deemed-to-be-University, Jaipur';

// Printed on every duty letter. Edit to match the institute's examination rules.
export const DUTY_INSTRUCTIONS = [
    'Please report at the examination venue at least 30 minutes before the start of each session.',
    'Verify the identity of every candidate and ensure the attendance sheet is signed by each candidate present.',
    'Candidates may not keep mobile phones or other electronic devices with them in the examination hall.',
    'Report any case of unfair means to the Examination In-charge immediately.',
    'A duty may be exchanged only through a swap / cover request approved on the examination portal.',
];

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };
const ROLE_ORDER = { faculty: 0, phd_student: 1, lab_staff: 2 };

// Palette (RGB). Accent is the blue of the LNMIIT wordmark.
const C = {
    accent: [0, 94, 168],
    accentSoft: [232, 240, 249],
    ink: [30, 30, 30],
    muted: [105, 105, 105],
    line: [150, 150, 150],
    zebra: [247, 249, 252],
    danger: [180, 20, 30],
};

// "|" renders like a capital I in Helvetica; the middle dot is in Latin-1.
const SEP = '  ·  ';

const MX = 12;           // side margin (mm)
const BODY_TOP = 30;     // first usable y on continuation pages (below the header)
const FOOTER_H = 16;     // reserved at the bottom of every page
const LOGO_H = 11;       // logo height; width follows its 796×370 aspect ratio
const LOGO_W = LOGO_H * (796 / 370);

// ═════════════════════════════════════════════════════════════════════════════
//  Formatting helpers
// ═════════════════════════════════════════════════════════════════════════════

const pad2 = (n) => String(n).padStart(2, '0');

// API dates arrive as "YYYY-MM-DD" or as an ISO timestamp produced from a MySQL
// DATE in the server's time zone. Reading the timestamp with LOCAL getters gives
// the calendar day the server meant (same assumption the rest of the UI makes).
export function toDateKey(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateFromKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDate(key) {
    if (!key) return '-';
    return dateFromKey(key).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatWeekday(key, short = false) {
    if (!key) return '';
    return dateFromKey(key).toLocaleDateString('en-GB', { weekday: short ? 'short' : 'long' });
}

export function formatTime(t) {
    if (!t) return '';
    const [h, m = '00'] = String(t).split(':');
    const hour = parseInt(h, 10);
    if (Number.isNaN(hour)) return String(t);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${pad2(h12)}:${m.slice(0, 2)} ${ampm}`;
}

const timeRange = (s, e) => `${formatTime(s)} - ${formatTime(e)}`;

export function examTypeLabel(type) {
    if (type === 'midterm') return 'Mid-Term Examination';
    if (type === 'endterm') return 'End-Term Examination';
    return type ? `${type} Examination` : 'Examination';
}

const periodLine = (meta) =>
    [meta.semesterLabel, examTypeLabel(meta.examType)].filter(Boolean).join(SEP);

function formatStamp(d) {
    return d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h12',
    });
}

export function pdfFileName(...parts) {
    const stem = parts
        .filter(Boolean)
        .map((p) => String(p).trim().replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, ''))
        .filter(Boolean)
        .join('_');
    return `${stem || 'invigilation'}.pdf`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Grid normalisation
// ═════════════════════════════════════════════════════════════════════════════

const bySlot = (a, b) =>
    a.date_key.localeCompare(b.date_key) || String(a.start_time).localeCompare(String(b.start_time));
const byRoom = (a, b) =>
    (a.location_order ?? 0) - (b.location_order ?? 0) || String(a.room_name).localeCompare(String(b.room_name));
const byName = (a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''));

function normPerson(i) {
    return {
        user_id: i.user_id ?? null,
        full_name: i.full_name || 'Unknown',
        employee_id: i.employee_id || '',
        role: i.role || '',
        department: i.department || '',
        is_course_instructor: !!i.is_course_instructor,
    };
}

// Live schedule: [{ slot_id, exam_date, exam_day, start_time, end_time, rooms:[{…, invigilators:[…]}] }]
export function gridFromSchedule(schedule = []) {
    return schedule
        .map((s) => ({
            slot_id: s.slot_id,
            date_key: toDateKey(s.exam_date),
            exam_day: s.exam_day || '',
            start_time: s.start_time,
            end_time: s.end_time,
            rooms: (s.rooms || [])
                .map((r) => ({
                    classroom_id: r.classroom_id,
                    room_name: r.room_name,
                    location_order: r.location_order ?? 0,
                    course_codes: r.course_codes || '',
                    students: r.students ?? null,
                    required: r.required ?? null,
                    orphaned: !!r.orphaned,
                    invigilators: (r.invigilators || []).map(normPerson).sort(byName),
                }))
                .sort(byRoom),
        }))
        .sort(bySlot);
}

// Archived invigilation_session_duties rows (one row per duty).
export function gridFromArchive(duties = []) {
    const slots = new Map();
    for (const d of duties) {
        const dateKey = toDateKey(d.exam_date);
        const sKey = d.slot_id ?? `${dateKey}|${d.start_time}|${d.end_time}`;
        if (!slots.has(sKey)) {
            slots.set(sKey, {
                slot_id: d.slot_id ?? null,
                date_key: dateKey,
                exam_day: d.exam_day || '',
                start_time: d.start_time,
                end_time: d.end_time,
                roomMap: new Map(),
            });
        }
        const slot = slots.get(sKey);
        const rKey = d.classroom_id ?? d.room_name;
        if (!slot.roomMap.has(rKey)) {
            slot.roomMap.set(rKey, {
                classroom_id: d.classroom_id ?? null,
                room_name: d.room_name || '-',
                location_order: 0,
                course_codes: d.course_codes || '',
                students: null,
                required: null,
                orphaned: false,
                invigilators: [],
            });
        }
        const room = slot.roomMap.get(rKey);
        if (!room.course_codes && d.course_codes) room.course_codes = d.course_codes;
        room.invigilators.push(normPerson(d));
    }
    return Array.from(slots.values())
        .map(({ roomMap, ...slot }) => ({
            ...slot,
            rooms: Array.from(roomMap.values())
                .map((r) => ({ ...r, invigilators: r.invigilators.sort(byName) }))
                .sort(byRoom),
        }))
        .sort(bySlot);
}

const personKey = (p) => p.user_id ?? p.employee_id ?? p.full_name;

// [{ person, duties:[{ slot, room, is_course_instructor }] }] sorted by name.
export function dutiesByInvigilator(grid) {
    const map = new Map();
    for (const slot of grid) {
        for (const room of slot.rooms) {
            for (const inv of room.invigilators) {
                const key = personKey(inv);
                if (!map.has(key)) map.set(key, { person: inv, duties: [] });
                map.get(key).duties.push({ slot, room, is_course_instructor: inv.is_course_instructor });
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => byName(a.person, b.person));
}

export function gridStats(grid) {
    const days = new Set(grid.map((s) => s.date_key));
    const people = new Set();
    let rooms = 0;
    let duties = 0;
    let shortfall = 0;
    for (const slot of grid) {
        for (const room of slot.rooms) {
            rooms += 1;
            duties += room.invigilators.length;
            room.invigilators.forEach((i) => people.add(personKey(i)));
            if (room.required != null) shortfall += Math.max(0, room.required - room.invigilators.length);
        }
    }
    return { days: days.size, sessions: grid.length, rooms, duties, invigilators: people.size, shortfall };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Page chrome (header / title / footer / signatures)
// ═════════════════════════════════════════════════════════════════════════════

const newDoc = (orientation) => new jsPDF({ orientation, unit: 'mm', format: 'a4' });
const pageW = (doc) => doc.internal.pageSize.getWidth();
const pageH = (doc) => doc.internal.pageSize.getHeight();
const contentBottom = (doc) => pageH(doc) - FOOTER_H - 4;

function drawHeader(doc, logo) {
    const pw = pageW(doc);
    if (logo) {
        try { doc.addImage(logo, 'JPEG', MX, 7, LOGO_W, LOGO_H); } catch { /* logo is optional */ }
    }
    doc.setTextColor(...C.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(INSTITUTE_NAME, pw / 2, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    doc.text(INSTITUTE_SUBTITLE, pw / 2, 18.5, { align: 'center' });
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.8);
    doc.line(MX, 22, pw - MX, 22);
    doc.setLineWidth(0.2);
    doc.line(MX, 23.2, pw - MX, 23.2);
}

function drawFooter(doc, meta, page, total) {
    const pw = pageW(doc);
    const y = pageH(doc) - FOOTER_H + 4;
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.2);
    doc.line(MX, y, pw - MX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    const left = [meta.docTitle, periodLine(meta)].filter(Boolean).join(SEP);
    doc.text(left, MX, y + 4);
    doc.text(`Page ${page} of ${total}`, pw - MX, y + 4, { align: 'right' });
    const stamp = `Generated on ${formatStamp(meta.generatedAt || new Date())}`;
    doc.text([stamp, meta.scopeNote].filter(Boolean).join(SEP), MX, y + 8);
    doc.text('For official use only', pw - MX, y + 8, { align: 'right' });
}

// Header + footer on every page; run once all content is laid out.
function finalizeChrome(doc, meta) {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p += 1) {
        doc.setPage(p);
        drawHeader(doc, meta.logo);
        drawFooter(doc, meta, p, total);
    }
    doc.setPage(total);
}

function drawTitle(doc, title, meta, y = 32) {
    const pw = pageW(doc);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...C.accent);
    doc.text(title, pw / 2, y, { align: 'center' });
    y += 6;
    const sub = periodLine(meta);
    if (sub) {
        doc.setFontSize(10);
        doc.setTextColor(...C.ink);
        doc.text(sub, pw / 2, y, { align: 'center' });
        y += 5;
    }
    if (meta.scopeNote) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.muted);
        doc.text(meta.scopeNote, pw / 2, y, { align: 'center' });
        y += 4;
    }
    doc.setTextColor(...C.ink);
    return y + 2;
}

// One-row "key figures" strip.
function drawStats(doc, y, items) {
    autoTable(doc, {
        startY: y,
        head: [items.map(([label]) => label)],
        body: [items.map(([, value]) => String(value))],
        theme: 'grid',
        margin: { left: MX, right: MX },
        styles: { halign: 'center', fontSize: 8, cellPadding: 1.6, lineColor: C.line, lineWidth: 0.2, textColor: C.ink },
        headStyles: { fillColor: C.accentSoft, textColor: C.accent, fontStyle: 'bold' },
        bodyStyles: { fontStyle: 'bold', fontSize: 10 },
    });
    return doc.lastAutoTable.finalY + 4;
}

function drawNote(doc, y, text) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    const lines = doc.splitTextToSize(text, pageW(doc) - 2 * MX);
    doc.text(lines, MX, y);
    doc.setTextColor(...C.ink);
    return y + lines.length * 3.4 + 2;
}

function drawSignatures(doc, y, labels) {
    const needed = 26;
    if (y + needed > contentBottom(doc)) {
        doc.addPage();
        y = BODY_TOP + 6;
    }
    const pw = pageW(doc);
    const slotW = (pw - 2 * MX) / labels.length;
    const lineY = y + 16;
    doc.setDrawColor(...C.ink);
    doc.setLineWidth(0.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.ink);
    labels.forEach((label, i) => {
        const cx = MX + slotW * i + slotW / 2;
        doc.line(cx - slotW * 0.35, lineY, cx + slotW * 0.35, lineY);
        doc.text(label, cx, lineY + 4.5, { align: 'center' });
    });
    return lineY + 8;
}

const tableBase = {
    theme: 'grid',
    margin: { left: MX, right: MX, top: BODY_TOP, bottom: FOOTER_H + 4 },
    rowPageBreak: 'avoid',
    styles: {
        font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: C.ink,
        lineColor: C.line, lineWidth: 0.2, valign: 'middle', overflow: 'linebreak',
    },
    headStyles: { fillColor: C.accent, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
};

const emptyNotice = (doc, y, text) => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...C.muted);
    doc.text(text, pageW(doc) / 2, y + 10, { align: 'center' });
    doc.setTextColor(...C.ink);
};

const ciMark = (isCi) => (isCi ? ' (CI)' : '');

// ═════════════════════════════════════════════════════════════════════════════
//  1. Master duty chart — every session, every room, every invigilator, with a
//     signature column. Landscape; each exam day starts on a new page so a day
//     can be printed for the notice board on its own.
// ═════════════════════════════════════════════════════════════════════════════
export function buildDutyChart(grid, meta = {}, { newPagePerDay = true } = {}) {
    const doc = newDoc('landscape');
    meta = { ...meta, docTitle: 'Invigilation Duty Chart' };
    let y = drawTitle(doc, 'INVIGILATION DUTY CHART', meta);

    const stats = gridStats(grid);
    const statItems = [
        ['Exam days', stats.days],
        ['Sessions', stats.sessions],
        ['Room-sessions', stats.rooms],
        ['Invigilation duties', stats.duties],
        ['Invigilators', stats.invigilators],
    ];
    if (grid.some((s) => s.rooms.some((r) => r.required != null))) statItems.push(['Unfilled positions', stats.shortfall]);
    y = drawStats(doc, y, statItems);
    y = drawNote(doc, y,
        'CI = course instructor of an examination held in that room.  Req. = invigilators required (one per 25 students, minimum one).  ' +
        'Invigilators sign against their name on reporting for duty.');

    if (grid.length === 0) {
        emptyNotice(doc, y, 'No invigilation duties have been scheduled.');
    }

    const COLS = 9;
    let prevDate = null;
    let sessionOfDay = 0;
    grid.forEach((slot, idx) => {
        const newDay = slot.date_key !== prevDate;
        sessionOfDay = newDay ? 1 : sessionOfDay + 1;
        if (idx > 0) {
            if (newDay && newPagePerDay) {
                doc.addPage();
                y = BODY_TOP + 2;
            } else {
                // Start the next session below the previous one, unless there is
                // no room left for its heading plus a couple of rows.
                y = doc.lastAutoTable.finalY + 6;
                if (y + 30 > contentBottom(doc)) { doc.addPage(); y = BODY_TOP + 2; }
            }
        }
        prevDate = slot.date_key;

        const dutyCount = slot.rooms.reduce((n, r) => n + r.invigilators.length, 0);
        const band =
            `${formatWeekday(slot.date_key)}, ${formatDate(slot.date_key)}   ${SEP}   ` +
            `Session ${sessionOfDay}: ${timeRange(slot.start_time, slot.end_time)}   ${SEP}   ` +
            `${slot.rooms.length} room(s), ${dutyCount} invigilator(s)`;

        const body = [];
        slot.rooms.forEach((room, rIdx) => {
            const span = Math.max(1, room.invigilators.length);
            const short = room.required != null ? Math.max(0, room.required - room.invigilators.length) : 0;
            const reqText = room.required == null ? '-' : short > 0 ? `${room.required} (${short} short)` : String(room.required);
            const zebra = rIdx % 2 === 1 ? { fillColor: C.zebra } : {};
            const roomCells = [
                { content: String(rIdx + 1), rowSpan: span, styles: { halign: 'center', ...zebra } },
                { content: room.room_name, rowSpan: span, styles: { fontStyle: 'bold', ...zebra } },
                {
                    content: room.orphaned ? 'No exam seated in this room' : (room.course_codes || '-'),
                    rowSpan: span,
                    styles: room.orphaned ? { textColor: C.danger, fontStyle: 'italic', ...zebra } : zebra,
                },
                { content: room.students == null ? '-' : String(room.students), rowSpan: span, styles: { halign: 'center', ...zebra } },
                {
                    content: reqText, rowSpan: span,
                    styles: { halign: 'center', ...zebra, ...(short > 0 ? { textColor: C.danger, fontStyle: 'bold' } : {}) },
                },
            ];
            if (room.invigilators.length === 0) {
                body.push([...roomCells, {
                    content: 'Not assigned', colSpan: 4,
                    styles: { textColor: C.danger, fontStyle: 'italic', ...zebra },
                }]);
                return;
            }
            room.invigilators.forEach((inv, i) => {
                body.push([
                    ...(i === 0 ? roomCells : []),
                    { content: `${inv.full_name}${ciMark(inv.is_course_instructor)}`, styles: zebra },
                    { content: inv.employee_id || '-', styles: { halign: 'center', ...zebra } },
                    { content: ROLE_LABEL[inv.role] || inv.role || '-', styles: { halign: 'center', ...zebra } },
                    { content: '', styles: zebra },
                ]);
            });
        });

        autoTable(doc, {
            ...tableBase,
            startY: y,
            showHead: 'everyPage',
            head: [
                [{
                    content: band, colSpan: COLS,
                    styles: { halign: 'left', fillColor: C.accentSoft, textColor: C.accent, fontSize: 9, cellPadding: 2.2 },
                }],
                ['#', 'Room', 'Course(s)', 'Students', 'Req.', 'Invigilator', 'Emp. ID', 'Role', 'Signature'],
            ],
            body,
            columnStyles: {
                0: { cellWidth: 9 },
                1: { cellWidth: 24 },
                2: { cellWidth: 58 },
                3: { cellWidth: 17 },
                4: { cellWidth: 19 },
                5: { cellWidth: 60 },
                6: { cellWidth: 26 },
                7: { cellWidth: 24 },
                8: { cellWidth: 36 },
            },
        });
    });

    if (grid.length > 0) {
        drawSignatures(doc, doc.lastAutoTable.finalY + 8, ['Prepared by', 'Verified by', 'Approved by']);
    }
    finalizeChrome(doc, meta);
    return doc;
}

// ═════════════════════════════════════════════════════════════════════════════
//  2. Invigilator-wise roster — one block per person (alphabetical) listing
//     each of their duties. Portrait.
// ═════════════════════════════════════════════════════════════════════════════
export function buildInvigilatorRoster(grid, meta = {}) {
    const doc = newDoc('portrait');
    meta = { ...meta, docTitle: 'Invigilator-wise Duty Roster' };
    let y = drawTitle(doc, 'INVIGILATOR-WISE DUTY ROSTER', meta);

    const people = dutiesByInvigilator(grid);
    const stats = gridStats(grid);
    y = drawStats(doc, y, [
        ['Invigilators', people.length],
        ['Total duties', stats.duties],
        ['Exam days', stats.days],
        ['Sessions', stats.sessions],
    ]);
    y = drawNote(doc, y, 'Listed alphabetically.  CI = course instructor of an examination held in that room.');

    if (people.length === 0) {
        emptyNotice(doc, y, 'No invigilation duties have been scheduled.');
    } else {
        const body = [];
        people.forEach(({ person, duties }, pIdx) => {
            const span = duties.length;
            const zebra = pIdx % 2 === 1 ? { fillColor: C.zebra } : {};
            const who = [person.full_name, person.department].filter(Boolean).join('\n');
            const personCells = [
                { content: String(pIdx + 1), rowSpan: span, styles: { halign: 'center', ...zebra } },
                { content: who, rowSpan: span, styles: { fontStyle: 'bold', ...zebra } },
                { content: person.employee_id || '-', rowSpan: span, styles: { halign: 'center', ...zebra } },
                { content: ROLE_LABEL[person.role] || person.role || '-', rowSpan: span, styles: { halign: 'center', ...zebra } },
                { content: String(span), rowSpan: span, styles: { halign: 'center', fontStyle: 'bold', ...zebra } },
            ];
            duties.forEach((d, i) => {
                body.push([
                    ...(i === 0 ? personCells : []),
                    { content: `${formatDate(d.slot.date_key)} (${formatWeekday(d.slot.date_key, true)})`, styles: zebra },
                    { content: timeRange(d.slot.start_time, d.slot.end_time), styles: { halign: 'center', ...zebra } },
                    { content: `${d.room.room_name}${ciMark(d.is_course_instructor)}`, styles: { halign: 'center', ...zebra } },
                ]);
            });
        });

        autoTable(doc, {
            ...tableBase,
            startY: y,
            showHead: 'everyPage',
            head: [['#', 'Invigilator', 'Emp. ID', 'Role', 'Duties', 'Date', 'Time', 'Room']],
            body,
            columnStyles: {
                0: { cellWidth: 9 },
                1: { cellWidth: 46 },
                2: { cellWidth: 22 },
                3: { cellWidth: 20 },
                4: { cellWidth: 13 },
                5: { cellWidth: 30 },
                6: { cellWidth: 30 },
                7: { cellWidth: 16 },
            },
        });
    }
    finalizeChrome(doc, meta);
    return doc;
}

// ═════════════════════════════════════════════════════════════════════════════
//  3. Duty letters — one formal letter per invigilator (each on a new page).
//     `onlyKeys` limits output to specific people (user_id / employee_id);
//     `profile` fills in details missing from the grid (e.g. department).
// ═════════════════════════════════════════════════════════════════════════════
export function buildDutyLetters(grid, meta = {}, { onlyKeys = null, profile = null } = {}) {
    const doc = newDoc('portrait');
    meta = { ...meta, docTitle: 'Invigilation Duty Letter' };
    const pw = pageW(doc);
    const cw = pw - 2 * MX;

    let people = dutiesByInvigilator(grid);
    if (onlyKeys) {
        const wanted = new Set(onlyKeys.map(String));
        people = people.filter(({ person }) =>
            wanted.has(String(person.user_id)) || (person.employee_id && wanted.has(String(person.employee_id))));
    }

    if (people.length === 0) {
        const y = drawTitle(doc, 'INVIGILATION DUTY LETTER', meta);
        emptyNotice(doc, y, 'No invigilation duties are assigned.');
    }

    people.forEach(({ person: rawPerson, duties }, idx) => {
        if (idx > 0) doc.addPage();
        const person = profile ? { ...rawPerson, ...stripEmpty(profile) } : rawPerson;
        let y = drawTitle(doc, 'INVIGILATION DUTY LETTER', meta);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Date: ${formatDate(toDateKey(meta.generatedAt || new Date()))}`, pw - MX, y, { align: 'right' });
        y += 3;

        // Recipient details
        autoTable(doc, {
            startY: y,
            theme: 'grid',
            margin: { left: MX, right: MX },
            styles: { fontSize: 9, cellPadding: 2, textColor: C.ink, lineColor: C.line, lineWidth: 0.2 },
            columnStyles: {
                0: { cellWidth: 30, fontStyle: 'bold', fillColor: C.accentSoft, textColor: C.accent },
                1: { cellWidth: cw / 2 - 30 },
                2: { cellWidth: 30, fontStyle: 'bold', fillColor: C.accentSoft, textColor: C.accent },
                3: { cellWidth: cw / 2 - 30 },
            },
            body: [
                ['Name', person.full_name, 'Employee ID', person.employee_id || '-'],
                ['Role', ROLE_LABEL[person.role] || person.role || '-', 'Department', person.department || '-'],
                ['Total duties', String(duties.length), 'Examination', examTypeLabel(meta.examType)],
            ],
        });
        y = doc.lastAutoTable.finalY + 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(`Dear ${person.full_name},`, MX, y);
        y += 5.5;
        const intro =
            `You have been assigned the following invigilation duties for the ${examTypeLabel(meta.examType)}` +
            `${meta.semesterLabel ? ` (${meta.semesterLabel})` : ''}. Kindly note the date, time and venue of each duty ` +
            'and make yourself available accordingly.';
        const introLines = doc.splitTextToSize(intro, cw);
        doc.text(introLines, MX, y);
        y += introLines.length * 4.6 + 2;

        autoTable(doc, {
            ...tableBase,
            startY: y,
            head: [['#', 'Date', 'Day', 'Time', 'Venue', 'Course(s)', 'Remarks']],
            body: duties.map((d, i) => [
                { content: String(i + 1), styles: { halign: 'center' } },
                formatDate(d.slot.date_key),
                d.slot.exam_day || formatWeekday(d.slot.date_key),
                { content: timeRange(d.slot.start_time, d.slot.end_time), styles: { halign: 'center' } },
                { content: d.room.room_name, styles: { halign: 'center', fontStyle: 'bold' } },
                d.room.course_codes || '-',
                { content: d.is_course_instructor ? 'CI' : '', styles: { halign: 'center' } },
            ]),
            columnStyles: {
                0: { cellWidth: 9 },
                1: { cellWidth: 26 },
                2: { cellWidth: 22 },
                3: { cellWidth: 36 },
                4: { cellWidth: 22 },
                5: { cellWidth: 53 },
                6: { cellWidth: 18 },
            },
            alternateRowStyles: { fillColor: C.zebra },
        });
        y = doc.lastAutoTable.finalY + 3;
        if (duties.some((d) => d.is_course_instructor)) {
            y = drawNote(doc, y + 2, 'CI = you teach a course whose examination is held in that room.');
        }

        // Instructions
        y += 3;
        const instrLines = DUTY_INSTRUCTIONS.map((t, i) => doc.splitTextToSize(`${i + 1}.  ${t}`, cw - 4));
        const instrHeight = 6 + instrLines.reduce((h, l) => h + l.length * 4.2 + 0.8, 0);
        if (y + instrHeight + 30 > contentBottom(doc)) { doc.addPage(); y = BODY_TOP + 4; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...C.accent);
        doc.text('Instructions to Invigilators', MX, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...C.ink);
        for (const lines of instrLines) {
            doc.text(lines, MX + 2, y);
            y += lines.length * 4.2 + 0.8;
        }

        // Signature (right-aligned). The instructions check above left >= 30 mm.
        y += 20;
        doc.setDrawColor(...C.ink);
        doc.setLineWidth(0.3);
        doc.line(pw - MX - 60, y, pw - MX, y);
        doc.setFontSize(9);
        doc.text('Authorised Signatory', pw - MX - 30, y + 4.5, { align: 'center' });
    });

    finalizeChrome(doc, meta);
    return doc;
}

function stripEmpty(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

// ═════════════════════════════════════════════════════════════════════════════
//  4. Workload summary — targets vs assigned duties for every invigilator,
//     including the semester roll-up across midterm + endterm. Portrait.
//     Input: the /invigilators list rows (admin Invigilators tab).
// ═════════════════════════════════════════════════════════════════════════════
export function buildWorkloadSummary(invigilators = [], meta = {}, { siblingExamType = null } = {}) {
    const doc = newDoc('portrait');
    meta = { ...meta, docTitle: 'Invigilation Workload Summary' };
    let y = drawTitle(doc, 'INVIGILATION WORKLOAD SUMMARY', meta);

    const rows = [...invigilators].sort((a, b) =>
        (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || byName(a, b));
    const sum = (k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    const deficit = rows.filter((r) => r.is_configured !== false && r.balance < 0).length;
    const extra = rows.filter((r) => r.balance > 0).length;

    y = drawStats(doc, y, [
        ['Invigilators', rows.length],
        [`Assigned (${meta.examType || 'this exam'})`, `${sum('assigned_count')} / ${sum('effective_target')}`],
        ['Semester total', `${sum('cumulative_assigned')} / ${sum('cumulative_target')}`],
        ['In deficit', deficit],
        ['With extra duties', extra],
    ]);
    y = drawNote(doc, y,
        'A/T = duties assigned / target.  Balance compares cumulative semester duties with cumulative targets: ' +
        'a deficit is carried into the next exam of the semester.');

    const thisLabel = meta.examType === 'midterm' ? 'Midterm' : meta.examType === 'endterm' ? 'Endterm' : 'This exam';
    const sibLabel = siblingExamType === 'midterm' ? 'Midterm' : siblingExamType === 'endterm' ? 'Endterm' : 'Other exam';

    const balanceCell = (r) => {
        if (r.is_configured === false) return { content: 'Not set', styles: { textColor: C.muted } };
        if (r.balance === 0) return { content: 'On target', styles: {} };
        if (r.balance > 0) return { content: `+${r.balance} extra`, styles: { textColor: C.accent, fontStyle: 'bold' } };
        return { content: `${r.balance} deficit`, styles: { textColor: C.danger, fontStyle: 'bold' } };
    };

    autoTable(doc, {
        ...tableBase,
        startY: y,
        showHead: 'everyPage',
        showFoot: 'lastPage',
        head: [['#', 'Invigilator', 'Emp. ID', 'Role', `${thisLabel} A/T`, `${sibLabel} A/T`, 'Semester A/T', 'Balance']],
        body: rows.map((r, i) => {
            const bal = balanceCell(r);
            return [
                { content: String(i + 1), styles: { halign: 'center' } },
                [r.full_name, r.department].filter(Boolean).join('\n'),
                { content: r.employee_id || '-', styles: { halign: 'center' } },
                { content: ROLE_LABEL[r.role] || r.role || '-', styles: { halign: 'center' } },
                { content: `${r.assigned_count ?? 0} / ${r.effective_target ?? 0}`, styles: { halign: 'center' } },
                { content: `${r.sibling_assigned ?? 0} / ${r.sibling_target ?? 0}`, styles: { halign: 'center' } },
                { content: `${r.cumulative_assigned ?? 0} / ${r.cumulative_target ?? 0}`, styles: { halign: 'center', fontStyle: 'bold' } },
                { content: bal.content, styles: { halign: 'center', ...bal.styles } },
            ];
        }),
        foot: rows.length > 0 ? [[
            { content: 'Total', colSpan: 4, styles: { halign: 'right' } },
            { content: `${sum('assigned_count')} / ${sum('effective_target')}`, styles: { halign: 'center' } },
            { content: `${sum('sibling_assigned')} / ${sum('sibling_target')}`, styles: { halign: 'center' } },
            { content: `${sum('cumulative_assigned')} / ${sum('cumulative_target')}`, styles: { halign: 'center' } },
            '',
        ]] : undefined,
        footStyles: { fillColor: C.accentSoft, textColor: C.accent, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.zebra },
        columnStyles: {
            0: { cellWidth: 9 },
            1: { cellWidth: 50 },
            2: { cellWidth: 22 },
            3: { cellWidth: 20 },
            4: { cellWidth: 21 },
            5: { cellWidth: 21 },
            6: { cellWidth: 21 },
            7: { cellWidth: 22 },
        },
    });
    if (rows.length === 0) emptyNotice(doc, doc.lastAutoTable.finalY, 'No invigilators are registered.');

    finalizeChrome(doc, meta);
    return doc;
}

// ═════════════════════════════════════════════════════════════════════════════
//  5. Room attendance sheet — invigilators of one room in one session, with
//     reporting-time and signature columns. Portrait.
// ═════════════════════════════════════════════════════════════════════════════
export function buildRoomSheet(slot, room, meta = {}) {
    const doc = newDoc('portrait');
    meta = { ...meta, docTitle: 'Invigilator Attendance Sheet' };
    let y = drawTitle(doc, 'INVIGILATOR ATTENDANCE SHEET', meta);
    const cw = pageW(doc) - 2 * MX;

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: MX, right: MX },
        styles: { fontSize: 9, cellPadding: 2, textColor: C.ink, lineColor: C.line, lineWidth: 0.2 },
        columnStyles: {
            0: { cellWidth: 28, fontStyle: 'bold', fillColor: C.accentSoft, textColor: C.accent },
            1: { cellWidth: cw / 2 - 28 },
            2: { cellWidth: 28, fontStyle: 'bold', fillColor: C.accentSoft, textColor: C.accent },
            3: { cellWidth: cw / 2 - 28 },
        },
        body: [
            ['Room', room.room_name, 'Date', `${formatDate(slot.date_key)} (${formatWeekday(slot.date_key)})`],
            ['Course(s)', room.course_codes || '-', 'Time', timeRange(slot.start_time, slot.end_time)],
        ],
    });
    y = doc.lastAutoTable.finalY + 6;

    autoTable(doc, {
        ...tableBase,
        startY: y,
        head: [['#', 'Invigilator', 'Emp. ID', 'Role', 'CI', 'Reporting time', 'Signature']],
        body: room.invigilators.map((inv, i) => [
            { content: String(i + 1), styles: { halign: 'center' } },
            inv.full_name,
            { content: inv.employee_id || '-', styles: { halign: 'center' } },
            { content: ROLE_LABEL[inv.role] || inv.role || '-', styles: { halign: 'center' } },
            { content: inv.is_course_instructor ? 'Yes' : '', styles: { halign: 'center' } },
            '',
            '',
        ]),
        bodyStyles: { minCellHeight: 10 },
        columnStyles: {
            0: { cellWidth: 9 },
            1: { cellWidth: 50 },
            2: { cellWidth: 24 },
            3: { cellWidth: 22 },
            4: { cellWidth: 11 },
            5: { cellWidth: 26 },
            6: { cellWidth: 44 },
        },
    });
    drawSignatures(doc, doc.lastAutoTable.finalY + 10, ['Room Superintendent', 'Examination In-charge']);

    finalizeChrome(doc, meta);
    return doc;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Download wrappers
// ═════════════════════════════════════════════════════════════════════════════

let logoPromise = null;
export function loadLogo() {
    if (!logoPromise) {
        logoPromise = fetch(logoUrl)
            .then((r) => r.blob())
            .then((blob) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }))
            .catch(() => null);
    }
    return logoPromise;
}

async function withLogo(meta) {
    return { ...meta, logo: meta.logo !== undefined ? meta.logo : await loadLogo() };
}

const periodParts = (meta) => [meta.semesterLabel, meta.examType];

export async function downloadDutyChart(grid, meta, opts) {
    const m = await withLogo(meta);
    buildDutyChart(grid, m, opts).save(pdfFileName('Invigilation_Duty_Chart', ...periodParts(m), m.fileSuffix));
}

export async function downloadInvigilatorRoster(grid, meta) {
    const m = await withLogo(meta);
    buildInvigilatorRoster(grid, m).save(pdfFileName('Invigilator_Duty_Roster', ...periodParts(m), m.fileSuffix));
}

export async function downloadDutyLetters(grid, meta, opts = {}) {
    const m = await withLogo(meta);
    const who = opts.fileLabel || 'All';
    buildDutyLetters(grid, m, opts).save(pdfFileName('Duty_Letter', who, ...periodParts(m)));
}

export async function downloadWorkloadSummary(invigilators, meta, opts) {
    const m = await withLogo(meta);
    buildWorkloadSummary(invigilators, m, opts).save(pdfFileName('Invigilation_Workload', ...periodParts(m)));
}

export async function downloadRoomSheet(slot, room, meta) {
    const m = await withLogo(meta);
    buildRoomSheet(slot, room, m).save(pdfFileName('Invigilator_Attendance', room.room_name, slot.date_key, m.fileSuffix));
}

// Page chrome and table defaults, for other record builders (e.g. unfairMeansPdf.js)
// so every institute document shares one look.
export const pdfKit = {
    C, MX, BODY_TOP, FOOTER_H, tableBase,
    newDoc, pageW, contentBottom, drawTitle, drawStats, drawNote, drawSignatures, finalizeChrome, emptyNotice,
};
