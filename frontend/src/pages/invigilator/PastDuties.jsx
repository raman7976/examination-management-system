import { useState, useEffect, useMemo } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { getInvigilationSessions, getInvigilationSessionById, getMyProfile } from '../../api/api.js';
import { gridFromArchive, downloadDutyLetters } from '../../utils/invigilationPdf.js';

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}
function formatDateDisplay(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}
function formatSavedAt(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD Student', lab_staff: 'Lab Staff' };

export default function PastDuties() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [duties, setDuties] = useState([]);
  const [loadingDuties, setLoadingDuties] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getInvigilationSessions();
        setSessions(res.data?.sessions || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSelect = async (session) => {
    if (selectedSession?.id === session.id) {
      setSelectedSession(null);
      setDuties([]);
      return;
    }
    setSelectedSession(session);
    setDuties([]);
    setLoadingDuties(true);
    try {
      const res = await getInvigilationSessionById(session.id);
      if (res.data?.success) setDuties(res.data.duties || []);
    } catch (e) { console.error(e); }
    finally { setLoadingDuties(false); }
  };

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // The archive only returns MY rows to an invigilator, so "all letters" is mine.
  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      let profile = null;
      try {
        const res = await getMyProfile();
        const u = res.data?.user;
        if (u) profile = { full_name: u.full_name, employee_id: u.employee_id, department: u.department, role: u.role };
      } catch { /* the letter still works with the archived details */ }
      await downloadDutyLetters(gridFromArchive(duties), {
        semesterLabel: selectedSession.semester_label,
        examType: selectedSession.exam_type,
        scopeNote: `Archived record: ${selectedSession.session_name}`,
      }, { profile, fileLabel: selectedSession.session_name });
    } catch (e) {
      setDownloadError(e?.message || 'Could not generate the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  // Group duties by date
  const dutiesByDate = useMemo(() => {
    const grouped = {};
    for (const d of duties) {
      const key = d.exam_date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, items: items.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))) }));
  }, [duties]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-8 w-8" style={{ color: '#8B1A1A' }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-[900px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#8B1A1A' }}>Past Duties</h1>
        <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>View your invigilation duties from previous exam sessions</p>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center shadow-sm" style={{ borderColor: '#eee' }}>
          <p className="text-sm" style={{ color: '#94a3b8' }}>No archived invigilation sessions available.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {sessions.map(session => {
            const isActive = selectedSession?.id === session.id;
            return (
              <div key={session.id}>
                <div
                  onClick={() => handleSelect(session)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isActive
                    ? 'shadow-md'
                    : 'hover:shadow-sm'}`}
                  style={{
                    borderColor: isActive ? '#8B1A1A' : '#eee',
                    background: isActive ? 'rgba(139,26,26,0.03)' : 'white',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{session.session_name}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded" style={{ background: '#f1f5f9', color: '#64748b' }}>{session.semester_label}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded" style={{ background: 'rgba(139,26,26,0.08)', color: '#8B1A1A' }}>{session.exam_type}</span>
                        <span className="text-[10px]" style={{ color: '#94a3b8' }}>· {session.total_assignments} duties</span>
                      </div>
                      <p className="text-[10px] mt-1.5" style={{ color: '#94a3b8' }}>Saved: {formatSavedAt(session.saved_at)}</p>
                    </div>
                    <svg
                      className={`w-5 h-5 transition-transform ${isActive ? 'rotate-180' : ''}`}
                      style={{ color: '#94a3b8' }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {isActive && (
                  <div className="mt-2 rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: '#eee', background: 'white' }}>
                    {loadingDuties ? (
                      <div className="flex items-center justify-center py-10">
                        <svg className="animate-spin h-5 w-5 mr-2" style={{ color: '#8B1A1A' }} fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm" style={{ color: '#94a3b8' }}>Loading…</span>
                      </div>
                    ) : duties.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-sm" style={{ color: '#94a3b8' }}>You had no duties in this session.</p>
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
                        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-[11px]" style={{ color: '#94a3b8' }}>
                            {duties.length} dut{duties.length === 1 ? 'y' : 'ies'} in this session
                            {downloadError && <span className="ml-2" style={{ color: '#b91c1c' }}>{downloadError}</span>}
                          </span>
                          <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ borderColor: 'rgba(139,26,26,0.3)', color: '#8B1A1A' }}
                          >
                            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                            {downloading ? 'Preparing…' : 'Download duty letter (PDF)'}
                          </button>
                        </div>
                        {dutiesByDate.map(group => (
                          <div key={group.date} className="px-5 py-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#8B1A1A' }}>
                              {formatDateDisplay(group.date)}
                            </h4>
                            <div className="space-y-2">
                              {group.items.map(duty => (
                                <div
                                  key={duty.id}
                                  className="flex items-center justify-between rounded-lg px-4 py-3 border"
                                  style={{ borderColor: '#f1f5f9', background: '#fafaf9' }}
                                >
                                  <div className="flex items-center gap-4">
                                    <span className="font-mono text-xs px-2 py-0.5 rounded-md border whitespace-nowrap"
                                      style={{ background: 'rgba(139,26,26,0.04)', color: '#8B1A1A', borderColor: 'rgba(139,26,26,0.15)' }}>
                                      {formatTime12(duty.start_time)}–{formatTime12(duty.end_time)}
                                    </span>
                                    <div>
                                      <span className="text-sm font-semibold" style={{ color: '#1e293b' }}>{duty.room_name}</span>
                                      {duty.course_codes && (
                                        <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>{duty.course_codes}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {duty.is_course_instructor ? (
                                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                        style={{ background: 'rgba(139,26,26,0.08)', color: '#8B1A1A' }}>
                                        ★ Instructor
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
