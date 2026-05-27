import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getExamPeriods, activateExamPeriod, createSemester } from '../api/api.js';

// eslint-disable-next-line react-refresh/only-export-components
export const PeriodCtx = createContext(null);

// ─────────────────────────────────────────────────────────────────────────────
//  PeriodContext — single source of truth for the active exam period.
//  Every page that touches period-scoped data consumes this hook and re-fetches
//  whenever `periodVersion` increments.
//
//  Drafts protection: pages that have unsaved local edits register a check
//  function via `registerDirtyCheck`. Before switching periods we call every
//  registered checker. If any returns truthy, we prompt the user before
//  proceeding. Switching the period then unregisters stale checks via the
//  cleanup the page returned.
// ─────────────────────────────────────────────────────────────────────────────

export function PeriodProvider({ children }) {
    const [periods, setPeriods] = useState([]);
    const [periodsLoaded, setPeriodsLoaded] = useState(false);
    const [periodsError, setPeriodsError] = useState(null);
    const [periodVersion, setPeriodVersion] = useState(0);

    // Registered dirty checks: each is a function () => string | false. If a
    // function returns a non-empty string we treat the page as dirty and use
    // the string as the confirm prompt.
    const dirtyChecksRef = useRef(new Set());

    const registerDirtyCheck = useCallback((fn) => {
        dirtyChecksRef.current.add(fn);
        return () => dirtyChecksRef.current.delete(fn);
    }, []);

    const confirmIfDirty = useCallback(() => {
        for (const fn of dirtyChecksRef.current) {
            const reason = fn();
            if (reason) {
                const ok = window.confirm(reason);
                if (!ok) return false;
            }
        }
        return true;
    }, []);

    const loadPeriods = useCallback(async () => {
        try {
            const res = await getExamPeriods();
            setPeriods(res.data.periods || []);
            setPeriodsError(null);
            setPeriodsLoaded(true);
        } catch (err) {
            setPeriodsError(err.response?.data?.message || 'Failed to load exam periods.');
            setPeriodsLoaded(true);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadPeriods(); }, [loadPeriods]);

    const activePeriod = useMemo(() => periods.find(p => p.is_active) || null, [periods]);
    const semesterLabels = useMemo(() => Array.from(new Set(periods.map(p => p.semester_label))), [periods]);
    const activeSemester = activePeriod?.semester_label || semesterLabels[0] || '';
    const periodsInSemester = useMemo(
        () => periods.filter(p => p.semester_label === activeSemester),
        [periods, activeSemester]
    );

    const switchToPeriod = useCallback(async (targetId) => {
        if (!confirmIfDirty()) return false;
        try {
            await activateExamPeriod(targetId);
            await loadPeriods();
            setPeriodVersion(v => v + 1);
            return true;
        } catch (err) {
            console.error('switchToPeriod failed', err);
            return false;
        }
    }, [confirmIfDirty, loadPeriods]);

    const switchToSemester = useCallback(async (label) => {
        const candidates = periods.filter(p => p.semester_label === label);
        if (candidates.length === 0) return false;
        const target = candidates.find(p => p.exam_type === 'midterm') || candidates[0];
        return switchToPeriod(target.id);
    }, [periods, switchToPeriod]);

    const switchToExamType = useCallback(async (examType) => {
        const target = periods.find(p => p.semester_label === activeSemester && p.exam_type === examType);
        if (!target) return false;
        return switchToPeriod(target.id);
    }, [periods, activeSemester, switchToPeriod]);

    const createNewSemester = useCallback(async (label) => {
        const res = await createSemester({ semester_label: label, activate_midterm: true });
        await loadPeriods();
        setPeriodVersion(v => v + 1);
        return res.data;
    }, [loadPeriods]);

    const value = {
        periods,
        periodsLoaded,
        periodsError,
        periodVersion,
        activePeriod,
        semesterLabels,
        activeSemester,
        periodsInSemester,
        loadPeriods,
        switchToSemester,
        switchToExamType,
        createNewSemester,
        registerDirtyCheck,
    };

    return <PeriodCtx.Provider value={value}>{children}</PeriodCtx.Provider>;
}
