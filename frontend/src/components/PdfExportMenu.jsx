import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileDown, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
//  "Download PDF" dropdown.
//    items: [{ key, label, description?, onSelect: async () => void, disabled? }]
//  While an item's onSelect is running the button shows a spinner; a thrown
//  error is handed to onError (pages toast it).
// ─────────────────────────────────────────────────────────────────────────────
export default function PdfExportMenu({
    items,
    label = 'Download PDF',
    disabled = false,
    disabledReason = '',
    onError,
    align = 'right',
}) {
    const [open, setOpen] = useState(false);
    const [busyKey, setBusyKey] = useState(null);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const run = async (item) => {
        setOpen(false);
        setBusyKey(item.key);
        try {
            await item.onSelect();
        } catch (err) {
            onError?.(err);
        } finally {
            setBusyKey(null);
        }
    };

    const isDisabled = disabled || busyKey !== null;

    return (
        <div ref={rootRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                disabled={isDisabled}
                title={disabled ? disabledReason : undefined}
                aria-haspopup="menu"
                aria-expanded={open}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all duration-200 ${
                    isDisabled
                        ? 'border-border text-textFaint cursor-not-allowed'
                        : 'border-brand-500/40 text-brand-500 hover:bg-brand-500/10 cursor-pointer'
                }`}
            >
                {busyKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                {busyKey ? 'Preparing…' : label}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    role="menu"
                    className={`absolute z-40 mt-2 w-72 rounded-xl border border-border bg-surface shadow-xl overflow-hidden ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    {items.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            onClick={() => run(item)}
                            className="w-full text-left px-4 py-2.5 hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-b border-border last:border-b-0"
                        >
                            <div className="text-xs font-bold text-text">{item.label}</div>
                            {item.description && <div className="text-[11px] text-textFaint mt-0.5">{item.description}</div>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
