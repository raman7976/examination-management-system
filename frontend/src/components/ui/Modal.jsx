import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { fadeIn, popIn } from '../../design/motion.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Modal — shared dialog overlay.
//
//  Replaces the duplicated pattern from SwapRequestModal and the
//  delete-period modal in Registration. Behaviour:
//   • Backdrop fades in/out (180 ms). Body scale + fade (160 ms).
//   • Click outside (on backdrop) closes UNLESS `dismissible={false}`.
//   • Escape closes (same gate).
//   • Focus is moved to the first focusable child on open. On close the
//     focus is returned to whatever opened the dialog.
//   • <body> overflow is locked so the page doesn't scroll behind the dialog.
//
//  Props:
//   • open         — boolean
//   • onClose      — called when user dismisses
//   • title        — optional header label
//   • size         — 'sm' | 'md' | 'lg' | 'xl'   (default 'md')
//   • dismissible  — default true. False forces an explicit action button.
// ─────────────────────────────────────────────────────────────────────────────

const SIZE_MAX_WIDTH = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  dismissible = true,
  children,
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Escape-to-close + body scroll lock
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (dismissible && e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);

    // Focus the first focusable element inside the dialog after mount
    const t = setTimeout(() => {
      const first = dialogRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          {...fadeIn}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={dismissible ? onClose : undefined}
          role="presentation"
        >
          <motion.div
            key="dialog"
            ref={dialogRef}
            {...popIn}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            onClick={(e) => e.stopPropagation()}
            className={[
              'bg-surface text-text border border-border shadow-lg rounded-2xl w-full',
              SIZE_MAX_WIDTH[size] || SIZE_MAX_WIDTH.md,
              'max-h-[88vh] flex flex-col overflow-hidden',
            ].join(' ')}
          >
            {title && (
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <h2 id="modal-title" className="text-base font-semibold text-text">{title}</h2>
                {dismissible && (
                  <button
                    onClick={onClose}
                    className="text-textFaint hover:text-text hover:bg-surface2 rounded-md p-1 transition-colors duration-fast cursor-pointer"
                    aria-label="Close dialog"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="px-5 py-4 overflow-y-auto flex-1">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
