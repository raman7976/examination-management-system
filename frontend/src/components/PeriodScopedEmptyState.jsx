import { useNavigate } from 'react-router-dom';
import { usePeriod } from '../context/usePeriod.js';

// ─────────────────────────────────────────────────────────────────────────────
//  PeriodScopedEmptyState
//
//  Drop-in replacement for the bland "no data" branches on period-scoped admin
//  tabs (Add Exam Slot, Smart Scheduling, Seating Manager, Seating Arrangement,
//  Invigilator Scheduling, PDF Reports).
//
//  The data really is missing for the ACTIVE period — but that's invisible to
//  admins when an empty tab looks identical to a broken one. This block names
//  the active period explicitly and offers a one-click jump to Registration to
//  switch periods.
//
//  Props:
//    noun        — "exam slots", "scheduled exams", "seating plans", …
//    children    — optional extra body text (page-specific hint).
//    hideSwitch  — pass true on the Registration tab itself (it already has the
//                  period switcher inline; the button would be redundant).
// ─────────────────────────────────────────────────────────────────────────────
export default function PeriodScopedEmptyState({ noun = 'data', children, hideSwitch = false }) {
  const { activePeriod } = usePeriod();
  const navigate = useNavigate();

  const periodLabel = activePeriod
    ? `${activePeriod.semester_label} / ${activePeriod.exam_type}`
    : 'the active exam period';

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
           style={{ background: 'rgba(139,26,26,0.06)' }}>
        <svg className="w-6 h-6" style={{ color: '#8B1A1A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">
        No {noun} in <span className="text-[#8B1A1A]">{periodLabel}</span>
      </h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
        {children || 'Other exam periods may contain data.'}
        {!hideSwitch && <> Switch the active period in <b className="text-slate-700">Registration</b>.</>}
      </p>
      {!hideSwitch && (
        <button
          onClick={() => navigate('/dashboard/registration')}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#8B1A1A] text-xs font-bold uppercase tracking-wider rounded-md border border-[#8B1A1A]/30 hover:bg-[#fef2f2] hover:border-[#8B1A1A] transition-all cursor-pointer"
        >
          Open Registration
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      )}
    </div>
  );
}
