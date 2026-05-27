import ExcelJS from 'exceljs';
import db from '../config/mysql.js';

// ── Shared cell-reading utilities ─────────────────────────────────────────────
function getCellValue(cell) {
    const val = cell?.value;
    if (val == null) return '';
    if (typeof val === 'object') {
        if (val.richText) return val.richText.map(rt => rt.text).join('');
        if (val.text) return val.text;
        if (val.result !== undefined) return String(val.result);
    }
    return String(val);
}

function buildHeaderMap(worksheet) {
    const headerRow = worksheet.getRow(1);
    const map = {};
    headerRow.eachCell((cell, colNumber) => {
        const raw = String(cell.value ?? '').toLowerCase().replace(/[\s_]+/g, '');
        if (raw) map[raw] = colNumber;
    });
    return map;
}

const VALID_ROLES = ['faculty', 'phd_student', 'lab_staff'];

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/registration/template  (public — no auth)
//  Stream a .xlsx template for bulk invigilator registration
// ═════════════════════════════════════════════════════════════════════════════

export const downloadTemplate = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Invigilator Registration');

        sheet.columns = [
            { header: 'employee_id', key: 'employee_id', width: 18 },
            { header: 'name',        key: 'name',        width: 25 },
            { header: 'email',       key: 'email',       width: 30 },
            { header: 'role',        key: 'role',        width: 18 },
            { header: 'department',  key: 'department',  width: 25 },
        ];

        sheet.getRow(1).font = { bold: true };

        sheet.addRow({
            employee_id: 'EMP001',
            name: 'Dr. Rajesh Kumar',
            email: 'rajesh.kumar@lnmiit.ac.in',
            role: 'faculty',
            department: 'Computer Science',
        });

        sheet.addRow({
            employee_id: '',
            name: '(role must be: faculty / phd_student / lab_staff)',
            email: '',
            role: '',
            department: '',
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="invigilator_template.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('downloadTemplate error:', error);
        if (!res.headersSent)
            res.status(500).json({ success: false, message: 'Failed to generate template.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/registration/register
//  Manually register a single invigilator
// ═════════════════════════════════════════════════════════════════════════════

export const registerInvigilator = async (req, res) => {
    const { employee_id, name, email, role, department } = req.body;

    if (!name || !email || !role)
        return res.status(400).json({ success: false, message: 'Name, email, and role are required.' });

    if (!VALID_ROLES.includes(role))
        return res.status(400).json({ success: false, message: `Role must be one of: ${VALID_ROLES.join(', ')}.` });

    try {
        // Check email uniqueness
        const [existingEmail] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0)
            return res.status(409).json({ success: false, message: `Email ${email} is already registered.` });

        // Check employee_id uniqueness (only if provided)
        if (employee_id) {
            const [existingEmpId] = await db.query('SELECT id FROM users WHERE employee_id = ?', [employee_id]);
            if (existingEmpId.length > 0)
                return res.status(409).json({ success: false, message: `Employee ID ${employee_id} is already registered.` });
        }

        await db.query(
            `INSERT INTO users (full_name, email, role, employee_id, department, password_hash)
             VALUES (?, ?, ?, ?, ?, NULL)`,
            [name, email, role, employee_id || null, department || null]
        );

        res.status(201).json({
            success: true,
            message: `${name} registered successfully. They can set their password via Forgot Password.`,
        });

    } catch (error) {
        console.error('registerInvigilator error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/registration/bulk-upload
//  Bulk register invigilators from .xlsx
// ═════════════════════════════════════════════════════════════════════════════

export const bulkRegisterInvigilators = async (req, res) => {
    if (!req.file)
        return res.status(400).json({ success: false, message: 'No file uploaded.' });

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet || worksheet.rowCount < 2)
            return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });

        const headers = buildHeaderMap(worksheet);
        const colEmpId = headers['employeeid'];
        const colName  = headers['name'];
        const colEmail = headers['email'];
        const colRole  = headers['role'];
        const colDept  = headers['department'];

        if (!colName || !colEmail || !colRole)
            return res.status(400).json({
                success: false,
                message: 'Required columns not found. Expected: name, email, role.',
            });

        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const name  = getCellValue(row.getCell(colName)).trim();
            const email = getCellValue(row.getCell(colEmail)).trim();
            const role  = getCellValue(row.getCell(colRole)).trim().toLowerCase();
            if (name && email) rows.push({
                rowNumber,
                name,
                email,
                role,
                employee_id: colEmpId ? getCellValue(row.getCell(colEmpId)).trim() || null : null,
                department:  colDept  ? getCellValue(row.getCell(colDept)).trim()  || null : null,
            });
        });

        if (rows.length === 0)
            return res.status(400).json({ success: false, message: 'No valid data rows found.' });

        let inserted = 0, skipped = 0;
        const errors = [];
        const BATCH_SIZE = 500;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);

                for (const { rowNumber, name, email, role, employee_id, department } of batch) {
                    if (!VALID_ROLES.includes(role)) {
                        errors.push({ row: rowNumber, email, reason: `Invalid role "${role}". Must be: ${VALID_ROLES.join(', ')}` });
                        continue;
                    }

                    try {
                        const [result] = await conn.query(
                            `INSERT IGNORE INTO users (full_name, email, role, employee_id, department, password_hash)
                             VALUES (?, ?, ?, ?, ?, NULL)`,
                            [name, email, role, employee_id || null, department || null]
                        );

                        if (result.affectedRows === 1) inserted++;
                        else skipped++;

                    } catch (rowErr) {
                        errors.push({ row: rowNumber, email, reason: rowErr.message });
                    }
                }
            }

            await conn.commit();
            res.status(200).json({ success: true, inserted, skipped, errors });

        } catch (dbErr) {
            await conn.rollback();
            throw dbErr;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('bulkRegisterInvigilators error:', error);
        res.status(500).json({ success: false, message: 'Server error during bulk upload.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/registration/invigilators
//  Fetch all non-admin users with optional search
// ═════════════════════════════════════════════════════════════════════════════

export const getInvigilators = async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = `
            SELECT id, employee_id, full_name, email, role, department,
                   (password_hash IS NULL) AS needs_activation
            FROM users
            WHERE role != 'admin'
        `;
        const params = [];

        if (search) {
            query += ` AND (full_name LIKE ? OR email LIKE ? OR department LIKE ? OR employee_id LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY full_name ASC`;

        const [rows] = await db.query(query, params);
        res.json({ success: true, invigilators: rows });

    } catch (error) {
        console.error('getInvigilators error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invigilators.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /api/registration/invigilators/:id
// ═════════════════════════════════════════════════════════════════════════════

export const deleteInvigilator = async (req, res) => {
    const { id } = req.params;
    const requesterId = req.user.id;

    if (parseInt(id) === requesterId)
        return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });

    try {
        const [target] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
        if (target.length === 0)
            return res.status(404).json({ success: false, message: 'User not found.' });
        if (target[0].role === 'admin')
            return res.status(403).json({ success: false, message: 'Cannot delete admin accounts through this endpoint.' });

        await db.query("DELETE FROM users WHERE id = ? AND role != 'admin'", [id]);
        res.json({ success: true, message: 'Invigilator deleted successfully.' });

    } catch (error) {
        console.error('deleteInvigilator error:', error);
        res.status(500).json({ success: false, message: 'Server error during deletion.', error: error.message });
    }
};
