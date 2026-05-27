import { useState, useEffect, useCallback } from 'react';
import {
  registerInvigilator,
  bulkRegisterInvigilators,
  getInvigilators,
  deleteInvigilator,
  downloadInvigilatorTemplate,
} from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';

const ROLE_LABELS = {
  faculty:     'Faculty',
  phd_student: 'PhD Student',
  lab_staff:   'Lab Staff',
};

export default function Registration() {
  // ── Manual form state ──────────────────────────────────────────────────────
  const [form, setForm]               = useState({ employee_id: '', name: '', email: '', role: '', department: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formMessage, setFormMessage] = useState({ text: '', type: '' });

  // ── Bulk upload state ──────────────────────────────────────────────────────
  const [bulkFile, setBulkFile]         = useState(null);
  const [bulkLoading, setBulkLoading]   = useState(false);
  const [bulkMessage, setBulkMessage]   = useState({ text: '', type: '' });
  const [bulkResults, setBulkResults]   = useState(null);

  // ── Invigilator table state ────────────────────────────────────────────────
  const [invigilators, setInvigilators]       = useState([]);
  const [tableLoading, setTableLoading]       = useState(false);
  const [search, setSearch]                   = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // ── Fetch invigilators ─────────────────────────────────────────────────────
  const fetchInvigilators = useCallback(async (q = '') => {
    setTableLoading(true);
    try {
      const res = await getInvigilators(q);
      setInvigilators(res.data.invigilators || []);
    } catch { setInvigilators([]); }
    finally { setTableLoading(false); }
  }, []);

  useEffect(() => { fetchInvigilators(); }, [fetchInvigilators]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchInvigilators(search), 350);
    return () => clearTimeout(t);
  }, [search, fetchInvigilators]);

  // ── Manual form submit ─────────────────────────────────────────────────────
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role || !form.department) {
      setFormMessage({ text: 'Name, email, role, and department are required.', type: 'error' });
      return;
    }
    setFormLoading(true);
    setFormMessage({ text: '', type: '' });
    try {
      const res = await registerInvigilator(form);
      setFormMessage({ text: res.data.message, type: 'success' });
      setForm({ employee_id: '', name: '', email: '', role: '', department: '' });
      fetchInvigilators(search);
    } catch (err) {
      setFormMessage({ text: err.response?.data?.message || 'Registration failed.', type: 'error' });
    } finally { setFormLoading(false); }
  };

  // ── Bulk upload ────────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (!bulkFile) { setBulkMessage({ text: 'Please select a file.', type: 'error' }); return; }
    setBulkLoading(true);
    setBulkMessage({ text: '', type: '' });
    setBulkResults(null);
    try {
      const formData = new FormData();
      formData.append('file', bulkFile);
      const res = await bulkRegisterInvigilators(formData);
      const { inserted, skipped, errors } = res.data;
      setBulkMessage({
        text: `Done — ${inserted} registered, ${skipped} skipped, ${errors.length} errors.`,
        type: errors.length ? 'error' : 'success',
      });
      setBulkResults(res.data);
      setBulkFile(null);
      const input = document.getElementById('bulk-file-input');
      if (input) input.value = '';
      fetchInvigilators(search);
    } catch (err) {
      setBulkMessage({ text: err.response?.data?.message || 'Upload failed.', type: 'error' });
    } finally { setBulkLoading(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await downloadInvigilatorTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'invigilator_template.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert('Failed to download template.'); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await deleteInvigilator(id);
      setDeleteConfirmId(null);
      fetchInvigilators(search);
    } catch (err) { alert(err.response?.data?.message || 'Delete failed.'); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const StatusBadge = ({ needsActivation }) => needsActivation
    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>Not Activated</span>
    : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>Active</span>;

  const Msg = ({ msg }) => {
    if (!msg.text) return null;
    return (
      <p className={`text-xs mt-2 font-medium ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{msg.text}</p>
    );
  };

  const inputCls = "w-full text-xs border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#8B1A1A] bg-white";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Invigilator Registration</h1>
        <p className="text-xs text-slate-500 mt-1">Register faculty, PhD students, and lab staff who will serve as invigilators.</p>
      </div>

      {/* ── EXAM PERIODS CARD — the ONE place to manage semesters ───────────── */}
      <ExamPeriodsCard />

      {/* ── SECTION A: Manual Form ──────────────────────────────────────────── */}
      <div className="bg-white rounded-lg p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#8B1A1A' }}>A</div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Manual Registration</h2>
        </div>

        <form onSubmit={handleFormSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee ID <span className="text-slate-400">(optional)</span></label>
            <input type="text" className={inputCls} placeholder="EMP001"
              value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
            <input type="text" className={inputCls} placeholder="Dr. Rajesh Kumar"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" className={inputCls} placeholder="rajesh.kumar@lnmiit.ac.in"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role <span className="text-red-500">*</span></label>
            <select className={inputCls} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="">Select role...</option>
              <option value="faculty">Faculty</option>
              <option value="phd_student">PhD Student</option>
              <option value="lab_staff">Lab Staff</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Department <span className="text-red-500">*</span></label>
            <input type="text" className={inputCls} placeholder="Computer Science & Engineering"
              value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={formLoading}
              className={`px-5 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all ${formLoading ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] cursor-pointer'}`}>
              {formLoading ? 'Registering...' : 'Register'}
            </button>
            <Msg msg={formMessage} />
          </div>
        </form>
      </div>

      {/* ── SECTION B: Bulk Upload ──────────────────────────────────────────── */}
      <div className="bg-white rounded-lg p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#8B1A1A' }}>B</div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Bulk Upload</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4 ml-9">
          Upload an <strong>.xlsx</strong> file. Columns:&nbsp;
          <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">employee_id</code>,&nbsp;
          <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">name</code>,&nbsp;
          <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">email</code>,&nbsp;
          <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">role</code>,&nbsp;
          <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">department</code>
        </p>

        <div className="ml-9 flex items-center gap-3 flex-wrap">
          <label className="flex-1 min-w-0">
            <input id="bulk-file-input" type="file" accept=".xlsx"
              onChange={e => { if (e.target.files[0]) setBulkFile(e.target.files[0]); }}
              disabled={bulkLoading}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer file:transition-all disabled:opacity-50 disabled:cursor-not-allowed" />
          </label>
          <button onClick={handleBulkUpload} disabled={bulkLoading || !bulkFile}
            className={`px-4 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all ${bulkLoading || !bulkFile ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] cursor-pointer'}`}>
            {bulkLoading ? 'Processing...' : 'Upload'}
          </button>
          <button onClick={handleDownloadTemplate}
            className="px-3 py-2 text-xs font-semibold rounded-md border cursor-pointer transition-all" style={{ color: '#475569', background: '#f8fafc', borderColor: '#e2e8f0' }}
            onMouseEnter={e => e.target.style.background = '#f1f5f9'} onMouseLeave={e => e.target.style.background = '#f8fafc'}>
            Template
          </button>
        </div>

        {bulkFile && !bulkLoading && (
          <div className="ml-9 mt-2 flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium truncate">{bulkFile.name}</span>
            <span className="text-slate-400">({(bulkFile.size / 1024).toFixed(1)} KB)</span>
          </div>
        )}
        <div className="ml-9"><Msg msg={bulkMessage} /></div>

        {bulkResults && bulkResults.errors.length > 0 && (
          <div className="ml-9 mt-3 overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="pb-1 pr-4 font-medium">Row</th>
                  <th className="pb-1 pr-4 font-medium">Email</th>
                  <th className="pb-1 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.errors.map((e, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-1 pr-4 text-slate-500">{e.row}</td>
                    <td className="py-1 pr-4 text-slate-700">{e.email}</td>
                    <td className="py-1 text-red-600">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION C: Registered Invigilators Table ────────────────────────── */}
      <div className="bg-white rounded-lg p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#8B1A1A' }}>C</div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Registered Invigilators</h2>
          </div>
          <span className="text-xs text-slate-400">{invigilators.length} total</span>
        </div>

        <input
          type="text"
          className={`${inputCls} mb-4 max-w-xs`}
          placeholder="Search by name, email, department..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {tableLoading ? (
          <p className="text-xs text-slate-400">Loading...</p>
        ) : invigilators.length === 0 ? (
          <p className="text-xs text-slate-400">No invigilators registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-4 font-medium">Emp ID</th>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Department</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {invigilators.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-2 pr-4 font-mono text-slate-500">{inv.employee_id || '—'}</td>
                    <td className="py-2 pr-4 font-medium text-slate-800">{inv.full_name}</td>
                    <td className="py-2 pr-4 text-slate-600">{inv.email}</td>
                    <td className="py-2 pr-4 text-slate-600">{ROLE_LABELS[inv.role] || inv.role}</td>
                    <td className="py-2 pr-4 text-slate-600">{inv.department || '—'}</td>
                    <td className="py-2 pr-4"><StatusBadge needsActivation={!!inv.needs_activation} /></td>
                    <td className="py-2">
                      {deleteConfirmId === inv.id ? (
                        <span className="flex items-center gap-2">
                          <button onClick={() => handleDelete(inv.id)} className="text-red-600 font-semibold cursor-pointer hover:underline">Confirm</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="text-slate-400 cursor-pointer hover:underline">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(inv.id)} className="text-slate-400 hover:text-red-600 cursor-pointer transition-colors">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Exam Periods Card — semester dropdown + midterm/endterm pills + create
//  This is the ONE place in the whole app where periods can be managed.
// ═════════════════════════════════════════════════════════════════════════════
function ExamPeriodsCard() {
  const {
    periodsLoaded, periodsError, activePeriod,
    semesterLabels, activeSemester, periodsInSemester,
    switchToSemester, switchToExamType, createNewSemester,
    loadPeriods,
  } = usePeriod();

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const handleCreate = async () => {
    if (!newLabel.trim()) { setMsg({ text: 'Semester label is required.', type: 'error' }); return; }
    setCreating(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await createNewSemester(newLabel.trim());
      if (res?.already_existed) {
        setMsg({ text: `"${newLabel.trim()}" already exists — no changes made.`, type: 'info' });
      } else {
        setMsg({ text: `Created "${newLabel.trim()}" — both midterm & endterm ready.`, type: 'success' });
      }
      setShowCreate(false);
      setNewLabel('');
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Create failed.', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  if (!periodsLoaded) {
    return <div className="bg-white rounded-lg p-6 text-xs text-slate-400" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>Loading exam periods…</div>;
  }
  if (periodsError) {
    return (
      <div className="bg-red-50 rounded-lg p-4 text-xs text-red-700 flex items-center justify-between">
        <span>⚠ {periodsError}</span>
        <button onClick={loadPeriods} className="font-bold uppercase tracking-wider px-3 py-1 rounded border border-red-300 hover:bg-red-100 cursor-pointer">Retry</button>
      </div>
    );
  }

  const midterm = periodsInSemester.find(p => p.exam_type === 'midterm');
  const endterm = periodsInSemester.find(p => p.exam_type === 'endterm');

  return (
    <div className="bg-white rounded-lg p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#8B1A1A' }}>✓</div>
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Exam Periods</h2>
        {activePeriod && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
            Active: {activePeriod.semester_label} · {activePeriod.exam_type}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Switch between semesters/exams or create a new semester here. This is the only tab where the active period can be changed.
      </p>

      {/* Semester + Exam pickers */}
      {semesterLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Semester</label>
            <select value={activeSemester} onChange={(e) => switchToSemester(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-[#8B1A1A]/30">
              {semesterLabels.map(lab => <option key={lab} value={lab}>{lab}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Exam</label>
            <div className="flex gap-1 bg-slate-100 rounded p-0.5">
              {[
                { key: 'midterm', label: 'Midterm', period: midterm },
                { key: 'endterm', label: 'Endterm', period: endterm },
              ].map(et => {
                const active = activePeriod && activePeriod.exam_type === et.key && activePeriod.semester_label === activeSemester;
                const exists = !!et.period;
                return (
                  <button key={et.key} disabled={!exists}
                    onClick={() => switchToExamType(et.key)}
                    title={exists ? '' : 'Not created yet'}
                    className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
                      active ? 'bg-[#8B1A1A] text-white' :
                      exists ? 'text-slate-500 hover:text-slate-700 hover:bg-white cursor-pointer' :
                               'text-slate-300 cursor-not-allowed'
                    }`}>{et.label}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* + New Semester */}
      <div className="border-t border-slate-100 pt-4">
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)}
            className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border border-[#8B1A1A]/40 text-[#8B1A1A] hover:bg-[#8B1A1A] hover:text-white transition-all cursor-pointer">
            + New Semester
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewLabel(''); } }}
              placeholder='Semester label, e.g. "Even 2024-25"'
              className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 w-64" />
            <button onClick={handleCreate} disabled={creating}
              className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md text-white ${creating ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] cursor-pointer'}`}>
              {creating ? 'Creating…' : 'Create Both'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewLabel(''); }}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
          </div>
        )}
        {msg.text && (
          <p className={`text-xs mt-3 font-medium ${msg.type === 'error' ? 'text-red-600' : msg.type === 'success' ? 'text-emerald-700' : 'text-slate-500'}`}>{msg.text}</p>
        )}
      </div>
    </div>
  );
}
