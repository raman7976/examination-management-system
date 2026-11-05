// ─────────────────────────────────────────────────────────────────────────────
//  Unfair-means PDF records, in the same institute style as the invigilation
//  documents (shared header / footer / signature helpers from invigilationPdf).
//
//    buildUnfairMeansReport(case)     one case, with a space for the student's
//                                     written statement and four signatures
//    buildUnfairMeansRegister(cases)  the register (list) for the exam department
// ─────────────────────────────────────────────────────────────────────────────
import autoTable from 'jspdf-autotable';
import { pdfKit, loadLogo, pdfFileName, toDateKey, formatDate, formatWeekday, formatTime } from './invigilationPdf.js';
import { UFM_CATEGORIES, UFM_ACTIONS, UFM_STATUSES, labelOf } from './unfairMeans.js';

const { C, MX, tableBase, newDoc, pageW, contentBottom, drawTitle, drawStats, drawSignatures, finalizeChrome, emptyNotice } = pdfKit;

// User-typed text can contain characters the standard PDF fonts can't draw
// (curly quotes, long dashes, non-Latin scripts) — map the common ones to ASCII
// and replace anything else outside Latin-1 so nothing prints as garbage.
export function pdfSafe(text) {
    if (text == null) return '';
    return String(text)
        .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[^\n\r\t\x20-\x7E\xA0-\xFF]/g, '?');
}

const caseMeta = (c, extra = {}) => ({ semesterLabel: c.semester_label, examType: c.exam_type, ...extra });

const sessionText = (c) => {
    const key = toDateKey(c.exam_date);
    return `${formatWeekday(key)}, ${formatDate(key)}  (${formatTime(c.start_time)} - ${formatTime(c.end_time)})`;
};

const formatStamp = (v) => (v
    ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h12' })
    : '-');

// Two-column "label | value" block.
function keyValueTable(doc, y, heading, rows) {
    autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: MX, right: MX, top: pdfKit.BODY_TOP, bottom: pdfKit.FOOTER_H + 4 },
        head: [[{ content: heading, colSpan: 2, styles: { halign: 'left', fillColor: C.accent, textColor: [255, 255, 255], fontStyle: 'bold' } }]],
        body: rows.map(([k, v]) => [k, pdfSafe(v) || '-']),
        // Compact rows keep a closed case (with its decision) and the signature
        // lines on one page, so the signatures never sit alone on page 2.
        styles: { fontSize: 9, cellPadding: 1.6, textColor: C.ink, lineColor: C.line, lineWidth: 0.2, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 46, fontStyle: 'bold', fillColor: C.accentSoft, textColor: C.accent },
            1: { cellWidth: pageW(doc) - 2 * MX - 46 },
        },
    });
    return doc.lastAutoTable.finalY + 5;
}

// ═════════════════════════════════════════════════════════════════════════════
//  One case
// ═════════════════════════════════════════════════════════════════════════════
// photos: [{ dataUrl, width, height, caption }] — printed as annexure pages.
export function buildUnfairMeansReport(c, meta = {}, { photos = [] } = {}) {
    const doc = newDoc('portrait');
    meta = caseMeta(c, { ...meta, docTitle: 'Unfair Means Case Report' });
    let y = drawTitle(doc, 'UNFAIR MEANS CASE REPORT', meta);

    y = drawStats(doc, y, [
        ['Case number', c.case_number],
        ['Status', labelOf(UFM_STATUSES, c.status)],
        ['Recorded on', formatStamp(c.created_at)],
        ['Recorded by', pdfSafe(c.recorded_by_name) || '-'],
        ['Evidence photos', photos.length ? `${photos.length} (annexed)` : 'None'],
    ]);

    y = keyValueTable(doc, y, 'Candidate', [
        ['Name', c.student_name],
        ['Roll number', c.roll_number],
        ['Course', [c.course_code, c.course_name].filter(Boolean).join(' - ')],
        ['Examination', sessionText(c)],
        ['Room / seat', [c.room_name, c.seat_number ? `Seat ${c.seat_number}` : null].filter(Boolean).join(', ') || 'Not recorded'],
    ]);

    y = keyValueTable(doc, y, 'Incident', [
        ['Nature of unfair means', labelOf(UFM_CATEGORIES, c.category)],
        ['Time of incident', c.incident_time ? formatTime(c.incident_time) : 'Not recorded'],
        ['What happened', c.description],
        ['Material seized', c.material_seized ? `Yes${c.material_description ? ` - ${c.material_description}` : ''}` : 'No'],
        ['Action taken in the hall', labelOf(UFM_ACTIONS, c.action_taken)],
        ['Reported by', c.reported_by_name],
        ['Witness', c.witness_name || 'None'],
    ]);

    // Student's statement: the recorded one, or ruled lines to write on.
    const statementH = c.student_statement ? 0 : 34;
    if (y + 12 + statementH > contentBottom(doc)) { doc.addPage(); y = pdfKit.BODY_TOP + 2; }
    if (c.student_statement) {
        y = keyValueTable(doc, y, "Candidate's statement", [['Statement', c.student_statement]]);
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...C.accent);
        doc.text("Candidate's statement (in the candidate's own handwriting)", MX, y + 2);
        doc.setDrawColor(...C.line);
        doc.setLineWidth(0.2);
        for (let i = 1; i <= 5; i += 1) doc.line(MX, y + 2 + i * 6, pageW(doc) - MX, y + 2 + i * 6);
        doc.setTextColor(...C.ink);
        y += 2 + 5 * 6 + 6;
    }

    if (c.status === 'action_taken' || c.status === 'dismissed' || c.decision_note) {
        if (y + 30 > contentBottom(doc)) { doc.addPage(); y = pdfKit.BODY_TOP + 2; }
        y = keyValueTable(doc, y, 'Examination department decision', [
            ['Status', labelOf(UFM_STATUSES, c.status)],
            ['Decision', c.decision_note],
            ['Decided on', formatStamp(c.decided_at)],
        ]);
    }

    drawSignatures(doc, y + 4, ['Reporting invigilator', 'Witness', 'Candidate', 'Examination In-charge']);
    drawPhotoAnnexure(doc, c, meta, photos);
    finalizeChrome(doc, meta);
    return doc;
}

