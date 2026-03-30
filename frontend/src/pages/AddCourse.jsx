import React, { useState, useEffect } from 'react';
import API from '../api/api.js';
import * as XLSX from 'xlsx';

function AddCourse() {
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Confirmation modal state
  const [pendingFile, setPendingFile] = useState(null);
  const [parsedCourses, setParsedCourses] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // 1. Fetch available slots when the page loads
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const response = await API.get('/exams/available-slots');
        setSlots(response.data);
      } catch (err) {
        console.error("Failed to fetch slots", err);
        setMessage("Error loading available slots.");
      }
    };
    fetchSlots();
  }, []);

  // 2. Generate and Download the Professional Blank Template
  const handleDownloadTemplate = () => {
    if (slots.length === 0) {
      return setMessage("No slots available. Please generate exam slots first.");
    }

    const excelData = [];

    // Create exactly ONE row per slot
    slots.forEach(slot => {
      const dateString = slot.exam_date.split('T')[0]; 
      
      excelData.push({
        'Slot ID (DO NOT EDIT)': slot.id,
        'Date & Day': `${dateString} (${slot.exam_day})`,
        'Time Slot': `${slot.start_time} - ${slot.end_time}`,
        'Course Name': '',   
        'Instructor': '',    
        'Total Students': '' 
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Formatting columns
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule_Template");
    XLSX.writeFile(workbook, "Exam_Schedule_Template.xlsx");
    setMessage("Template downloaded successfully.");
  };

  // 3. Read the Uploaded Excel — PARSE FIRST, THEN CONFIRM
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMessage('Reading file...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const validCourses = [];
        let currentSlotId = null;

        jsonData.forEach(row => {
          if (row['Slot ID (DO NOT EDIT)']) {
            currentSlotId = row['Slot ID (DO NOT EDIT)'];
          }
          if (row['Course Name'] && String(row['Course Name']).trim() !== '') {
            validCourses.push({
              slotId: currentSlotId,
              courseName: String(row['Course Name']).trim(),
              instructor: row['Instructor'] ? String(row['Instructor']).trim() : 'TBA',
              studentCount: parseInt(row['Total Students'], 10) || 0
            });
          }
        });

        if (validCourses.length === 0) {
          return setMessage("Error: No courses found. Did you fill out the 'Course Name' column?");
        }

        // Don't send yet — show confirmation modal
        setParsedCourses(validCourses);
        setShowConfirm(true);
        setMessage('');

      } catch (err) {
        console.error("Parse Error:", err);
        setMessage(`Parsing Error: Check console for details.`);
      }
    };
    
    e.target.value = null; 
    reader.readAsArrayBuffer(file); 
  };

  // 4. Actually send to backend after user confirms
  const handleConfirmUpload = async () => {
    setShowConfirm(false);
    setIsLoading(true);
    setMessage('Resetting data & scheduling courses...');

    try {
      const response = await API.post('/exams/schedule-batch', { courses: parsedCourses });
      const d = response.data;

      // Build a detailed success message
      let successMsg = `✅ ${d.new_courses} courses scheduled successfully!`;
      if (d.cleared?.old_courses > 0 || d.cleared?.old_allocations > 0) {
        successMsg += ` (Cleared ${d.cleared.old_courses} old courses & ${d.cleared.old_allocations} old seating allocations)`;
      }
      setMessage(successMsg);
      setParsedCourses([]);
    } catch (err) {
      console.error("Upload Error:", err);
      if (err.response) {
        setMessage(`Database Error: ${err.response.data.message}`);
      } else {
        setMessage(`Error: Failed to connect to server.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelUpload = () => {
    setShowConfirm(false);
    setParsedCourses([]);
    setMessage('Upload cancelled.');
  };

  return (
    <div className="max-w-3xl">

      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">Add Course to Slot</h2>
        <p className="text-sm text-slate-500 mt-1">Bulk schedule courses by downloading the template, filling it, and uploading</p>
      </div>

      {/* ── IMPORTANT WARNING BANNER ── */}
      <div className="mb-6 bg-amber-50 border border-amber-300 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-bold text-amber-800">Strict Upload Mode</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Uploading a new Excel sheet will <strong>replace all existing course data and seating allocations</strong>. 
              Only exam time slots are preserved. Make sure your template includes <strong>all courses for all slots</strong> before uploading.
            </p>
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">

        {/* Step 1 */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">1</div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Download Template</h3>
          </div>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed ml-10">
            Download the pre-formatted Excel sheet. It contains all available exam slots. Add your course names, instructors, and student counts into the empty columns provided.
          </p>
          <div className="ml-10">
            <button 
              onClick={handleDownloadTemplate}
              className="px-6 py-2.5 bg-white text-[#8B1A1A] text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm border border-[#8B1A1A]/30 hover:bg-[#fef2f2] hover:border-[#8B1A1A] transition-all duration-200"
            >
              ↓ Download Excel Template
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Upload Filled Template</h3>
          </div>
          <p className="text-xs text-slate-500 mb-2 leading-relaxed ml-10">
            Once you have filled out the template, upload it here. This will <strong className="text-amber-700">replace all existing courses & seating plans</strong>.
          </p>
          <p className="text-[11px] text-red-500 font-semibold mb-5 ml-10">
            ⚠ This action cannot be undone. All previous course data and seating allocations will be permanently deleted.
          </p>
          <div className="ml-10">
            <label className={`inline-flex items-center gap-2 px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 cursor-pointer ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] hover:shadow-md'}`}>
              {isLoading ? 'Processing...' : '↑ Upload Filled Template'}
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                className="hidden" 
                onChange={handleExcelUpload} 
                disabled={isLoading}
              />
            </label>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mb-6 p-4 rounded-lg text-xs font-semibold border ${message.includes('Error') || message.includes('cancelled') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {message}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CONFIRMATION MODAL
          ═══════════════════════════════════════════════════════════════════════ */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden">

            {/* Modal Header */}
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-white text-base font-bold tracking-wide">⚠ Confirm Data Reset</h3>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-700 leading-relaxed mb-4">
                This will <strong className="text-red-600">permanently delete</strong> all existing:
              </p>
              <ul className="text-sm text-slate-600 space-y-2 mb-5">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">×</span>
                  Scheduled courses (all slots)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">×</span>
                  Seating allocations (all saved plans)
                </li>
              </ul>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-5">
                <p className="text-xs text-emerald-700">
                  <strong>✓ Preserved:</strong> Exam time slots will NOT be deleted.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-600">
                  <strong>New data:</strong> {parsedCourses.length} courses will be scheduled from your uploaded file.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button 
                onClick={handleCancelUpload}
                className="px-5 py-2 bg-white text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg border border-slate-300 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmUpload}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                Yes, Reset & Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddCourse;