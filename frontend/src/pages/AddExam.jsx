import React, { useState } from 'react';
import API from '../api/api.js';

function AddExam() {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [dailySlots, setDailySlots] = useState([{ startTime: '', endTime: '' }]);
  const [generatedSlots, setGeneratedSlots] = useState([]);
  const [message, setMessage] = useState('');

  // Handle adding/removing daily time slots
  const handleAddTimeSlot = () => setDailySlots([...dailySlots, { startTime: '', endTime: '' }]);
  const handleRemoveTimeSlot = (index) => setDailySlots(dailySlots.filter((_, i) => i !== index));
  const handleTimeChange = (index, field, value) => {
    const updated = [...dailySlots];
    updated[index][field] = value;
    setDailySlots(updated);
  };

  // The Engine: Generates the slots based on inputs
  const handleGeneratePreview = (e) => {
    e.preventDefault();
    if (!dateRange.start || !dateRange.end) return setMessage("Please select both dates.");

    let current = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const newSlots = [];

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 is Sunday, 6 is Saturday
      
      // Skip weekends if checkbox is checked
      if (skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      const dateString = current.toISOString().split('T')[0];
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long' });

      // Create a slot for every time block defined
      dailySlots.forEach(slot => {
        if (slot.startTime && slot.endTime) {
          newSlots.push({
            date: dateString,
            day: dayName,
            startTime: slot.startTime,
            endTime: slot.endTime
          });
        }
      });
      current.setDate(current.getDate() + 1);
    }
    setGeneratedSlots(newSlots);
    setMessage('');
  };

  // Submit the batch to the backend
  const handleSaveSlots = async () => {
    try {
      // NOTE: We will update the backend to accept an array of slots next!
      const response = await API.post('/exams/add-batch-slots', { slots: generatedSlots });
      setMessage(`Success: ${generatedSlots.length} slots created!`);
      setGeneratedSlots([]); // Clear preview on success
      setDateRange({ start: '', end: '' });
    } catch (err) {
      setMessage("Error: " + (err.response?.data?.message || "Server error"));
    }
  };

  return (
    <div className="max-w-3xl animate-fadeIn">
      <h2 className="text-lg font-light text-slate-700 mb-6 tracking-tight">Generate Exam Slots</h2>
      
      <form onSubmit={handleGeneratePreview} className="space-y-6 bg-slate-50 p-6 rounded-md border border-slate-100">
        
        {/* Date Range Section */}
        <div>
          <h3 className="text-[10px] font-bold text-[#8B1A1A] uppercase tracking-widest mb-3 border-b pb-1">1. Select Date Range</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Start Date</label>
              <input 
                type="date" 
                className="w-full text-sm font-light p-2 bg-white border border-slate-200 rounded focus:outline-none focus:border-[#8B1A1A] transition-colors"
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">End Date</label>
              <input 
                type="date" 
                className="w-full text-sm font-light p-2 bg-white border border-slate-200 rounded focus:outline-none focus:border-[#8B1A1A] transition-colors"
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                required
              />
            </div>
          </div>
          
          <div className="mt-3 flex items-center gap-2">
            <input 
              type="checkbox" 
              id="skipWeekends"
              checked={skipWeekends}
              onChange={(e) => setSkipWeekends(e.target.checked)}
              className="accent-[#8B1A1A]"
            />
            <label htmlFor="skipWeekends" className="text-sm font-light text-slate-600 cursor-pointer">Skip Weekends (Sat & Sun)</label>
          </div>
        </div>

        {/* Daily Time Slots Section */}
        <div>
          <h3 className="text-[10px] font-bold text-[#8B1A1A] uppercase tracking-widest mb-3 border-b pb-1">2. Define Daily Time Slots</h3>
          {dailySlots.map((slot, index) => (
            <div key={index} className="grid grid-cols-12 gap-4 items-end mb-3">
              <div className="col-span-5 space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Start Time</label>
                <input 
                  type="time" 
                  className="w-full text-sm font-light p-2 bg-white border border-slate-200 rounded focus:outline-none focus:border-[#8B1A1A]"
                  value={slot.startTime}
                  onChange={(e) => handleTimeChange(index, 'startTime', e.target.value)}
                  required
                />
              </div>
              <div className="col-span-5 space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">End Time</label>
                <input 
                  type="time" 
                  className="w-full text-sm font-light p-2 bg-white border border-slate-200 rounded focus:outline-none focus:border-[#8B1A1A]"
                  value={slot.endTime}
                  onChange={(e) => handleTimeChange(index, 'endTime', e.target.value)}
                  required
                />
              </div>
              <div className="col-span-2 pb-1">
                {dailySlots.length > 1 && (
                  <button type="button" onClick={() => handleRemoveTimeSlot(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddTimeSlot} className="text-xs font-semibold text-[#8B1A1A] hover:underline mt-1">
            + Add Another Daily Slot
          </button>
        </div>

        <button type="submit" className="w-full py-2 bg-slate-800 text-white text-xs font-semibold uppercase tracking-widest rounded shadow-sm hover:bg-slate-700 transition-all">
          Generate Preview Grid
        </button>
      </form>
{/* Preview Section */}
{generatedSlots.length > 0 && (() => {
  // 1. Group the flat array of slots by Date
  const groupedSlots = generatedSlots.reduce((acc, slot) => {
    if (!acc[slot.date]) {
      acc[slot.date] = { day: slot.day, times: [] };
    }
    acc[slot.date].times.push(`${slot.startTime} - ${slot.endTime}`);
    return acc;
  }, {});

  return (
    <div className="mt-8 animate-fadeIn">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Preview: {generatedSlots.length} Slots Generated</h3>
      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded mb-4 shadow-inner">
        <table className="w-full text-left text-sm font-light">
          
          {/* UPDATED HEADER: Now only two columns */}
          <thead className="bg-slate-100 text-[10px] uppercase text-slate-500 sticky top-0">
            <tr>
              <th className="p-3 w-1/3">Date & Day</th>
              <th className="p-3 w-2/3">Time Slots</th>
            </tr>
          </thead>
          
          <tbody>
            {Object.entries(groupedSlots).map(([date, data], idx) => (
              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                
                {/* UPDATED CELL: Merged Date and Day into one clean block */}
                <td className="p-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-700">{date}</span>
                    <span className="text-xs text-slate-400 mt-0.5">{data.day}</span>
                  </div>
                </td>
                
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {data.times.map((time, tIdx) => (
                      <span 
                        key={tIdx} 
                        className="px-2.5 py-1 bg-[#8B1A1A]/5 text-[#8B1A1A] text-xs font-medium rounded border border-[#8B1A1A]/20"
                      >
                        {time}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <button 
        onClick={handleSaveSlots} 
        className="px-8 py-2.5 bg-[#8B1A1A] text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#721515] transition-all shadow-sm"
      >
        Confirm & Save to Database
      </button>
    </div>
  );
})()}
      {message && <p className={`text-xs mt-4 font-medium ${message.includes('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{message}</p>}
    </div>
  );
}

export default AddExam;