import { useContext } from 'react';
import { PeriodCtx } from './PeriodContext.jsx';

export function usePeriod() {
    const ctx = useContext(PeriodCtx);
    if (!ctx) throw new Error('usePeriod() must be used inside <PeriodProvider>.');
    return ctx;
}
