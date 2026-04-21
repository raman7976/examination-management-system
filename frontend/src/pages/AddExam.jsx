import React, { useState, useEffect } from 'react';
import API from '../api/api.js';

function AddExam() {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [skipSaturdays, setSkipSaturdays] = useState(true);
  const [skipSundays, setSkipSundays] = useState(true);
  const [skipDates, setSkipDates] = useState([]);
  const [particularDate, setParticularDate] = useState('');
  const [dailySlots, setDailySlots] = useState([{ startTime: '', endTime: '' }]);

  const handleAddSkipDate = () => {
    if (particularDate && !skipDates.includes(particularDate)) {
      setSkipDates([...skipDates, particularDate]);
      setParticularDate('');
    }
  };

  const handleRemoveSkipDate = (dateToRemove) => {
    setSkipDates(skipDates.filter(d => d !== dateToRemove));
  };
  const [generatedSlots, setGeneratedSlots] = useState([]);
  const [message, setMessage] = useState('');

  // ── Existing slots from DB ──
  const [existingSlots, setExistingSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [editingSlot, setEditingSlot] = useState(null);    // slot id being edited
  const [editForm, setEditForm] = useState({ exam_date: '', exam_day: '', start_time: '', end_time: '' });
  const [deletingId, setDeletingId] = useState(null);      // slot id being deleted (for confirm)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);

  // ── Fetch existing slots on mount ──
  const fetchExistingSlots = async () => {
    try {
      setLoadingSlots(true);
      const response = await API.get('/exams/available-slots');
      setExistingSlots(response.data);
    } catch (err) {
      console.error("Failed to fetch slots", err);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    fetchExistingSlots();
  }, []);

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
      const dateString = current.toISOString().split('T')[0];
      
      // Skip specific days and dates
      if (skipSundays && dayOfWeek === 0) {
        current.setDate(current.getDate() + 1);
        continue;
      }
      if (skipSaturdays && dayOfWeek === 6) {
        current.setDate(current.getDate() + 1);
        continue;
      }
      if (skipDates.includes(dateString)) {
        current.setDate(current.getDate() + 1);
        continue;
      }

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
      const response = await API.post('/exams/add-batch-slots', { slots: generatedSlots });
      setMessage(`Success: ${generatedSlots.length} slots created!`);
      setGeneratedSlots([]); // Clear preview on success
      setDateRange({ start: '', end: '' });
      fetchExistingSlots();  // Refresh the table
    } catch (err) {
      setMessage("Error: " + (err.response?.data?.message || "Server error"));
    }
  };

  // ── Edit handlers ──
  const startEdit = (slot) => {
    setEditingSlot(slot.id);
    setEditForm({
      exam_date: slot.exam_date ? slot.exam_date.split('T')[0] : '',
      exam_day: slot.exam_day,
      start_time: slot.start_time?.slice(0, 5) || '',
      end_time: slot.end_time?.slice(0, 5) || '',
    });
  };

  const cancelEdit = () => {
    setEditingSlot(null);
    setEditForm({ exam_date: '', exam_day: '', start_time: '', end_time: '' });
  };

  const handleEditSave = async () => {
    try {
      await API.put(`/exams/slots/${editingSlot}`, editForm);
      setMessage('Success: Slot updated successfully!');
      cancelEdit();
      fetchExistingSlots();
    } catch (err) {
      setMessage("Error: " + (err.response?.data?.message || "Failed to update slot"));
    }
  };

  // Auto-compute day name when edit date changes
  const handleEditDateChange = (value) => {
    const d = new Date(value);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    setEditForm({ ...editForm, exam_date: value, exam_day: dayName });
  };

  // ── Delete handler ──
  const handleDelete = async (id) => {
    try {
      await API.delete(`/exams/slots/${id}`);
      setMessage('Success: Slot deleted.');
      setDeletingId(null);
      fetchExistingSlots();
    } catch (err) {
      setMessage("Error: " + (err.response?.data?.message || "Failed to delete slot"));
    }
  };

  // ── Helpers ──
  const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const formatTime = t => t ? t.slice(0, 5) : '';

  // ── Delete All handler ──
  const handleDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      const res = await API.delete('/exams/slots');
      setMessage(res.data.message || 'All slots deleted.');
      fetchExistingSlots();
    } catch (err) {
      setMessage('Error: ' + (err.response?.data?.message || 'Failed to delete all slots'));
    } finally {
      setDeleteAllLoading(false);
      setConfirmDeleteAll(false);
    }
  };

  return (
    <div>

      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">Add Exam Slot</h2>
        <p className="text-sm text-slate-500 mt-1">Define date ranges and time slots to generate the exam schedule</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          GENERATE FORM (existing — unchanged)
          ═══════════════════════════════════════════════════════════════════════ */}
      <form onSubmit={handleGeneratePreview} className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">

        {/* Step 1: Date Range */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">1</div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Select Date Range</h3>
          </div>

          <div className="ml-10">
            <div className="grid grid-cols-2 gap-6 mb-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</label>
                <input 
                  type="date" 
                  className="w-full text-sm p-2.5 bg-slate-50/50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date</label>
                <input 
                  type="date" 
                  className="w-full text-sm p-2.5 bg-slate-50/50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="skipSaturdays"
                    checked={skipSaturdays}
                    onChange={(e) => setSkipSaturdays(e.target.checked)}
                    className="accent-[#8B1A1A] w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="skipSaturdays" className="text-sm text-slate-600 cursor-pointer">Skip Saturdays</label>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="skipSundays"
                    checked={skipSundays}
                    onChange={(e) => setSkipSundays(e.target.checked)}
                    className="accent-[#8B1A1A] w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="skipSundays" className="text-sm text-slate-600 cursor-pointer">Skip Sundays</label>
                </div>
              </div>
              
              <div className="space-y-1.5 max-w-sm">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Skip Particular Dates</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    className="flex-1 text-sm p-2 bg-slate-50/50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                    value={particularDate}
                    onChange={(e) => setParticularDate(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={handleAddSkipDate}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
                {skipDates.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {skipDates.map((date, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md border border-slate-200">
                        {date}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveSkipDate(date)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Daily Time Slots */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Define Daily Time Slots</h3>
          </div>

          <div className="ml-10">
            {dailySlots.map((slot, index) => (
              <div key={index} className="grid grid-cols-12 gap-4 items-end mb-3">
                <div className="col-span-5 space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Start Time</label>
                  <input 
                    type="time" 
                    className="w-full text-sm p-2.5 bg-slate-50/50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                    value={slot.startTime}
                    onChange={(e) => handleTimeChange(index, 'startTime', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-5 space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">End Time</label>
                  <input 
                    type="time" 
                    className="w-full text-sm p-2.5 bg-slate-50/50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A] transition-all"
                    value={slot.endTime}
                    onChange={(e) => handleTimeChange(index, 'endTime', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 pb-1">
                  {dailySlots.length > 1 && (
                    <button type="button" onClick={() => handleRemoveTimeSlot(index)} className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors">Remove</button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={handleAddTimeSlot} className="text-xs font-bold text-[#8B1A1A] hover:text-[#5e1111] hover:underline mt-1 transition-colors">
              + Add Another Daily Slot
            </button>
          </div>
        </div>

        {/* Generate Button */}
        <div className="p-6">
          <button type="submit" className="w-full py-3 bg-[#8B1A1A] hover:bg-[#721515] active:bg-[#5e1111] text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
            Generate Preview Grid
          </button>
        </div>
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
          <div className="mt-8">

            {/* Preview Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Preview: <span className="text-[#8B1A1A]">{generatedSlots.length}</span> Slots Generated
              </h3>
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden mb-5">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-1/3 font-bold tracking-wider">Date & Day</th>
                      <th className="p-3 w-2/3 font-bold tracking-wider">Time Slots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedSlots).map(([date, data], idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-[#fef2f2] transition-colors">
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-700">{date}</span>
                            <span className="text-xs text-slate-400 mt-0.5">{data.day}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {data.times.map((time, tIdx) => (
                              <span 
                                key={tIdx} 
                                className="px-3 py-1 bg-[#fef2f2] text-[#8B1A1A] text-xs font-semibold rounded-md border border-[#8B1A1A]/20"
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
            </div>
            
            <button 
              onClick={handleSaveSlots} 
              className="px-8 py-3 bg-[#8B1A1A] hover:bg-[#721515] active:bg-[#5e1111] text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
            >
              Confirm & Save to Database
            </button>
          </div>
        );
      })()}
      {/* Message */}
      {message && (
        <div className={`mt-6 p-4 rounded-lg text-xs font-semibold border ${message.includes('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          EXISTING SLOTS TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden mt-8 mb-8">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {existingSlots.length}
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Existing Exam Slots</h3>
          </div>
          <button onClick={fetchExistingSlots} className="text-xs text-slate-500 hover:text-slate-700 transition-colors cursor-pointer bg-transparent border-none">
            ↻ Refresh
          </button>
        </div>

        {loadingSlots ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading slots…</div>
        ) : existingSlots.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No exam slots found. Use the form below to generate some.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-bold tracking-wider">Date</th>
                  <th className="p-3 font-bold tracking-wider">Day</th>
                  <th className="p-3 font-bold tracking-wider">Start</th>
                  <th className="p-3 font-bold tracking-wider">End</th>
                  <th className="p-3 font-bold tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {existingSlots.map((slot, idx) => (
                  <tr key={slot.id} className={`border-b border-slate-100 transition-colors ${editingSlot === slot.id ? 'bg-amber-50' : 'hover:bg-[#fef2f2]'}`}>
                    {editingSlot === slot.id ? (
                      /* ── Inline Edit Mode ── */
                      <>
                        <td className="p-2">
                          <input
                            type="date"
                            value={editForm.exam_date}
                            onChange={e => handleEditDateChange(e.target.value)}
                            className="w-full text-sm p-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                          />
                        </td>
                        <td className="p-2">
                          <span className="text-sm text-slate-600">{editForm.exam_day}</span>
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            value={editForm.start_time}
                            onChange={e => setEditForm({ ...editForm, start_time: e.target.value })}
                            className="w-full text-sm p-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            value={editForm.end_time}
                            onChange={e => setEditForm({ ...editForm, end_time: e.target.value })}
                            className="w-full text-sm p-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30 focus:border-[#8B1A1A]"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={handleEditSave} className="px-3 py-1 bg-[#8B1A1A] text-white text-xs font-bold rounded-md hover:bg-[#721515] transition-colors cursor-pointer">Save</button>
                            <button onClick={cancelEdit} className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-md hover:bg-slate-300 transition-colors cursor-pointer">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      /* ── Normal Display Mode ── */
                      <>
                        <td className="p-3">
                          <span className="font-semibold text-slate-700">{formatDate(slot.exam_date)}</span>
                        </td>
                        <td className="p-3 text-slate-500">{slot.exam_day}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-[#fef2f2] text-[#8B1A1A] text-xs font-semibold rounded-md border border-[#8B1A1A]/20">
                            {formatTime(slot.start_time)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-[#fef2f2] text-[#8B1A1A] text-xs font-semibold rounded-md border border-[#8B1A1A]/20">
                            {formatTime(slot.end_time)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {deletingId === slot.id ? (
                            /* Confirm Delete */
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-xs text-red-600 font-semibold">Delete?</span>
                              <button onClick={() => handleDelete(slot.id)} className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 transition-colors cursor-pointer">Yes</button>
                              <button onClick={() => setDeletingId(null)} className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 transition-colors cursor-pointer">No</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => startEdit(slot)} className="px-2.5 py-1 bg-white text-[#8B1A1A] text-xs font-bold rounded-md border border-[#8B1A1A]/30 hover:bg-[#fef2f2] hover:border-[#8B1A1A] transition-all cursor-pointer">
                                Edit
                              </button>
                              <button onClick={() => setDeletingId(slot.id)} className="px-2.5 py-1 bg-white text-red-600 text-xs font-bold rounded-md border border-red-200 hover:bg-red-50 hover:border-red-400 transition-all cursor-pointer">
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          DANGER ZONE — Delete All Slots
          ═══════════════════════════════════════════════════════════════════════ */}
      {existingSlots.length > 0 && (
        <div className="rounded-lg overflow-hidden mt-8" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div className="p-5">
            <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-1">Danger Zone</h3>
            <p className="text-xs text-red-600 mb-3 leading-relaxed">
              Delete all existing exam slots from the database. <strong>This cannot be undone.</strong>
            </p>
            {!confirmDeleteAll ? (
              <button onClick={() => setConfirmDeleteAll(true)}
                className="px-5 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 bg-red-600 hover:bg-red-700 cursor-pointer">
                Delete All Exam Slots
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-md" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
                <span className="text-xs font-semibold text-red-800">Delete all {existingSlots.length} slots?</span>
                <button onClick={handleDeleteAll} disabled={deleteAllLoading}
                  className={`px-4 py-1.5 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${deleteAllLoading ? 'bg-red-300 cursor-not-allowed' : 'bg-red-700 hover:bg-red-800 cursor-pointer'}`}>
                  {deleteAllLoading ? 'Deleting...' : 'Yes, Delete All'}
                </button>
                <button onClick={() => setConfirmDeleteAll(false)} disabled={deleteAllLoading}
                  className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer" style={{ background: 'white', color: '#64748b', border: '1px solid #e2e8f0' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AddExam;