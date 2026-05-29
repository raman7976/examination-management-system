import Spinner from './Spinner.jsx';

// ─────────────────────────────────────────────────────────────────────────────
//  Button — the only button you should reach for.
//
//  Variants:
//   • primary   — filled brand maroon. Use for the main action on a screen.
//   • secondary — subtle surface fill. Use for less-important actions.
//   • ghost     — text only with hover background. Use in toolbars, tertiary.
//   • danger    — red. Use for destructive actions.
//   • outline   — bordered, brand-coloured text. Use as primary on quiet bg.
//
//  Sizes: sm | md | lg.
//
//  `loading=true` swaps an inline spinner in front of the label and disables
//  the button. The label width stays roughly stable so layouts don't jump.
//
//  `iconLeft` / `iconRight` accept lucide-react icons (or any 16-px SVG).
// ─────────────────────────────────────────────────────────────────────────────

const SIZE = {
  sm: 'h-8  px-3   text-xs   gap-1.5 rounded-md',
  md: 'h-10 px-4   text-sm   gap-2   rounded-md',
  lg: 'h-11 px-5   text-sm   gap-2   rounded-lg',
};

const VARIANT = {
  primary:
    'bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:scale-[0.98] ' +
    'disabled:bg-brand-500/50 disabled:cursor-not-allowed disabled:hover:bg-brand-500/50',
  secondary:
    'bg-surface text-text border border-border hover:bg-surface2 active:scale-[0.98] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed',
  outline:
    'bg-transparent text-brand-500 border border-brand-500/40 ' +
    'hover:bg-brand-500/10 active:scale-[0.98] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-textMuted hover:bg-surface2 hover:text-text active:scale-[0.98] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'bg-danger text-white shadow-sm hover:opacity-90 active:scale-[0.98] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-semibold',
        'transition-colors duration-fast ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        'select-none whitespace-nowrap',
        SIZE[size] || SIZE.md,
        VARIANT[variant] || VARIANT.primary,
        className,
      ].join(' ')}
      {...rest}
    >
      {loading
        ? <Spinner size={size === 'lg' ? 'sm' : 'xs'} tone={variant === 'primary' || variant === 'danger' ? 'light' : 'brand'} />
        : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}
