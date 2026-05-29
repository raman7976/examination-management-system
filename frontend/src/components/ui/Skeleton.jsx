// ─────────────────────────────────────────────────────────────────────────────
//  Skeleton — shimmering placeholder block. Replaces "Loading..." text.
//
//  The shimmer keyframe is declared in tailwind.config.js (`animate-shimmer`).
//  The gradient is a linear sweep moved horizontally via background-position;
//  this works the same in light and dark themes because both the base and
//  highlight colours come from the surface tokens.
//
//  Compose into table-shaped or card-shaped placeholders by setting width
//  + height props, or stacking with the convenience `<SkeletonStack>`.
// ─────────────────────────────────────────────────────────────────────────────

export default function Skeleton({ width = '100%', height = '1rem', className = '' }) {
  return (
    <div
      style={{ width, height }}
      className={[
        'rounded-md animate-shimmer',
        // 200% gradient width so the shimmer has somewhere to travel
        'bg-[length:200%_100%]',
        'bg-gradient-to-r from-surface2 via-border to-surface2',
        className,
      ].join(' ')}
      aria-hidden="true"
    />
  );
}

// Convenience: vertical stack of N rows. Used inside table bodies / lists.
export function SkeletonStack({ rows = 3, gap = '0.75rem', height = '1rem', className = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }} className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}
