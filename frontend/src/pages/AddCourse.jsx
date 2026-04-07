import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import API, { resetSemesterData } from '../api/api.js';

function AddCourse() {
  // ── Course Upload State ──
  const [courseFile, setCourseFile] = useState(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseMessage, setCourseMessage] = useState({ text: '', type: '' });

  // ── Enrollment Upload State ──
  const [enrollmentFile, setEnrollmentFile] = useState(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentMessage, setEnrollmentMessage] = useState({ text: '', type: '' });

  // ── Reset State ──
  const [resetLoading, setResetLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  //  UTILITY HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Course code', 'Course Name', 'Instructor', 'Total Student']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Course Template");
    XLSX.writeFile(wb, "Course_Template.xlsx");
  };

  const handleResetSemester = async () => {
    if (window.confirm("⚠️ WARNING: This will DESTRUCTIVELY WIPE all semester data including courses, students, and enrollments. Are you absolutely sure?")) {
      setResetLoading(true);
      try {
        const response = await resetSemesterData();
        alert(response.data.message || "Semester data successfully wiped.");
        setCourseMessage({ text: '', type: '' });
        setEnrollmentMessage({ text: '', type: '' });
      } catch (err) {
        console.error('Reset error:', err);
        alert(err.response?.data?.message || "Failed to wipe semester data.");
      } finally {
        setResetLoading(false);
      }
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
        text: response.data.message || `✅ ${response.data.courses_processed} courses processed.`,
        type: 'success',
      });
      setCourseFile(null);
      // Reset the file input
      const input = document.getElementById('course-file-input');
      if (input) input.value = '';

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

    try {
      const formData = new FormData();
      formData.append('file', enrollmentFile);

      const response = await API.post('/upload/enrollments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const s = response.data.summary;
      const detailMsg = s
        ? `✅ Processed ${s.files_processed} file(s) · ${s.students_inserted} new students · ${s.enrollments_inserted} new enrollments`
        : response.data.message;

      setEnrollmentMessage({ text: detailMsg, type: 'success' });

      // Show warnings if any
      if (response.data.warnings?.length > 0) {
        setEnrollmentMessage(prev => ({
          ...prev,
          text: prev.text + `\n⚠ ${response.data.warnings.length} warning(s): ${response.data.warnings.join('; ')}`,
        }));
      }

      setEnrollmentFile(null);
      const input = document.getElementById('enrollment-file-input');
      if (input) input.value = '';

    } catch (err) {
      console.error('Enrollment upload error:', err);
      const msg = err.response?.data?.message || 'Failed to upload enrollments. Please try again.';
      setEnrollmentMessage({ text: msg, type: 'error' });
    } finally {
      setEnrollmentLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  REUSABLE MESSAGE COMPONENT
  // ═══════════════════════════════════════════════════════════════════════════

  const StatusMessage = ({ message }) => {
    if (!message.text) return null;
    const isError = message.type === 'error';
    return (
      <div className={`mt-4 p-4 rounded-lg text-xs font-semibold border whitespace-pre-line ${
        isError
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
      }`}>
        {message.text}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-3xl">

      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">📥 Data Import</h2>
        <p className="text-sm text-slate-500 mt-1">
          Upload your Course Master list and Student Enrollment data to populate the system.
        </p>
      </div>

      {/* UI Safety Note */}
      <div className="mb-6 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r shadow-sm">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-amber-800">
              <strong>⚠️ IMPORTANT:</strong> You <strong>MUST</strong> complete Step 1 (Course Master) before Step 2. Students cannot be enrolled in a course that does not exist in the Course Master.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1: COURSE MASTER UPLOAD
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">1</div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Course Master List</h3>
          </div>

          <p className="text-xs text-slate-500 mb-2 leading-relaxed ml-10">
            Upload an <strong>.xlsx</strong> file containing your course data. 
            Expected columns: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">Course code</code>, 
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">Course Name</code>, 
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">Instructor</code>, 
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">Total Student</code>
          </p>

          <p className="text-[11px] text-slate-400 mb-5 ml-10">
            Existing courses with matching codes will be updated automatically (upsert).
          </p>

          <div className="ml-10 flex items-center gap-4 flex-wrap">
            {/* File Input */}
            <label className="flex-1 min-w-0">
              <input
                id="course-file-input"
                type="file"
                accept=".xlsx"
                onChange={handleCourseFileChange}
                disabled={courseLoading}
                className="block w-full text-xs text-slate-500 
                  file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 
                  file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 
                  hover:file:bg-slate-200 file:cursor-pointer file:transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            {/* Upload Button */}
            <button
              onClick={handleCourseUpload}
              disabled={courseLoading || !courseFile}
              className={`px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 flex items-center gap-2 ${
                courseLoading || !courseFile
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-[#8B1A1A] hover:bg-[#721515] hover:shadow-md cursor-pointer'
              }`}
            >
              {courseLoading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              )}
              {courseLoading ? 'Processing...' : '↑ Upload Courses'}
            </button>

            {/* Download Template Button */}
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm hover:bg-slate-200 transition-all duration-200 flex items-center gap-2 border border-slate-300"
            >
              ⬇ Download Template
            </button>
          </div>

          {/* Selected file indicator */}
          {courseFile && !courseLoading && (
            <div className="ml-10 mt-3 flex items-center gap-2 text-xs text-slate-600">
              <span className="text-emerald-500">📄</span>
              <span className="font-medium truncate">{courseFile.name}</span>
              <span className="text-slate-400">({(courseFile.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}

          <StatusMessage message={courseMessage} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2: STUDENT ENROLLMENT UPLOAD
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Student Enrollments</h3>
          </div>

          <p className="text-xs text-slate-500 mb-2 leading-relaxed ml-10">
            Upload a <strong>.zip</strong> file containing enrollment Excel sheets.
            Each <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">.xlsx</code> file inside should have columns:
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">ROLLNO</code>,
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">STUDENTNAME</code>,
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">EMAILID</code>,
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">BRANCH</code>,
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">SECTIONNAME</code>,
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">COURSE_TYPE</code>,
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono">COURSENAME</code>
          </p>

          <div className="ml-10 mb-5 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[11px] text-blue-700">
              <strong>💡 Note:</strong> The course code is automatically extracted from
              the <code className="font-mono">COURSENAME</code> column (e.g., <em>"CSE437-Compiler Design"</em> → <strong>CSE437</strong>).
              Processing a large zip may take a moment — please be patient.
            </p>
          </div>

          <div className="ml-10 flex items-center gap-4 flex-wrap">
            {/* File Input */}
            <label className="flex-1 min-w-0">
              <input
                id="enrollment-file-input"
                type="file"
                accept=".zip"
                onChange={handleEnrollmentFileChange}
                disabled={enrollmentLoading}
                className="block w-full text-xs text-slate-500 
                  file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 
                  file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 
                  hover:file:bg-slate-200 file:cursor-pointer file:transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            {/* Upload Button */}
            <button
              onClick={handleEnrollmentUpload}
              disabled={enrollmentLoading || !enrollmentFile}
              className={`px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 flex items-center gap-2 ${
                enrollmentLoading || !enrollmentFile
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-[#8B1A1A] hover:bg-[#721515] hover:shadow-md cursor-pointer'
              }`}
            >
              {enrollmentLoading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              )}
              {enrollmentLoading ? 'Processing Zip...' : '↑ Upload Enrollments'}
            </button>
          </div>

          {/* Selected file indicator */}
          {enrollmentFile && !enrollmentLoading && (
            <div className="ml-10 mt-3 flex items-center gap-2 text-xs text-slate-600">
              <span className="text-emerald-500">📦</span>
              <span className="font-medium truncate">{enrollmentFile.name}</span>
              <span className="text-slate-400">({(enrollmentFile.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}

          <StatusMessage message={enrollmentMessage} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3: DANGER ZONE
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 overflow-hidden mt-10 mb-6">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">Danger Zone</h3>
          </div>
          <p className="text-xs text-red-600 mb-4 leading-relaxed max-w-xl">
            Wiping the semester data will permanently delete all courses, students, course enrollments, and related schedules. <strong>This action cannot be undone.</strong> Do not use this unless you are setting up a completely new semester.
          </p>
          <button
            onClick={handleResetSemester}
            disabled={resetLoading}
            className={`px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 flex items-center gap-2 ${
              resetLoading
                ? 'bg-red-300 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 hover:shadow-md cursor-pointer'
            }`}
          >
            {resetLoading ? 'Wiping Data...' : '⚠️ Wipe All Semester Data'}
          </button>
        </div>
      </div>

    </div>
  );
}

export default AddCourse;