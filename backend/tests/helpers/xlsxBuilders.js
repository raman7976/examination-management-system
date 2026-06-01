// ═════════════════════════════════════════════════════════════════════════════
//  In-memory spreadsheet / zip builders for upload-route tests.
//
//  Uses the SAME libraries the controllers parse with, so a buffer we build here
//  round-trips through the real parsing path:
//    • uploadCourses / uploadCourseInstructors / registration bulk → ExcelJS
//    • uploadEnrollments → SheetJS (XLSX) inside an adm-zip archive
//
//  Header text is intentionally varied (spaces, mixed case) in some builders to
//  also exercise buildHeaderMap's normalization.
// ═════════════════════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';

// Generic ExcelJS sheet → Buffer. `headers` is row 1; `rows` are arrays aligned
// to those headers.
export async function excelJsBuffer(headers, rows) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(headers);
    for (const r of rows) ws.addRow(r);
    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(ab);
}

// Generic SheetJS sheet (array-of-objects) → Buffer.
export function sheetJsBuffer(objects) {
    const ws = XLSX.utils.json_to_sheet(objects);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Bundle named buffers into a .zip → Buffer.
export function zipBuffer(files) {
    const zip = new AdmZip();
    for (const { name, buffer } of files) zip.addFile(name, buffer);
    return zip.toBuffer();
}

// ── Course master (.xlsx) ────────────────────────────────────────────────────
// rows: [{ courseCode, courseName, shortName?, totalStudents? }]
export function coursesXlsx(rows) {
    return excelJsBuffer(
        ['Course code', 'Course Name', 'Short Name', 'Total Students'],
        rows.map((r) => [r.courseCode, r.courseName, r.shortName ?? '', r.totalStudents ?? 0]),
    );
}

// ── Enrollment file (.xlsx, goes INSIDE the zip) ─────────────────────────────
// rows: [{ roll, name?, email?, branch?, section?, courseName }]
// course_code is parsed by the controller as courseName.split('-')[0].
export function enrollmentSheet(rows) {
    return sheetJsBuffer(rows.map((r) => ({
        'Roll Number': r.roll,
        'Student Name': r.name ?? `Stu ${r.roll}`,
        'Email': r.email ?? `${r.roll}@test.invalid`,
        'Branch': r.branch ?? 'CSE',
        'Section Name': r.section ?? 'A',
        'Course Name': r.courseName,
    })));
}

// Build a complete enrollment .zip from a map of { fileName: rows }.
// Optionally inject junk entries (__MACOSX / ._hidden) to test the filter.
export function enrollmentZip(filesMap, { withJunk = false } = {}) {
    const files = Object.entries(filesMap).map(([name, rows]) => ({
        name,
        buffer: enrollmentSheet(rows),
    }));
    if (withJunk) {
        files.push({ name: '__MACOSX/ignore.xlsx', buffer: Buffer.from('junk') });
        files.push({ name: '._hidden.xlsx', buffer: Buffer.from('junk') });
    }
    return zipBuffer(files);
}

// ── Course-instructor mapping (.xlsx) ────────────────────────────────────────
// rows: [{ courseCode, employeeId }]
export function instructorsXlsx(rows) {
    return excelJsBuffer(
        ['course_code', 'employee_id'],
        rows.map((r) => [r.courseCode, r.employeeId]),
    );
}

// ── Invigilator registration bulk file (.xlsx) ───────────────────────────────
// rows: [{ employeeId?, name, email, role, department? }]
export function invigilatorsXlsx(rows) {
    return excelJsBuffer(
        ['employee_id', 'name', 'email', 'role', 'department'],
        rows.map((r) => [r.employeeId ?? '', r.name, r.email, r.role, r.department ?? '']),
    );
}
