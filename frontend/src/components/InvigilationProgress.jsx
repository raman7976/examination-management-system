import { Check, TriangleAlert, ArrowRight, ArrowLeftRight, Archive, CircleCheck } from 'lucide-react';
import PdfExportMenu from './PdfExportMenu.jsx';

// ─────────────────────────────────────────────────────────────────────────────
//  Workflow tracker for the Invigilator Scheduling page.
//
//  Four steps (see utils/invigilationProgress.js) shown as a strip that stays
//  visible on every tab. Below it, either the single next thing to do, or —
//  once the schedule is complete — a confirmation with the follow-up actions
//  (download PDFs, review swap requests, archive).
//
//  Props:
//    derived      result of deriveInvigilationSteps (null while loading)
//    progress     raw /progress payload (for counts in the banner)
//    error        load error message, if any
//    onAction     (action) => void   — { tab } or { route }
//    onRetry      () => void
//    pdfItems     PdfExportMenu items for the completion banner
//    onPdfError   (err) => void
// ─────────────────────────────────────────────────────────────────────────────

const STATE_STYLE = {
    done:      { dot: 'bg-success text-white', title: 'text-text', ring: 'border-success/30' },
    attention: { dot: 'bg-warning text-white', title: 'text-warning', ring: 'border-warning/40 bg-warning/5' },
    todo:      { dot: 'bg-surface2 text-textMuted border border-border', title: 'text-textMuted', ring: 'border-border' },
};

function StepDot({ state, index }) {
    const s = STATE_STYLE[state];
    return (
        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${s.dot}`}>
            {state === 'done' ? <Check className="w-3.5 h-3.5" strokeWidth={3} />
                : state === 'attention' ? <TriangleAlert className="w-3.5 h-3.5" strokeWidth={2.5} />
                : index + 1}
        </span>
    );
}

export default function InvigilationProgress({ derived, progress, error, onAction, onRetry, pdfItems, onPdfError }) {
    if (error) {
        return (
            <div className="mb-5 bg-surface rounded-xl border border-danger/30 px-4 py-3 text-xs text-danger flex items-center justify-between gap-3">
                <span>Couldn&apos;t load the workflow progress: {error}</span>
                <button onClick={onRetry} className="font-bold uppercase tracking-wider hover:underline cursor-pointer">Retry</button>
            </div>
        );
    }
    if (!derived) {
        return <div className="mb-5 h-[118px] rounded-xl border border-border bg-surface animate-pulse" aria-label="Loading progress" />;
    }

    const { steps, complete, current } = derived;
    const doneCount = steps.filter(s => s.state === 'done').length;
    const pendingSwaps = progress?.swaps?.pending_admin || 0;

    return (
        <section aria-label="Invigilation workflow progress" className="mb-5 bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-textMuted">Workflow progress</h3>
                {complete ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                        <CircleCheck className="w-3.5 h-3.5" /> Schedule complete
                    </span>
                ) : (
                    <span className="text-[11px] font-semibold text-textMuted">{doneCount} of {steps.length} steps done</span>
                )}
            </div>

            <ol className="px-4 pb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map((step, i) => {
                    const s = STATE_STYLE[step.state];
                    const isCurrent = !complete && current?.key === step.key;
                    const Tag = step.action ? 'button' : 'div';
                    return (
                        <li key={step.key}>
                            <Tag
                                {...(step.action ? { type: 'button', onClick: () => onAction(step.action), title: step.action.label } : {})}
                                aria-current={isCurrent ? 'step' : undefined}
                                className={`w-full h-full text-left flex gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${s.ring} ${
                                    isCurrent ? 'ring-2 ring-brand-500/30' : ''} ${step.action ? 'hover:bg-surface2 cursor-pointer' : ''}`}
                            >
                                <StepDot state={step.state} index={i} />
                                <span className="min-w-0">
                                    <span className={`block text-xs font-bold ${s.title}`}>{step.title}</span>
                                    <span className="block text-[11px] text-textMuted leading-snug mt-0.5">{step.detail}</span>
                                </span>
                            </Tag>
                        </li>
                    );
                })}
            </ol>

            {complete ? (
                <div className="border-t border-success/20 bg-success/5 px-4 py-3">
                    <div className="flex items-start gap-3 flex-wrap justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-success">Invigilation schedule is complete</div>
                            <p className="text-[11px] text-textMuted mt-0.5">
                                {progress.schedule.duties} duties · {progress.seating.rooms} rooms · {progress.schedule.invigilators} invigilators.
                                {' '}Invigilators can already see their duties in their portal. Next: share the duty chart and letters.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <PdfExportMenu items={pdfItems} onError={onPdfError} />
                            <button
                                type="button"
                                onClick={() => onAction({ route: '/dashboard/swap-approval' })}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border cursor-pointer ${
                                    pendingSwaps > 0
                                        ? 'border-warning/50 text-warning bg-warning/10 hover:bg-warning/20'
                                        : 'border-border text-textMuted hover:bg-surface2'
                                }`}
                            >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                {pendingSwaps > 0 ? `${pendingSwaps} swap request${pendingSwaps === 1 ? '' : 's'} to review` : 'Swap requests'}
                            </button>
                            <button
                                type="button"
                                onClick={() => onAction({ route: '/dashboard/past-invigilation' })}
                                title="After the exams, save this schedule as a permanent record"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-border text-textMuted hover:bg-surface2 cursor-pointer"
                            >
                                <Archive className="w-3.5 h-3.5" /> Archive
                            </button>
                        </div>
                    </div>
                </div>
            ) : current && (
                <div className="border-t border-border bg-surface2/50 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-text min-w-0">
                        <span className="font-bold text-brand-500">Next step: </span>
                        <span className="font-semibold">{current.next || current.title}.</span>{' '}
                        <span className="text-textMuted">{current.detail}</span>
                    </p>
                    {current.action && (
                        <button
                            type="button"
                            onClick={() => onAction(current.action)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-brand-500 text-white hover:bg-brand-600 cursor-pointer"
                        >
                            {current.action.label} <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
