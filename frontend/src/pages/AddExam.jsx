import React, { useState, useEffect } from 'react';
import API from '../api/api.js';
import PeriodScopedEmptyState from '../components/PeriodScopedEmptyState.jsx';

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
      // Fire-and-forget — the success message uses the local generatedSlots count,
      // so we don't need to capture the response body. Errors fall through to catch.
      await API.post('/exams/add-batch-slots', { slots: generatedSlots });
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
        <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Add Exam Slot</h2>
        <p className="text-sm text-textMuted mt-1">Define date ranges and time slots to generate the exam schedule</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          GENERATE FORM (existing — unchanged)
          ═══════════════════════════════════════════════════════════════════════ */}
      <form onSubmit={handleGeneratePreview} className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">

        {/* Step 1: Date Range */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">1</div>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider">Select Date Range</h3>
          </div>

          <div className="ml-10">
            <div className="grid grid-cols-2 gap-6 mb-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">Start Date</label>
                <input 
                  type="date" 
                  className="w-full text-sm p-2.5 bg-surface2 border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all shadow-sm"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">End Date</label>
                <input 
                  type="date" 
                  className="w-full text-sm p-2.5 bg-surface2 border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all shadow-sm"
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
                    className="accent-brand-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="skipSaturdays" className="text-sm text-textMuted cursor-pointer">Skip Saturdays</label>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="skipSundays"
                    checked={skipSundays}
                    onChange={(e) => setSkipSundays(e.target.checked)}
                    className="accent-brand-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="skipSundays" className="text-sm text-textMuted cursor-pointer">Skip Sundays</label>
                </div>
              </div>
              
              <div className="space-y-1.5 max-w-sm">
                <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">Skip Particular Dates</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    className="flex-1 text-sm p-2 bg-surface2 border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all shadow-sm"
                    value={particularDate}
                    onChange={(e) => setParticularDate(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={handleAddSkipDate}
                    className="px-3 py-2 bg-surface2 hover:bg-textFaint text-text text-xs font-bold uppercase rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
                {skipDates.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {skipDates.map((date, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface2 text-textMuted text-xs font-semibold rounded-md border border-border shadow-sm">
                        {date}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveSkipDate(date)}
                          className="text-textFaint hover:text-danger transition-colors"
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
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider">Define Daily Time Slots</h3>
          </div>

          <div className="ml-10">
            {dailySlots.map((slot, index) => (
              <div key={index} className="grid grid-cols-12 gap-4 items-end mb-3">
                <div className="col-span-5 space-y-1.5">
                  <label className="block text-xs font-semibold text-textFaint uppercase tracking-wider">Start Time</label>
                  <input 
                    type="time" 
                    className="w-full text-sm p-2.5 bg-surface2 border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all shadow-sm"
                    value={slot.startTime}
                    onChange={(e) => handleTimeChange(index, 'startTime', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-5 space-y-1.5">
                  <label className="block text-xs font-semibold text-textFaint uppercase tracking-wider">End Time</label>
                  <input 
                    type="time" 
                    className="w-full text-sm p-2.5 bg-surface2 border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all shadow-sm"
                    value={slot.endTime}
                    onChange={(e) => handleTimeChange(index, 'endTime', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 pb-1">
                  {dailySlots.length > 1 && (
                    <button type="button" onClick={() => handleRemoveTimeSlot(index)} className="text-xs font-semibold text-danger hover:text-danger transition-colors">Remove</button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={handleAddTimeSlot} className="text-xs font-bold text-brand-500 hover:text-brand-700 hover:underline mt-1 transition-colors">
              + Add Another Daily Slot
            </button>
          </div>
        </div>

        {/* Generate Button */}
        <div className="p-6">
          <button type="submit" className="w-full py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
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
              <h3 className="text-sm font-bold text-text uppercase tracking-wider">
                Preview: <span className="text-brand-500">{generatedSlots.length}</span> Slots Generated
              </h3>
            </div>

            {/* Preview Table */}
            <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden mb-5">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface2 text-xs uppercase text-textMuted sticky top-0 border-b border-border shadow-sm">
                    <tr>
                      <th className="p-3 w-1/3 font-bold tracking-wider">Date & Day</th>
                      <th className="p-3 w-2/3 font-bold tracking-wider">Time Slots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedSlots).map(([date, data], idx) => (
                      <tr key={idx} className="border-b border-border hover:bg-brand-500/5 transition-colors">
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-text">{date}</span>
                            <span className="text-xs text-textFaint mt-0.5">{data.day}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {data.times.map((time, tIdx) => (
                              <span 
                                key={tIdx} 
                                className="px-3 py-1 bg-brand-500/5 text-brand-500 text-xs font-semibold rounded-md border border-brand-500/20"
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
              className="px-8 py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
            >
              Confirm & Save to Database
            </button>
          </div>
        );
      })()}
      {/* Message */}
      {message && (
        <div className={`mt-6 p-4 rounded-lg text-xs font-semibold border ${message.includes('Error') ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30'}`}>
          {message}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          EXISTING SLOTS TABLE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden mt-8 mb-8">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-text flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {existingSlots.length}
            </div>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider">Existing Exam Slots</h3>
          </div>
          <button onClick={fetchExistingSlots} className="text-xs text-textMuted hover:text-text transition-colors cursor-pointer bg-transparent border-none">
            ↻ Refresh
          </button>
        </div>

        {loadingSlots ? (
          <div className="p-10 text-center text-textFaint text-sm">Loading slots…</div>
        ) : existingSlots.length === 0 ? (
          <div className="p-4">
            <PeriodScopedEmptyState noun="exam slots">
              Other exam periods may already contain slots.
              You can also use the form below to add slots for the active period.
            </PeriodScopedEmptyState>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface2 text-xs uppercase text-textMuted sticky top-0 border-b border-border shadow-sm">
                <tr>
                  <th className="p-3 font-bold tracking-wider">Date</th>
                  <th className="p-3 font-bold tracking-wider">Day</th>
                  <th className="p-3 font-bold tracking-wider">Start</th>
                  <th className="p-3 font-bold tracking-wider">End</th>
                  <th className="p-3 font-bold tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {existingSlots.map((slot) => (
                  <tr key={slot.id} className={`border-b border-border transition-colors ${editingSlot === slot.id ? 'bg-warning/10' : 'hover:bg-brand-500/5'}`}>
                    {editingSlot === slot.id ? (
                      /* ── Inline Edit Mode ── */
                      <>
                        <td className="p-2">
                          <input
                            type="date"
                            value={editForm.exam_date}
                            onChange={e => handleEditDateChange(e.target.value)}
                            className="w-full text-sm p-1.5 bg-surface border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 shadow-sm"
                          />
                        </td>
                        <td className="p-2">
                          <span className="text-sm text-textMuted">{editForm.exam_day}</span>
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            value={editForm.start_time}
                            onChange={e => setEditForm({ ...editForm, start_time: e.target.value })}
                            className="w-full text-sm p-1.5 bg-surface border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 shadow-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="time"
                            value={editForm.end_time}
                            onChange={e => setEditForm({ ...editForm, end_time: e.target.value })}
                            className="w-full text-sm p-1.5 bg-surface border border-borderStrong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 shadow-sm"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={handleEditSave} className="px-3 py-1 bg-brand-500 text-white text-xs font-bold rounded-md hover:bg-brand-600 transition-colors cursor-pointer">Save</button>
                            <button onClick={cancelEdit} className="px-3 py-1 bg-surface2 text-text text-xs font-bold rounded-md hover:bg-textFaint transition-colors cursor-pointer">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      /* ── Normal Display Mode ── */
                      <>
                        <td className="p-3">
                          <span className="font-semibold text-text">{formatDate(slot.exam_date)}</span>
                        </td>
                        <td className="p-3 text-textMuted">{slot.exam_day}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-brand-500/5 text-brand-500 text-xs font-semibold rounded-md border border-brand-500/20">
                            {formatTime(slot.start_time)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-brand-500/5 text-brand-500 text-xs font-semibold rounded-md border border-brand-500/20">
                            {formatTime(slot.end_time)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {deletingId === slot.id ? (
                            /* Confirm Delete */
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-xs text-danger font-semibold">Delete?</span>
                              <button onClick={() => handleDelete(slot.id)} className="px-2 py-0.5 bg-danger text-white text-xs font-bold rounded hover:bg-danger/90 transition-colors cursor-pointer">Yes</button>
                              <button onClick={() => setDeletingId(null)} className="px-2 py-0.5 bg-surface2 text-text text-xs font-bold rounded hover:bg-textFaint transition-colors cursor-pointer">No</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => startEdit(slot)} className="px-2.5 py-1 bg-surface text-brand-500 text-xs font-bold rounded-md border border-brand-500/30 hover:bg-brand-500/5 hover:border-brand-500 transition-all cursor-pointer">
                                Edit
                              </button>
                              <button onClick={() => setDeletingId(slot.id)} className="px-2.5 py-1 bg-surface text-danger text-xs font-bold rounded-md border border-danger/30 hover:bg-danger/10 hover:border-danger/50 transition-all cursor-pointer">
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
        <div className="rounded-lg overflow-hidden mt-8 bg-danger/10 border border-danger/30">
          <div className="p-5">
            <h3 className="text-sm font-bold text-danger uppercase tracking-wider mb-1">Danger Zone</h3>
            <p className="text-xs text-danger mb-3 leading-relaxed">
              Delete all existing exam slots from the database. <strong>This cannot be undone.</strong>
            </p>
            {!confirmDeleteAll ? (
              <button onClick={() => setConfirmDeleteAll(true)}
                className="px-5 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 bg-danger hover:bg-danger/90 cursor-pointer">
                Delete All Exam Slots
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-md bg-danger/20 border border-danger/40">
                <span className="text-xs font-semibold text-danger">Delete all {existingSlots.length} slots?</span>
                <button onClick={handleDeleteAll} disabled={deleteAllLoading}
                  className={`px-4 py-1.5 text-white text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${deleteAllLoading ? 'bg-danger/20 cursor-not-allowed' : 'bg-danger hover:bg-danger cursor-pointer'}`}>
                  {deleteAllLoading ? 'Deleting...' : 'Yes, Delete All'}
                </button>
                <button onClick={() => setConfirmDeleteAll(false)} disabled={deleteAllLoading}
                  className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer bg-surface text-textMuted border border-border shadow-sm">
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