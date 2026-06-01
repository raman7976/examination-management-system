// ═════════════════════════════════════════════════════════════════════════════
//  Pure spreadsheet-parsing helpers shared by uploadController.
//
//  Extracted out of the controller so they can be unit-tested WITHOUT importing
//  config/mysql.js (which opens a DB connection on import). No DB, no I/O — just
//  ExcelJS cell/worksheet shape handling.
// ═════════════════════════════════════════════════════════════════════════════

// Coerce an ExcelJS cell value to a plain string, unwrapping the object forms
// ExcelJS uses for rich text, hyperlinks and formula cells.
export function getCellValue(cell) {
    const val = cell?.value;
    if (val == null) return '';

    // If the cell contains an object, extract the actual text
    if (typeof val === 'object') {
        if (val.richText) {
            return val.richText.map(rt => rt.text).join(''); // Extract from Rich Text
        }
        if (val.text) {
            return val.text; // Extract from Hyperlink
        }
        if (val.result !== undefined) {
            return String(val.result); // Extract from Formula
        }
    }

    // Fallback for primitive types (strings, numbers)
    return String(val);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Converts to lowercase AND strips ALL spaces/underscores
//  'Course Name' / 'COURSENAME' / 'Course_Name' / 'course name' → 'coursename'
// ═════════════════════════════════════════════════════════════════════════════

export function buildHeaderMap(worksheet) {
    const headerRow = worksheet.getRow(1);
    const map = {}; // fully-normalized header → column number

    headerRow.eachCell((cell, colNumber) => {
        const raw = String(cell.value ?? '')
            .toLowerCase()
            .replace(/[\s_]+/g, '');   // strip ALL whitespace and underscores
        if (raw) map[raw] = colNumber;
    });

    return map;
}
