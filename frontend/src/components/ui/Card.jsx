// ─────────────────────────────────────────────────────────────────────────────
//  Card — the surface every panel sits on.
//
//  Props:
//   • interactive: adds a subtle hover-lift effect (use for clickable rows).
//   • padding:     'none' | 'sm' | 'md' | 'lg' (default 'md')
//   • as:          element override (default 'div')
//
//  Why a component, not a class string: the maroon brand decisions about
//  shadow/border/padding live in ONE place. Replacing this Card's styles
//  re-skins every panel in the app.
// ─────────────────────────────────────────────────────────────────────────────

const PADDING = {
  none: '',
  sm:  'p-3',
  md:  'p-5',
  lg:  'p-7',
};

export default function Card({
  as: Tag = 'div',
  interactive = false,
  padding = 'md',
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={[
        'bg-surface border border-border rounded-xl shadow-sm',
        'transition-shadow duration-base ease-out',
        interactive && 'cursor-pointer hover:shadow-md hover:border-borderStrong',
        PADDING[padding] || PADDING.md,
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
