import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
//  Select — themed native <select>.
//
//  We deliberately don't custom-render the dropdown — native selects on every
//  platform handle keyboard / screen reader / mobile far better than any custom
//  React widget. We just style the trigger and overlay a chevron icon.
//
//  Pass `options` as `[{value, label, disabled?}]`, OR just pass <option>
//  children directly.
// ─────────────────────────────────────────────────────────────────────────────

const Select = forwardRef(function Select(
  { label, error, hint, options, id, className = '', children, ...rest },
  ref
) {
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
        'relative flex items-center h-10 rounded-md',
        'bg-surface border',
        error ? 'border-danger' : 'border-border focus-within:border-brand-500',
        'transition-colors duration-fast ease-out',
        'focus-within:ring-2 focus-within:ring-brand-500/20',
      ].join(' ')}>
        <select
          ref={ref}
          id={autoId}
          aria-invalid={!!error}
          className={[
            'flex-1 bg-transparent text-sm text-text px-3 pr-8 h-full',
            'outline-none border-0 appearance-none cursor-pointer',
            className,
          ].join(' ')}
          {...rest}
        >
          {options
            ? options.map(o => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown size={16} className="absolute right-3 text-textFaint pointer-events-none" />
      </div>
      {error
        ? <p className="text-xs text-danger">{error}</p>
        : hint
          ? <p className="text-xs text-textFaint">{hint}</p>
          : null}
    </div>
  );
});

export default Select;
