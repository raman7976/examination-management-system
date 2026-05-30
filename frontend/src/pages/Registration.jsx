import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  UserPlus,
  Upload,
  Users,
  Search,
  Download,
  Trash2,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  ChevronDown,
} from 'lucide-react';

import {
  registerInvigilator,
  bulkRegisterInvigilators,
  getInvigilators,
  deleteInvigilator,
  downloadInvigilatorTemplate,
  getPeriodsOverview,
  deleteExamPeriod,
} from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';

import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { toast } from '../components/ui/toastApi.js';
import { slideUp, stagger } from '../design/motion.js';

const ROLE_LABELS = {
  faculty:     'Faculty',
  phd_student: 'PhD Student',
  lab_staff:   'Lab Staff',
};
const ROLE_OPTIONS = [
  { value: '',            label: 'Select role…', disabled: true },
  { value: 'faculty',     label: 'Faculty' },
  { value: 'phd_student', label: 'PhD Student' },
  { value: 'lab_staff',   label: 'Lab Staff' },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Registration tab
//
//  Three sub-cards (Manual / Bulk / Table) + the ExamPeriodsCard at the top.
//  All cards use the same <Card> primitive; all form controls use the same
//  <Input>/<Select>/<Button> primitives. This is the FIRST place an admin
//  lands every session, so visual consistency matters most here.
// ─────────────────────────────────────────────────────────────────────────────
export default function Registration() {
  // ── Manual form ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({ employee_id: '', name: '', email: '', role: '', department: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Bulk upload ─────────────────────────────────────────────────────────
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Invigilator table ───────────────────────────────────────────────────
  const [invigilators, setInvigilators] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // ── Fetch invigilators (debounced search) ───────────────────────────────
  const fetchInvigilators = useCallback(async (q = '') => {
    setTableLoading(true);
    try {
      const res = await getInvigilators(q);
      setInvigilators(res.data.invigilators || []);
    } catch { setInvigilators([]); }
    finally { setTableLoading(false); }
  }, []);

  useEffect(() => { fetchInvigilators(); }, [fetchInvigilators]);
  useEffect(() => {
    const t = setTimeout(() => fetchInvigilators(search), 350);
    return () => clearTimeout(t);
  }, [search, fetchInvigilators]);

  // ── Submit manual ───────────────────────────────────────────────────────
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.role || !form.department) {
      setFormError('Name, email, role, and department are required.');
      return;
    }
    setFormError('');
    setFormLoading(true);
    try {
      const res = await registerInvigilator(form);
      toast.success(res.data?.message || 'Invigilator registered.');
      setForm({ employee_id: '', name: '', email: '', role: '', department: '' });
      fetchInvigilators(search);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Registration failed.');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Bulk upload ─────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (!bulkFile) { toast.error('Please select a file.'); return; }
    setBulkLoading(true);
    setBulkResults(null);
    try {
      const fd = new FormData();
      fd.append('file', bulkFile);
      const res = await bulkRegisterInvigilators(fd);
      const { inserted, skipped, errors } = res.data;
      setBulkResults(res.data);
      setBulkFile(null);
      if (errors.length === 0)
        toast.success(`Done — ${inserted} registered, ${skipped} skipped.`);
      else
        toast.warning(`Finished with errors — ${inserted} registered, ${skipped} skipped, ${errors.length} failed.`);
      fetchInvigilators(search);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await downloadInvigilatorTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'invigilator_template.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template.');
    }
  };

  // ── Delete invigilator ──────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await deleteInvigilator(id);
      setDeleteConfirmId(null);
      fetchInvigilators(search);
      toast.success('Invigilator removed.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed.');
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  return (
    <motion.div {...slideUp} className="space-y-6 max-w-[1500px]">
      {/* ── Page header — spans full width above the two columns ── */}
      <div>
        <h1 className="text-xl font-semibold text-text">Invigilator Registration</h1>
        <p className="text-sm text-textFaint mt-0.5">
          Register faculty, PhD students, and lab staff who will serve as invigilators.
        </p>
      </div>

      {/* Zone 1 — Exam Periods: full width */}
      <ExamPeriodsCard />

      {/* Zone 2 — Manual Registration + Bulk Upload side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Manual registration ── */}
        <Card padding="md">
          <SectionHeader icon={<UserPlus size={16} />} title="Manual Registration" />

          <form onSubmit={handleFormSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Input
              label="Employee ID (optional)"
              value={form.employee_id}
              onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))}
              placeholder="EMP001"
            />
            <Input
              label="Full name *"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Dr. Rajesh Kumar"
            />
            <Input
              label="Email *"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="rajesh.kumar@lnmiit.ac.in"
            />
            <Select
              label="Role *"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              options={ROLE_OPTIONS}
            />
            <div className="sm:col-span-2">
              <Input
                label="Department *"
                value={form.department}
                onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="Computer Science & Engineering"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 flex-wrap">
              <Button type="submit" variant="primary" loading={formLoading}>
                Register
              </Button>
              {formError && (
                <span className="text-xs text-danger flex items-center gap-1.5">
                  <CircleAlert size={13} /> {formError}
                </span>
              )}
            </div>
          </form>
        </Card>

        {/* ── Bulk upload ── */}
        <Card padding="md">
          <SectionHeader icon={<Upload size={16} />} title="Bulk Upload" />

          <p className="text-xs text-textFaint mt-1.5">
            Upload an <strong className="text-textMuted">.xlsx</strong> file with columns:&nbsp;
            {['employee_id', 'name', 'email', 'role', 'department'].map((c, i) => (
              <span key={c}>
                <code className="bg-surface2 text-textMuted px-1.5 py-0.5 rounded font-mono text-[10px]">{c}</code>
                {i < 4 ? ', ' : ''}
              </span>
            ))}
          </p>

          <label
            htmlFor="bulk-file-input"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setBulkFile(f);
            }}
            className={[
              'mt-4 block w-full rounded-lg border-2 border-dashed cursor-pointer transition-colors duration-base ease-out',
              'px-5 py-6 text-center',
              dragOver
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-border bg-surface2 hover:border-brand-500/40',
            ].join(' ')}
          >
            <input
              id="bulk-file-input"
              type="file"
              accept=".xlsx"
              onChange={(e) => { if (e.target.files[0]) setBulkFile(e.target.files[0]); }}
              disabled={bulkLoading}
              className="sr-only"
            />
            <Upload size={20} className="mx-auto text-textFaint mb-1.5" />
            <p className="text-sm font-medium text-textMuted">
              {bulkFile
                ? <>Selected: <span className="text-text font-semibold">{bulkFile.name}</span>{' '}
                  <span className="text-textFaint">({(bulkFile.size / 1024).toFixed(1)} KB)</span></>
                : 'Drag a file here, or click to browse'}
            </p>
          </label>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button onClick={handleBulkUpload} disabled={!bulkFile} loading={bulkLoading} variant="primary">
              Upload
            </Button>
            <Button onClick={handleDownloadTemplate} variant="secondary" iconLeft={<Download size={14} />}>
              Template
            </Button>
          </div>

          {bulkResults && bulkResults.errors.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="text-xs font-semibold text-textMuted mb-1.5">Rows that failed</p>
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-left text-textFaint border-b border-border">
                    <th className="py-1.5 pr-4 font-semibold">Row</th>
                    <th className="py-1.5 pr-4 font-semibold">Email</th>
                    <th className="py-1.5 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.errors.map((e, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1.5 pr-4 text-textFaint">{e.row}</td>
                      <td className="py-1.5 pr-4 text-textMuted">{e.email}</td>
                      <td className="py-1.5 text-danger">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </div>

      {/* Zone 3 — Registered Invigilators: full width at the bottom */}
      <Card padding="md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionHeader icon={<Users size={16} />} title="Registered Invigilators" />
          <div className="flex items-center gap-3">
            <div className="w-72">
              <Input
                placeholder="Search by name, email, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={14} />}
              />
            </div>
            <span className="text-xs text-textFaint whitespace-nowrap">{invigilators.length} total</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto max-h-[520px] overflow-y-auto">
          {tableLoading ? (
            <Skeleton lines={4} height="h-8" />
          ) : invigilators.length === 0 ? (
            <p className="text-sm text-textFaint py-4">No invigilators match this search.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface z-10">
                <tr className="text-left text-textFaint border-b border-border">
                  <th className="pb-2 pr-4 font-semibold">Emp ID</th>
                  <th className="pb-2 pr-4 font-semibold">Name</th>
                  <th className="pb-2 pr-4 font-semibold">Email</th>
                  <th className="pb-2 pr-4 font-semibold">Role</th>
                  <th className="pb-2 pr-4 font-semibold">Department</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Action</th>
                </tr>
              </thead>
              <motion.tbody variants={stagger} initial="initial" animate="animate">
                {invigilators.map((inv) => (
                  <motion.tr
                    key={inv.id}
                    variants={slideUp}
                    className="border-b border-border/60 hover:bg-surface2/60 transition-colors"
                  >
                    <td className="py-2 pr-4 font-mono text-textFaint">{inv.employee_id || '—'}</td>
                    <td className="py-2 pr-4 font-semibold text-text">{inv.full_name}</td>
                    <td className="py-2 pr-4 text-textMuted">{inv.email}</td>
                    <td className="py-2 pr-4 text-textMuted">{ROLE_LABELS[inv.role] || inv.role}</td>
                    <td className="py-2 pr-4 text-textMuted">{inv.department || '—'}</td>
                    <td className="py-2 pr-4">
                      <StatusPill needsActivation={!!inv.needs_activation} />
                    </td>
                    <td className="py-2">
                      {deleteConfirmId === inv.id ? (
                        <span className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(inv.id)}
                            className="text-danger font-semibold hover:underline cursor-pointer">
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-textFaint hover:underline cursor-pointer">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(inv.id)}
                          className="text-textFaint hover:text-danger transition-colors cursor-pointer">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          )}
        </div>
      </Card>

    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Small shared bits
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2.5 text-text">
      <span className="w-7 h-7 rounded-md bg-brand-500/10 text-brand-500 flex items-center justify-center">
        {icon}
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function StatusPill({ needsActivation }) {
  return needsActivation
    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning">Not activated</span>
    : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success">Active</span>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Exam Periods Card — the only place periods can be managed.
// ═════════════════════════════════════════════════════════════════════════════
function ExamPeriodsCard() {
  const {
    periodsLoaded, periodsError, activePeriod, periodVersion,
    semesterLabels, activeSemester, periodsInSemester,
    switchToSemester, switchToExamType, switchToPeriod, createNewSemester,
    loadPeriods,
  } = usePeriod();

  const [showCreate, setShowCreate] = useState(false);
  // All Periods table is collapsible — defaults to OPEN so a first-time admin
  // sees data immediately. A non-default key in localStorage would be overkill;
  // we re-default to open whenever the card unmounts.
  const [periodsOpen, setPeriodsOpen] = useState(true);
  const [newSem, setNewSem] = useState('EVEN');
  const defaultStartYear = (() => {
    const d = new Date();
    return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  })();
  const [newYearStart, setNewYearStart] = useState(defaultStartYear);
  const [creating, setCreating] = useState(false);

  const SEMESTER_OPTIONS = ['EVEN', 'ODD', 'SUMMER TERM'].map(s => ({ value: s, label: s }));
  const yearOptions = Array.from({ length: 11 }, (_, i) => defaultStartYear - 5 + i)
    .map(y => ({ value: y, label: `${y}-${y + 1}` }));
  const newLabel = `${newSem} ${newYearStart}-${newYearStart + 1}`;

  // Periods overview
  const [overview, setOverview] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await getPeriodsOverview();
      setOverview(res.data?.periods || []);
    } catch { setOverview([]); }
    finally { setOverviewLoading(false); }
  }, []);
  useEffect(() => { refreshOverview(); }, [refreshOverview, periodVersion]);

  const activateRow = async (id) => {
    if (id === activePeriod?.id) return;
    await switchToPeriod(id);
  };

  // Delete modal state
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await deleteExamPeriod(pendingDelete.id);
      const d = res.data?.deleted || {};
      const parts = [];
      if (d.slots)             parts.push(`${d.slots} slot(s)`);
      if (d.scheduled_exams)   parts.push(`${d.scheduled_exams} scheduled exam(s)`);
      if (d.seating_plans)     parts.push(`${d.seating_plans} seating plan row(s)`);
      if (d.invig_assignments) parts.push(`${d.invig_assignments} invigilator assignment(s)`);
      if (d.swap_requests)     parts.push(`${d.swap_requests} swap request(s)`);
      toast.success(
        parts.length === 0
          ? `Deleted "${pendingDelete.semester_label} / ${pendingDelete.exam_type}" (was empty).`
          : `Deleted — wiped ${parts.join(', ')}.`
      );
      setPendingDelete(null);
      await refreshOverview();
      await loadPeriods();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await createNewSemester(newLabel);
      if (res?.already_existed) {
        toast.info(`"${newLabel}" already exists — no changes made.`);
      } else {
        toast.success(`Created "${newLabel}" — both midterm & endterm ready.`);
      }
      setShowCreate(false);
      setNewSem('EVEN');
      setNewYearStart(defaultStartYear);
      await refreshOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed.');
    } finally {
      setCreating(false);
    }
  };

  if (!periodsLoaded) {
    return (
      <Card padding="md">
        <Skeleton lines={2} height="h-5" />
      </Card>
    );
  }
  if (periodsError) {
    return (
      <Card padding="md" className="border-danger/40 bg-danger/5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-danger flex items-center gap-2">
            <CircleAlert size={16} /> {periodsError}
          </span>
          <Button onClick={loadPeriods} variant="outline" size="sm">Retry</Button>
        </div>
      </Card>
    );
  }

  const midterm = periodsInSemester.find(p => p.exam_type === 'midterm');
  const endterm = periodsInSemester.find(p => p.exam_type === 'endterm');

  return (
    <Card padding="md">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <SectionHeader icon={<CalendarRange size={16} />} title="Exam Periods" />
        {activePeriod && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-success/10 text-success">
            <CheckCircle2 size={11} />
            Active: {activePeriod.semester_label} · {activePeriod.exam_type}
          </span>
        )}
      </div>
      <p className="text-xs text-textFaint mt-1.5">
        Switch between semesters/exams or create a new semester. This is the only tab where the active period can be changed.
      </p>

      {/* Semester + Exam pickers */}
      {semesterLabels.length > 0 && (
        <div className="flex flex-wrap items-end gap-4 mt-4">
          <div className="min-w-[180px]">
            <Select
              label="Semester"
              value={activeSemester}
              onChange={(e) => switchToSemester(e.target.value)}
              options={semesterLabels.map(lab => ({ value: lab, label: lab }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-textFaint">Exam</label>
            <div className="inline-flex gap-1 bg-surface2 p-0.5 rounded-md border border-border">
              {[
                { key: 'midterm', label: 'Midterm', period: midterm },
                { key: 'endterm', label: 'Endterm', period: endterm },
              ].map(et => {
                const active = activePeriod && activePeriod.exam_type === et.key && activePeriod.semester_label === activeSemester;
                const exists = !!et.period;
                return (
                  <button
                    key={et.key}
                    disabled={!exists}
                    onClick={() => switchToExamType(et.key)}
                    title={exists ? '' : 'Not created yet'}
                    className={[
                      'px-3 h-8 text-[11px] font-bold uppercase tracking-wider rounded transition-colors duration-fast',
                      active
                        ? 'bg-brand-500 text-white'
                        : exists
                          ? 'text-textMuted hover:text-text hover:bg-surface cursor-pointer'
                          : 'text-textFaint/60 cursor-not-allowed',
                    ].join(' ')}
                  >
                    {et.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── All Periods overview table ─ collapsible ──
          Click the header row to fold the table away. The chevron rotates,
          and the body slides closed with a brief height/opacity animation.
          We keep the body MOUNTED while animating (`AnimatePresence` would
          unmount it, losing scroll position). Instead a `motion.div` with
          height:auto↔0 keeps it in the tree. */}
      <div className="border-t border-border pt-4 mt-5">
        <button
          onClick={() => setPeriodsOpen((o) => !o)}
          aria-expanded={periodsOpen}
          className="w-full flex items-center justify-between gap-2 group cursor-pointer mb-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-textFaint group-hover:text-textMuted transition-colors">
            All Periods
          </p>
          <ChevronDown
            size={14}
            className={[
              'text-textFaint group-hover:text-textMuted transition-transform duration-base ease-out',
              periodsOpen ? 'rotate-0' : '-rotate-90',
            ].join(' ')}
          />
        </button>

        <motion.div
          initial={false}
          animate={{
            height:  periodsOpen ? 'auto' : 0,
            opacity: periodsOpen ? 1 : 0,
          }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
        {overviewLoading ? (
          <Skeleton lines={3} height="h-7" />
        ) : overview.length === 0 ? (
          <p className="text-xs text-textFaint py-2">No periods created yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface2 text-[10px] uppercase tracking-wider text-textFaint">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Period</th>
                  <th className="px-3 py-2 text-right font-semibold">Slots</th>
                  <th className="px-3 py-2 text-right font-semibold">Scheduled</th>
                  <th className="px-3 py-2 text-right font-semibold">Seating</th>
                  <th className="px-3 py-2 text-right font-semibold">Invigilators</th>
                  <th className="px-3 py-2 text-center font-semibold">Active</th>
                  <th className="px-3 py-2 text-center font-semibold w-12"></th>
                </tr>
              </thead>
              <motion.tbody variants={stagger} initial="initial" animate="animate">
                {overview.map((p) => {
                  const isActive = !!p.is_active;
                  return (
                    <motion.tr
                      key={p.id}
                      variants={slideUp}
                      onClick={() => !isActive && activateRow(p.id)}
                      title={isActive ? '' : 'Click to activate this period'}
                      className={[
                        'border-t border-border transition-colors duration-fast',
                        isActive
                          ? 'bg-success/5'
                          : 'hover:bg-brand-500/5 cursor-pointer',
                      ].join(' ')}
                    >
                      <td className="px-3 py-2">
                        <span className="font-semibold text-text">{p.semester_label}</span>
                        <span className="text-textFaint"> · </span>
                        <span className="uppercase tracking-wider text-[10px] font-bold text-textMuted">{p.exam_type}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-textMuted">{p.slots}</td>
                      <td className="px-3 py-2 text-right font-mono text-textMuted">{p.scheduled_exams}</td>
                      <td className="px-3 py-2 text-right font-mono text-textMuted">{p.seating_plans}</td>
                      <td className="px-3 py-2 text-right font-mono text-textMuted">{p.invig_assignments}</td>
                      <td className="px-3 py-2 text-center">
                        {isActive
                          ? <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success">Active</span>
                          : <span className="inline-block text-[10px] text-brand-500 font-bold uppercase tracking-wider">Activate →</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!isActive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                            title="Delete this period and everything under it"
                            className="text-textFaint hover:text-danger transition-colors cursor-pointer p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-textFaint italic mt-2">
          Click any non-active row to switch the active period. Click the trash icon to delete a period.
        </p>
        </motion.div>
      </div>

      {/* + New Semester */}
      <div className="border-t border-border pt-4 mt-4">
        {!showCreate ? (
          <Button onClick={() => setShowCreate(true)} variant="outline" size="sm">
            + New Semester
          </Button>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px]">
              <Select
                label="Semester"
                value={newSem}
                onChange={(e) => setNewSem(e.target.value)}
                options={SEMESTER_OPTIONS}
              />
            </div>
            <div className="min-w-[160px]">
              <Select
                label="Academic Year"
                value={newYearStart}
                onChange={(e) => setNewYearStart(Number(e.target.value))}
                options={yearOptions}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-textFaint">Preview</span>
              <span className="text-sm font-semibold text-brand-500 px-3 h-10 inline-flex items-center bg-brand-500/10 rounded-md">{newLabel}</span>
            </div>
            <Button onClick={handleCreate} loading={creating} variant="primary" size="md">
              Create
            </Button>
            <Button
              onClick={() => {
                setShowCreate(false);
                setNewSem('EVEN');
                setNewYearStart(defaultStartYear);
              }}
              variant="ghost"
              size="md"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Delete-period modal — shared <Modal/> primitive */}
      <Modal
        open={!!pendingDelete}
        onClose={() => !deleting && setPendingDelete(null)}
        title="Delete period?"
        size="md"
      >
        {pendingDelete && (
          <>
            <p className="text-sm text-text mb-3">
              <span className="font-semibold">{pendingDelete.semester_label}</span>
              <span className="text-textFaint"> · </span>
              <span className="uppercase tracking-wider text-[11px] font-bold text-textMuted">{pendingDelete.exam_type}</span>
            </p>
            <div className="bg-danger/5 border border-danger/30 rounded-lg p-3 mb-4 text-xs text-text">
              <p className="font-semibold mb-1.5 text-danger">This will permanently remove:</p>
              <ul className="space-y-0.5 ml-4 list-disc text-textMuted">
                <li><b className="text-text">{pendingDelete.slots}</b> exam slot(s)</li>
                <li><b className="text-text">{pendingDelete.scheduled_exams}</b> scheduled exam(s)</li>
                <li><b className="text-text">{pendingDelete.seating_plans}</b> seating plan row(s)</li>
                <li><b className="text-text">{pendingDelete.invig_assignments}</b> invigilator assignment(s)</li>
                <li>plus role targets, overrides, and any related swap requests</li>
              </ul>
              <p className="mt-2 text-[11px] text-textFaint italic">
                Past Exams archive snapshots are <b className="text-textMuted">not</b> affected.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setPendingDelete(null)} disabled={deleting} variant="secondary" size="md">
                Cancel
              </Button>
              <Button onClick={confirmDelete} loading={deleting} variant="danger" size="md">
                Delete forever
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}