// Evidence photographs after the signed report, two per page, each scaled
// to fit its box without distortion and captioned "Photo i of n".
function drawPhotoAnnexure(doc, c, meta, photos) {
    if (!photos.length) return;
    const pw = pageW(doc);
    const boxW = pw - 2 * MX;
    const boxH = 98;
    for (let i = 0; i < photos.length; i += 2) {
        doc.addPage();
        let y = drawTitle(doc, 'ANNEXURE: EVIDENCE PHOTOGRAPHS', meta);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.ink);
        doc.text(pdfSafe(`Case ${c.case_number}  -  ${c.student_name || ''} (${c.roll_number})`), pw / 2, y, { align: 'center' });
        y += 5;
        for (const [k, p] of photos.slice(i, i + 2).entries()) {
            const ratio = p.width && p.height ? p.width / p.height : 4 / 3;
            let w = boxW;
            let h = w / ratio;
            if (h > boxH) { h = boxH; w = h * ratio; }
            const x = MX + (boxW - w) / 2;
            const format = String(p.dataUrl).startsWith('data:image/png') ? 'PNG' : 'JPEG';
            try {
                doc.addImage(p.dataUrl, format, x, y, w, h);
            } catch {
                doc.setFontSize(8.5);
                doc.text('(photo could not be embedded)', pw / 2, y + h / 2, { align: 'center' });
            }
            doc.setDrawColor(...C.line);
            doc.setLineWidth(0.2);
            doc.rect(x, y, w, h);
            doc.setFontSize(8.5);
            doc.setTextColor(...C.muted);
            const n = i + k + 1;
            doc.text(pdfSafe(`Photo ${n} of ${photos.length}${p.caption ? `: ${p.caption}` : ''}`), pw / 2, y + h + 4.5, { align: 'center' });
            doc.setTextColor(...C.ink);
            y += h + 12;
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Register (list of cases)
// ═════════════════════════════════════════════════════════════════════════════
export function buildUnfairMeansRegister(cases = [], meta = {}) {
    const doc = newDoc('landscape');
    meta = { ...meta, docTitle: 'Unfair Means Register' };
    let y = drawTitle(doc, 'UNFAIR MEANS REGISTER', meta);

    const count = (s) => cases.filter((c) => c.status === s).length;
    y = drawStats(doc, y, [
        ['Cases', cases.length],
        ...UFM_STATUSES.map((s) => [s.label, count(s.value)]),
    ]);

    if (cases.length === 0) {
        emptyNotice(doc, y, 'No unfair-means cases match this selection.');
    } else {
        autoTable(doc, {
            ...tableBase,
            startY: y,
            showHead: 'everyPage',
            head: [['#', 'Case', 'Exam session', 'Roll no.', 'Candidate', 'Course', 'Room / seat', 'Nature', 'Reported by', 'Status']],
            body: cases.map((c, i) => {
                const key = toDateKey(c.exam_date);
                return [
                    { content: String(i + 1), styles: { halign: 'center' } },
                    { content: c.case_number, styles: { fontStyle: 'bold' } },
                    `${formatDate(key)}\n${formatTime(c.start_time)} - ${formatTime(c.end_time)}`,
                    c.roll_number,
                    pdfSafe(c.student_name),
                    pdfSafe([c.course_code, c.course_name].filter(Boolean).join(' - ')),
                    [c.room_name, c.seat_number].filter(Boolean).join(' / ') || '-',
                    labelOf(UFM_CATEGORIES, c.category),
                    pdfSafe(c.reported_by_name),
                    labelOf(UFM_STATUSES, c.status),
                ];
            }),
            alternateRowStyles: { fillColor: C.zebra },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 25 },
                2: { cellWidth: 32 },
                3: { cellWidth: 22 },
                4: { cellWidth: 34 },
                5: { cellWidth: 38 },
                6: { cellWidth: 20 },
                7: { cellWidth: 32 },
                8: { cellWidth: 30 },
                9: { cellWidth: 32 },
            },
        });
    }
    finalizeChrome(doc, meta);
    return doc;
}

export async function downloadUnfairMeansReport(c, { photos = [] } = {}) {
    const logo = await loadLogo();
    buildUnfairMeansReport(c, { logo }, { photos }).save(pdfFileName(c.case_number, c.roll_number));
}

export async function downloadUnfairMeansRegister(cases, meta = {}) {
    const logo = await loadLogo();
    buildUnfairMeansRegister(cases, { ...meta, logo }).save(pdfFileName('Unfair_Means_Register', meta.semesterLabel, meta.examType));
}
