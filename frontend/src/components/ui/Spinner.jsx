// Branded inline spinner. SVG-only — no Framer Motion dependency, since
// spinners run on `loading` flips and we don't want a frame of unmounted
// state. Stroke uses the brand colour by default; pass tone="light" for
// use inside coloured buttons.

const SIZES = { xs: 12, sm: 14, md: 18, lg: 24 };

export default function Spinner({ size = 'sm', tone = 'brand', className = '' }) {
  const px = SIZES[size] || SIZES.sm;
  const stroke =
    tone === 'light' ? 'stroke-white'
    : tone === 'muted' ? 'stroke-textMuted'
    : 'stroke-brand-500';
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      className={`animate-spin ${stroke} ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 1-9 9" fill="none" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
