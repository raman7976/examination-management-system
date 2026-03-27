import React, { useState, useEffect } from 'react';
import API from '../api/api.js';
import * as XLSX from 'xlsx';

function AddCourse() {
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

// 3. Read the Uploaded Excel File and Send to Backend
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setMessage('Reading file...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const validCourses = [];
        let currentSlotId = null; // <--- THE SMART MEMORY IS BACK!

        // Loop through the Excel rows one by one
        jsonData.forEach(row => {
          // 1. If this row has a Slot ID, update our memory
          if (row['Slot ID (DO NOT EDIT)']) {
            currentSlotId = row['Slot ID (DO NOT EDIT)'];
          }

          // 2. If this row has a Course Name, save it using the remembered Slot ID
          if (row['Course Name'] && String(row['Course Name']).trim() !== '') {
            validCourses.push({
              slotId: currentSlotId, // Uses the ID from this row, or the row above it!
              courseName: String(row['Course Name']).trim(),
              instructor: row['Instructor'] ? String(row['Instructor']).trim() : 'TBA',
              studentCount: parseInt(row['Total Students'], 10) || 0
            });
          }
        });

        if (validCourses.length === 0) {
          setIsLoading(false);
          return setMessage("Error: No courses found. Did you fill out the 'Course Name' column?");
        }

        // Send to backend
        const response = await API.post('/exams/schedule-batch', { courses: validCourses });
        
        setMessage(`Success: ${validCourses.length} courses have been scheduled!`);
        setIsLoading(false);

      } catch (err) {
        console.error("Upload Error:", err);
        setIsLoading(false);
        if (err.response) {
            setMessage(`Database Error: ${err.response.data.message}`);
        } else {
            setMessage(`Parsing Error: Check console for details.`);
        }
      }
    };
    
    e.target.value = null; 
    reader.readAsArrayBuffer(file); 
  };

  return (
    <div className="max-w-3xl animate-fadeIn">
      <h2 className="text-lg font-light text-slate-700 mb-6 tracking-tight">Bulk Schedule Courses</h2>
      
      <div className="bg-slate-50 p-8 rounded-md border border-slate-100 shadow-sm">
        <div className="mb-8">
          <h3 className="text-sm font-bold text-[#8B1A1A] uppercase tracking-widest mb-2 border-b pb-2">Step 1: Download Template</h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Download the pre-formatted Excel sheet. It contains all available exam slots. Add your course names, instructors, and student counts into the empty columns provided.
          </p>
          <button 
            onClick={handleDownloadTemplate}
            className="px-6 py-2 bg-white text-slate-700 text-[11px] font-bold uppercase tracking-widest rounded shadow-sm border border-slate-200 hover:bg-slate-100 transition-all"
          >
            ↓ Download Excel Template
          </button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-[#8B1A1A] uppercase tracking-widest mb-2 border-b pb-2">Step 2: Upload Data</h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Once you have filled out the template, upload it here to instantly schedule all courses into the database.
          </p>
          <label className={`px-6 py-2 text-white text-[11px] font-bold uppercase tracking-widest rounded shadow-sm transition-all cursor-pointer ${isLoading ? 'bg-slate-400' : 'bg-[#8B1A1A] hover:bg-[#721515]'}`}>
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

        {message && (
          <div className={`mt-6 p-3 rounded text-xs font-medium border ${message.includes('Error') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

export default AddCourse;