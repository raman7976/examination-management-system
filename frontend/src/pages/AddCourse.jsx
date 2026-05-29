import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import API, { resetSemesterData, getCourseList, getEnrollmentList, uploadCourseInstructors, downloadCourseInstructorTemplate, getEnrollmentMismatches } from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';

function AddCourse() {
  const { activePeriod, periodVersion } = usePeriod();
  const activeSemester = activePeriod?.semester_label;
  // ── Course Upload State ──
  const [courseFile, setCourseFile] = useState(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseMessage, setCourseMessage] = useState({ text: '', type: '' });

  // ── Enrollment Upload State ──
  const [enrollmentFile, setEnrollmentFile] = useState(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentMessage, setEnrollmentMessage] = useState({ text: '', type: '' });
  const [mismatches, setMismatches] = useState([]);

  // ── Course-Instructor Mapping State ──
  const [mappingFile, setMappingFile]       = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingMessage, setMappingMessage] = useState({ text: '', type: '' });
  const [mappingResults, setMappingResults] = useState(null);

  // ── Reset State ──
  const [resetLoading, setResetLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // ── Data Viewer State ──
  const [courseSearch, setCourseSearch] = useState('');
  const [courses, setCourses] = useState([]);
  const [courseTotal, setCourseTotal] = useState(0);
  const [courseViewLoading, setCourseViewLoading] = useState(false);

  const [enrollmentSearch, setEnrollmentSearch] = useState('');
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentTotal, setEnrollmentTotal] = useState(0);
  const [enrollmentViewLoading, setEnrollmentViewLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  //  DATA VIEWER FETCH
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchCourses = useCallback(async (search = '') => {
    setCourseViewLoading(true);
    try {
      const res = await getCourseList(search);
      setCourses(res.data.courses || []);
      setCourseTotal(res.data.total || 0);
    } catch { setCourses([]); }
    finally { setCourseViewLoading(false); }
  }, []);

  const fetchEnrollments = useCallback(async (search = '') => {
    setEnrollmentViewLoading(true);
    try {
      const res = await getEnrollmentList(search);
      setEnrollments(res.data.students || []);
      setEnrollmentTotal(res.data.total || 0);
    } catch { setEnrollments([]); }
    finally { setEnrollmentViewLoading(false); }
  }, []);

  // Fetch on mount AND on period change (so semester-scoped data refreshes when
  // the active semester flips from Registration).
  const fetchMismatches = useCallback(async () => {
    try {
      const res = await getEnrollmentMismatches();
      setMismatches(res.data?.mismatches || []);
    } catch { setMismatches([]); }
  }, []);

  useEffect(() => {
    fetchCourses();
    fetchEnrollments();
    fetchMismatches();
  }, [fetchCourses, fetchEnrollments, fetchMismatches, periodVersion]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => fetchCourses(courseSearch), 400);
    return () => clearTimeout(timer);
  }, [courseSearch, fetchCourses]);

  useEffect(() => {
    const timer = setTimeout(() => fetchEnrollments(enrollmentSearch), 400);
    return () => clearTimeout(timer);
  }, [enrollmentSearch, fetchEnrollments]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  UTILITY HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Course code', 'Course Name', 'Short Name', 'Total Student']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Course Template");
    XLSX.writeFile(wb, "Course_Template.xlsx");
  };

  // The Import-Data "Wipe Everything" button means EVERYTHING for the active
  // semester — including courses, enrollments and instructor mappings — since
  // those are the only things uploadable from this tab. wipeRoster=true.
  const handleResetSemester = async () => {
    setResetLoading(true);
    try {
      const response = await resetSemesterData({ wipeRoster: true });
      setCourseMessage({ text: response.data.message || 'Semester data successfully wiped.', type: 'success' });
      setEnrollmentMessage({ text: '', type: '' });
      fetchCourses(); fetchEnrollments(); fetchMismatches();
    } catch (err) {
      console.error('Reset error:', err);
      setCourseMessage({ text: err.response?.data?.message || 'Failed to wipe semester data.', type: 'error' });
    } finally {
      setResetLoading(false);
      setConfirmReset(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  COURSE MASTER UPLOAD (.xlsx)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCourseFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setCourseFile(file);
  };

  const handleCourseUpload = async () => {
    if (!courseFile) {
      setCourseMessage({ text: 'Please select an .xlsx file first.', type: 'error' });
      return;
    }

    setCourseLoading(true);
    setCourseMessage({ text: '', type: '' });

    try {
      const formData = new FormData();
      formData.append('file', courseFile);

      const response = await API.post('/upload/courses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setCourseMessage({
        text: response.data.message || `${response.data.courses_processed} courses processed.`,
        type: 'success',
      });
      setCourseFile(null);
      const input = document.getElementById('course-file-input');
      if (input) input.value = '';
      fetchCourses(courseSearch);

    } catch (err) {
      console.error('Course upload error:', err);
      const msg = err.response?.data?.message || 'Failed to upload courses. Please try again.';
      setCourseMessage({ text: msg, type: 'error' });
    } finally {
      setCourseLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  ENROLLMENT ZIP UPLOAD (.zip)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleEnrollmentFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setEnrollmentFile(file);
  };

  const handleEnrollmentUpload = async () => {
    if (!enrollmentFile) {
      setEnrollmentMessage({ text: 'Please select a .zip file first.', type: 'error' });
      return;
    }

    setEnrollmentLoading(true);
    setEnrollmentMessage({ text: '', type: '' });
    setMismatches([]);

    try {
      const formData = new FormData();
      formData.append('file', enrollmentFile);

      const response = await API.post('/upload/enrollments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const s = response.data.summary;
      const detailMsg = s
        ? `Processed ${s.files_processed} file(s) · ${s.students_inserted} new students · ${s.enrollments_inserted} new enrollments`
        : response.data.message;

      setEnrollmentMessage({ text: detailMsg, type: 'success' });

      if (response.data.warnings?.length > 0) {
        setEnrollmentMessage(prev => ({
          ...prev,
          text: prev.text + `\n⚠ ${response.data.warnings.length} warning(s): ${response.data.warnings.join('; ')}`,
        }));
      }

      setMismatches(response.data.mismatches || []);
      setEnrollmentFile(null);
      const input = document.getElementById('enrollment-file-input');
      if (input) input.value = '';
      fetchEnrollments(enrollmentSearch);

    } catch (err) {
      console.error('Enrollment upload error:', err);
      const msg = err.response?.data?.message || 'Failed to upload enrollments. Please try again.';
      setEnrollmentMessage({ text: msg, type: 'error' });
    } finally {
      setEnrollmentLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  COURSE-INSTRUCTOR MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  const handleMappingFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setMappingFile(file);
  };

  const handleDownloadMappingTemplate = async () => {
    try {
      const response = await downloadCourseInstructorTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'course_instructor_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setMappingMessage({ text: 'Failed to download template.', type: 'error' });
    }
  };

  const handleMappingUpload = async () => {
    if (!mappingFile) {
      setMappingMessage({ text: 'Please select an .xlsx file first.', type: 'error' });
      return;
    }
    setMappingLoading(true);
    setMappingMessage({ text: '', type: '' });
    setMappingResults(null);
    try {
      const formData = new FormData();
      formData.append('file', mappingFile);
      const response = await uploadCourseInstructors(formData);
      const { inserted, skipped, errors } = response.data;
      setMappingMessage({
        text: `Done — ${inserted} linked, ${skipped} skipped, ${errors.length} errors.`,
        type: errors.length ? 'error' : 'success',
      });
      setMappingResults(response.data);
      setMappingFile(null);
      const input = document.getElementById('mapping-file-input');
      if (input) input.value = '';
    } catch (err) {
      setMappingMessage({ text: err.response?.data?.message || 'Upload failed.', type: 'error' });
    } finally {
      setMappingLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  REUSABLE UI COMPONENTS
  // ═══════════════════════════════════════════════════════════════════════════

  const StatusMessage = ({ message }) => {
    if (!message.text) return null;
    const isError = message.type === 'error';
    return (
      <div className={`mt-4 p-3 rounded-md text-xs font-semibold whitespace-pre-line ${isError
        ? 'bg-danger/10 text-danger border border-danger/30'
        : 'bg-success/10 text-success border border-success/30'
        }`}>
        {message.text}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* Per-semester scoping banner */}
      {activeSemester && (
        <div className="mb-5 px-4 py-2.5 rounded-lg border border-warning/30 bg-warning/10 text-[11px] text-warning flex items-center gap-2">
          <span className="font-bold">⚠ Uploads will be tagged to:</span>
          <span className="font-bold text-warning px-2 py-0.5 rounded bg-warning/15">{activeSemester}</span>
          <span className="ml-auto text-warning italic">Courses, enrollments, and instructor mappings are isolated per semester. Change the active semester from <b>Registration</b>.</span>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Import Data</h2>
        <p className="text-sm text-textMuted mt-1">
          Upload your Course Master list and Student Enrollment data, then view them in real time.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">

        {/* ══════════ LEFT COLUMN — Upload Forms ══════════ */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Safety Note */}
          <div className="bg-warning/10 border-l-4 border-warning/30 p-4 rounded-r" >
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-warning" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-warning">
                  <strong>Important:</strong> You <strong>must</strong> upload Course Master (Step 1) before Student Enrollments (Step 2).
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 1: COURSE MASTER */}
          <div className="bg-surface rounded-lg overflow-hidden border border-border shadow-sm" >
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" >1</div>
                <h3 className="text-sm font-bold text-text uppercase tracking-wider">Course Master List</h3>
              </div>

              <p className="text-xs text-textMuted mb-2 leading-relaxed ml-9">
                Upload an <strong>.xlsx</strong> file. Expected columns:
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono ml-1">Course code</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">Course Name</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">Short Name</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">Total Student</code>
              </p>
              <p className="text-[10px] text-textFaint mb-4 ml-9">Existing courses with matching codes will be updated automatically (upsert).</p>

              <div className="ml-9 flex items-center gap-3 flex-wrap">
                <label className="flex-1 min-w-0">
                  <input id="course-file-input" type="file" accept=".xlsx" onChange={handleCourseFileChange} disabled={courseLoading}
                    className="block w-full text-xs text-textMuted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface2 file:text-text hover:file:bg-surface2 file:cursor-pointer file:transition-all disabled:opacity-50 disabled:cursor-not-allowed" />
                </label>
                <button onClick={handleCourseUpload} disabled={courseLoading || !courseFile}
                  className={`px-4 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 flex items-center gap-2 ${courseLoading || !courseFile ? 'bg-textFaint cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 cursor-pointer'}`}>
                  {courseLoading && <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>}
                  {courseLoading ? 'Processing...' : 'Upload'}
                </button>
                <button onClick={handleDownloadTemplate}
                  className="px-3 py-2 text-xs font-semibold rounded-md transition-all border cursor-pointer bg-surface2 text-textMuted border-border hover:bg-surface">
                  Template
                </button>
              </div>

              {courseFile && !courseLoading && (
                <div className="ml-9 mt-2 flex items-center gap-2 text-xs text-textMuted">
                  <span className="font-medium truncate">{courseFile.name}</span>
                  <span className="text-textFaint">({(courseFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
              <div className="ml-9"><StatusMessage message={courseMessage} /></div>
            </div>
          </div>

          {/* SECTION 2: STUDENT ENROLLMENTS */}
          <div className="bg-surface rounded-lg overflow-hidden border border-border shadow-sm" >
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" >2</div>
                <h3 className="text-sm font-bold text-text uppercase tracking-wider">Student Enrollments</h3>
              </div>

              <p className="text-xs text-textMuted mb-2 leading-relaxed ml-9">
                Upload a <strong>.zip</strong> containing enrollment <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">.xlsx</code> files with columns:
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono ml-1">ROLLNO</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">STUDENTNAME</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">EMAILID</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">BRANCH</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">COURSENAME</code>
              </p>

              <div className="ml-9 mb-4 bg-info/10 border border-info/30 rounded-md p-2.5">
                <p className="text-[10px] text-info">
                  <strong>Note:</strong> Course code is extracted from <code className="font-mono">COURSENAME</code> (e.g., "CSE437-Compiler Design" → CSE437).
                </p>
              </div>

              <div className="ml-9 flex items-center gap-3 flex-wrap">
                <label className="flex-1 min-w-0">
                  <input id="enrollment-file-input" type="file" accept=".zip" onChange={handleEnrollmentFileChange} disabled={enrollmentLoading}
                    className="block w-full text-xs text-textMuted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface2 file:text-text hover:file:bg-surface2 file:cursor-pointer file:transition-all disabled:opacity-50 disabled:cursor-not-allowed" />
                </label>
                <button onClick={handleEnrollmentUpload} disabled={enrollmentLoading || !enrollmentFile}
                  className={`px-4 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 flex items-center gap-2 ${enrollmentLoading || !enrollmentFile ? 'bg-textFaint cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 cursor-pointer'}`}>
                  {enrollmentLoading && <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>}
                  {enrollmentLoading ? 'Processing...' : 'Upload'}
                </button>
              </div>

              {enrollmentFile && !enrollmentLoading && (
                <div className="ml-9 mt-2 flex items-center gap-2 text-xs text-textMuted">
                  <span className="font-medium truncate">{enrollmentFile.name}</span>
                  <span className="text-textFaint">({(enrollmentFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
              <div className="ml-9"><StatusMessage message={enrollmentMessage} /></div>

              {mismatches.length > 0 && (
                <div className="ml-9 mt-3 rounded-md overflow-hidden border border-warning/40">
                  <div className="px-3 py-2 flex items-center gap-2 bg-warning/10">
                    <svg className="w-4 h-4 flex-shrink-0 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <span className="text-xs font-bold text-warning">
                      {mismatches.length} course{mismatches.length !== 1 ? 's' : ''} have fewer enrolled students than expected
                    </span>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-warning/10 border-t border-warning/40">
                      <tr>
                        {['Course Code', 'Course Name', 'Expected', 'Enrolled', 'Missing'].map(h => (
                          <th key={h} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-warning">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mismatches.map((m) => (
                        <tr key={m.course_code} className="border-t border-warning/30 bg-surface">
                          <td className="px-3 py-1.5 text-xs font-mono font-bold text-warning">{m.course_code}</td>
                          <td className="px-3 py-1.5 text-xs text-textMuted truncate max-w-[160px]" title={m.course_name}>{m.course_name}</td>
                          <td className="px-3 py-1.5 text-xs text-textMuted text-right">{m.expected}</td>
                          <td className="px-3 py-1.5 text-xs text-textMuted text-right">{m.actual}</td>
                          <td className="px-3 py-1.5 text-xs font-bold text-right text-danger">−{m.gap}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-warning/10 border-t border-warning/40">
                    <p className="text-[10px] text-warning">Re-upload the enrollment files for these courses to fix the gaps before proceeding to scheduling.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: COURSE-INSTRUCTOR MAPPING */}
          <div className="bg-surface rounded-lg overflow-hidden border border-border shadow-sm" >
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" >3</div>
                <h3 className="text-sm font-bold text-text uppercase tracking-wider">Link Instructors to Courses</h3>
              </div>

              <p className="text-xs text-textMuted mb-1 leading-relaxed ml-9">
                Upload an <strong>.xlsx</strong> mapping file with columns:
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono ml-1">course_code</code>,
                <code className="bg-surface2 px-1 py-0.5 rounded text-[10px] font-mono">employee_id</code>
              </p>
              <p className="text-[10px] text-textFaint mb-4 ml-9">One row per instructor-course pair. Invigilators must be registered first (Registration tab).</p>

              <div className="ml-9 flex items-center gap-3 flex-wrap">
                <label className="flex-1 min-w-0">
                  <input id="mapping-file-input" type="file" accept=".xlsx" onChange={handleMappingFileChange} disabled={mappingLoading}
                    className="block w-full text-xs text-textMuted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface2 file:text-text hover:file:bg-surface2 file:cursor-pointer file:transition-all disabled:opacity-50 disabled:cursor-not-allowed" />
                </label>
                <button onClick={handleMappingUpload} disabled={mappingLoading || !mappingFile}
                  className={`px-4 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 flex items-center gap-2 ${mappingLoading || !mappingFile ? 'bg-textFaint cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 cursor-pointer'}`}>
                  {mappingLoading ? 'Processing...' : 'Upload'}
                </button>
                <button onClick={handleDownloadMappingTemplate}
                  className="px-3 py-2 text-xs font-semibold rounded-md transition-all border cursor-pointer bg-surface2 text-textMuted border-border hover:bg-surface">
                  Template
                </button>
              </div>

              {mappingFile && !mappingLoading && (
                <div className="ml-9 mt-2 flex items-center gap-2 text-xs text-textMuted">
                  <span className="font-medium truncate">{mappingFile.name}</span>
                  <span className="text-textFaint">({(mappingFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
              <div className="ml-9"><StatusMessage message={mappingMessage} /></div>

              {mappingResults && mappingResults.errors.length > 0 && (
                <div className="ml-9 mt-3 overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="text-left text-textMuted border-b border-border">
                        <th className="pb-1 pr-4 font-medium">Row</th>
                        <th className="pb-1 pr-4 font-medium">Course Code</th>
                        <th className="pb-1 pr-4 font-medium">Employee ID</th>
                        <th className="pb-1 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappingResults.errors.map((e, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="py-1 pr-4 text-textMuted">{e.row}</td>
                          <td className="py-1 pr-4 font-mono text-text">{e.course_code}</td>
                          <td className="py-1 pr-4 font-mono text-text">{e.employee_id}</td>
                          <td className="py-1 text-danger">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* DANGER ZONE */}
          <div className="rounded-lg overflow-hidden bg-danger/10 border border-danger/30">
            <div className="p-5">
              <h3 className="text-sm font-bold text-danger uppercase tracking-wider mb-1">Danger Zone</h3>
              <p className="text-xs text-danger mb-3 leading-relaxed max-w-xl">
                Wipes ALL data for <strong>{activeSemester || 'the active semester'}</strong> only — courses, student enrollments, instructor mappings, exam slots, scheduling and seating. Other semesters are <strong>not</strong> touched. Institutional <code className="px-1 py-0.5 rounded bg-danger/15 font-mono text-[10px]">students</code> roster is preserved. <strong>This cannot be undone.</strong>
              </p>
              {!confirmReset ? (
                <button onClick={() => setConfirmReset(true)}
                  className="px-5 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 bg-danger hover:bg-danger/90 cursor-pointer">
                  Wipe {activeSemester ? `"${activeSemester}"` : 'Active Semester'} Data
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-md bg-danger/20 border border-danger/40">
                  <span className="text-xs font-semibold text-danger">Are you absolutely sure? This affects {activeSemester || 'the active semester'} only.</span>
                  <button onClick={handleResetSemester} disabled={resetLoading}
                    className={`px-4 py-1.5 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${resetLoading ? 'bg-danger/20 cursor-not-allowed' : 'bg-danger hover:bg-danger cursor-pointer'}`}>
                    {resetLoading ? 'Wiping...' : 'Yes, Wipe Everything'}
                  </button>
                  <button onClick={() => setConfirmReset(false)} disabled={resetLoading}
                    className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer bg-surface text-textMuted border border-border">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════ RIGHT COLUMN — Data Viewers ══════════ */}
        <div className="w-96 flex-shrink-0 space-y-6">

          {/* Course Master Viewer */}
          <div className="bg-surface rounded-lg overflow-hidden border border-border shadow-sm" >
            <div className="px-4 py-3 flex items-center justify-between" >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4"  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.331 0 4.512.89 6.042 2.36M12 6.042a8.967 8.967 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.36" />
                </svg>
                <h3 className="text-xs font-bold text-text uppercase tracking-wider">Course Master</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                {courseTotal} total
              </span>
            </div>

            {/* Search */}
            <div className="px-3 py-2" >
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input type="text" value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="Search by code or name..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md transition-all border border-border bg-surface2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
              </div>
            </div>

            {/* Table */}
            <div className="max-h-72 overflow-y-auto">
              {courseViewLoading ? (
                <div className="p-6 text-center text-xs text-textFaint">Loading...</div>
              ) : courses.length === 0 ? (
                <div className="p-6 text-center text-xs text-textFaint">No courses found. Upload a Course Master list.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="text-[10px] uppercase tracking-wider sticky top-0 bg-surface2 text-textFaint border-b border-border">
                    <tr>
                      <th className="px-3 py-2 font-bold">Code</th>
                      <th className="px-3 py-2 font-bold">Course Name</th>
                      <th className="px-3 py-2 font-bold">Short Name</th>
                      <th className="px-3 py-2 font-bold text-right">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((c, i) => (
                      <tr key={i} className="transition-colors hover:bg-brand-500/5">
                        <td className="px-3 py-2 text-xs font-semibold text-brand-500">{c.course_code}</td>
                        <td className="px-3 py-2 text-xs text-textMuted truncate max-w-[140px]" title={c.course_name}>{c.course_name}</td>
                        <td className="px-3 py-2 text-xs text-textMuted">{c.short_name || '-'}</td>
                        <td className="px-3 py-2 text-xs text-textMuted text-right font-medium">{c.total_students}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {courses.length > 0 && (
              <div className="px-3 py-2 text-[10px] text-center text-textFaint border-t border-border">
                Showing {courses.length} of {courseTotal} courses
              </div>
            )}
          </div>

          {/* Student Enrollment Viewer */}
          <div className="bg-surface rounded-lg overflow-hidden border border-border shadow-sm" >
            <div className="px-4 py-3 flex items-center justify-between" >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4"  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                <h3 className="text-xs font-bold text-text uppercase tracking-wider">Student Enrollments</h3>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                {enrollmentTotal} total
              </span>
            </div>

            {/* Search */}
            <div className="px-3 py-2" >
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input type="text" value={enrollmentSearch} onChange={(e) => setEnrollmentSearch(e.target.value)}
                  placeholder="Search by roll no, name, or branch..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md transition-all border border-border bg-surface2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
              </div>
            </div>

            {/* Table */}
            <div className="max-h-72 overflow-y-auto">
              {enrollmentViewLoading ? (
                <div className="p-6 text-center text-xs text-textFaint">Loading...</div>
              ) : enrollments.length === 0 ? (
                <div className="p-6 text-center text-xs text-textFaint">No students found. Upload enrollment data.</div>
              ) : (
                <table className="w-full text-left">
                  <thead className="text-[10px] uppercase tracking-wider sticky top-0 bg-surface2 text-textFaint border-b border-border">
                    <tr>
                      <th className="px-3 py-2 font-bold">Roll No</th>
                      <th className="px-3 py-2 font-bold">Name</th>
                      <th className="px-3 py-2 font-bold">Branch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((s, i) => (
                      <tr key={i} className="transition-colors hover:bg-brand-500/5">
                        <td className="px-3 py-2 text-xs font-semibold text-brand-500">{s.roll_number}</td>
                        <td className="px-3 py-2 text-xs text-textMuted truncate max-w-[120px]" title={s.name}>{s.name}</td>
                        <td className="px-3 py-2 text-xs text-textMuted">{s.branch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {enrollments.length > 0 && (
              <div className="px-3 py-2 text-[10px] text-center text-textFaint border-t border-border">
                Showing {enrollments.length} of {enrollmentTotal} students
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default AddCourse;