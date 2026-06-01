// ═════════════════════════════════════════════════════════════════════════════
//  Unit tests — utils/uploadParsing.js  (spreadsheet cell/header parsing)
//
//  NO database. getCellValue unwraps the object shapes ExcelJS hands back
//  (rich text, hyperlink, formula) and stringifies primitives. buildHeaderMap
//  normalizes header text (lowercase, strip spaces/underscores) so uploads
//  tolerate "Course Name" / "course_name" / "COURSENAME" interchangeably.
//  Header maps are built against a REAL in-memory ExcelJS worksheet.
// ═════════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { getCellValue, buildHeaderMap } from '../../utils/uploadParsing.js';

// ── getCellValue ─────────────────────────────────────────────────────────────

test('getCellValue returns empty string for null/undefined cells', () => {
    assert.equal(getCellValue(undefined), '');
    assert.equal(getCellValue(null), '');
    assert.equal(getCellValue({ value: null }), '');
    assert.equal(getCellValue({ value: undefined }), '');
});

test('getCellValue stringifies primitive values', () => {
    assert.equal(getCellValue({ value: 'CS101' }), 'CS101');
    assert.equal(getCellValue({ value: 42 }), '42');
    assert.equal(getCellValue({ value: 0 }), '0');
});

test('getCellValue concatenates rich-text runs', () => {
    const cell = { value: { richText: [{ text: 'CS' }, { text: '101' }] } };
    assert.equal(getCellValue(cell), 'CS101');
});

test('getCellValue extracts hyperlink display text', () => {
    const cell = { value: { text: 'click me', hyperlink: 'http://x' } };
    assert.equal(getCellValue(cell), 'click me');
});

test('getCellValue extracts formula results (including 0/empty)', () => {
    assert.equal(getCellValue({ value: { formula: 'A1+B1', result: 7 } }), '7');
    assert.equal(getCellValue({ value: { formula: 'A1', result: 0 } }), '0');
});

// ── buildHeaderMap (real ExcelJS worksheet) ──────────────────────────────────

function sheetWithHeaders(headers) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.getRow(1).values = headers; // ExcelJS columns are 1-based
    return ws;
}

test('buildHeaderMap normalizes case, spaces and underscores', () => {
    const ws = sheetWithHeaders(['Course Code', 'course_name', 'STUDENTS']);
    const map = buildHeaderMap(ws);
    assert.equal(map.coursecode, 1);
    assert.equal(map.coursename, 2);
    assert.equal(map.students, 3);
});

test('buildHeaderMap treats differently-formatted headers as the same key', () => {
    assert.equal(buildHeaderMap(sheetWithHeaders(['Course Name'])).coursename, 1);
    assert.equal(buildHeaderMap(sheetWithHeaders(['COURSENAME'])).coursename, 1);
    assert.equal(buildHeaderMap(sheetWithHeaders(['course_name'])).coursename, 1);
    assert.equal(buildHeaderMap(sheetWithHeaders(['  course   name  '])).coursename, 1);
});

test('buildHeaderMap skips blank header cells', () => {
    const ws = sheetWithHeaders(['Code', '', 'Name']);
    const map = buildHeaderMap(ws);
    assert.equal(map.code, 1);
    assert.equal(map.name, 3);
    assert.equal(Object.keys(map).length, 2, 'empty header cell contributes no key');
});

test('buildHeaderMap records the column NUMBER, not a zero-based index', () => {
    const ws = sheetWithHeaders(['A', 'B', 'C']);
    const map = buildHeaderMap(ws);
    assert.deepEqual(map, { a: 1, b: 2, c: 3 });
});
