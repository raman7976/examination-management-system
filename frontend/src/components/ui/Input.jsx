import { forwardRef, useId } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
//  Input — text-style form fields with consistent focus + error states.
//
//  Forwarded ref so callers can focus() programmatically (e.g. Login on mount).
//
//  Props:
//   • label   — optional. Renders an <label> above with proper htmlFor wiring.
//   • error   — string. If set, ring/border turn danger and the message renders.
//   • hint    — optional helper text shown below when no error.
//   • icon    — optional lucide-react icon node, placed inside the input on left.
//   • Everything else is passed to the native <input>.
// ─────────────────────────────────────────────────────────────────────────────

const Input = forwardRef(function Input(
  { label, error, hint, icon, id, className = '', ...rest },
  ref
) {
  // Stable auto-id when no explicit one is given (so label-for / aria still work).
  // React's useId is stable across renders & SSR-safe; never recompute on each
  // render (that would unfocus the input every keystroke).
  const fallbackId = useId();
  const autoId = id || fallbackId;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={autoId} className="text-[11px] font-semibold uppercase tracking-wider text-textFaint">
          {label}
        </label>
      )}
      <div className={[
        'flex items-center gap-2 px-3 h-10 rounded-md',
        'bg-surface border',
        error ? 'border-danger' : 'border-border focus-within:border-brand-500',
        'transition-colors duration-fast ease-out',
        'focus-within:ring-2 focus-within:ring-brand-500/20',
      ].join(' ')}>
        {icon && <span className="text-textFaint flex-shrink-0">{icon}</span>}
        <input
          ref={ref}
          id={autoId}
          className={[
            'flex-1 bg-transparent text-sm text-text placeholder:text-textFaint',
            'outline-none border-0',
            className,
          ].join(' ')}
          aria-invalid={!!error}
          {...rest}
        />
      </div>
      {error
        ? <p className="text-xs text-danger animate-fadeIn">{error}</p>
        : hint
          ? <p className="text-xs text-textFaint">{hint}</p>
          : null}
    </div>
  );
});

export default Input;
