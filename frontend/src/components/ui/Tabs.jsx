import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
//  Tabs — segmented tab strip with an animated underline.
//
//  Controlled component: parent owns `value` and provides `onChange`.
//  The underline slides between tabs via Framer Motion's shared `layoutId`.
//
//  Tabs are described as `[{ value, label, icon? }]`.
// ─────────────────────────────────────────────────────────────────────────────

export default function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={['inline-flex items-end gap-1 border-b border-border', className].join(' ')}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={[
              'relative px-4 py-2.5 text-sm font-medium',
              'transition-colors duration-fast ease-out cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              active
                ? 'text-brand-500'
                : 'text-textMuted hover:text-text',
            ].join(' ')}
          >
            <span className="inline-flex items-center gap-2">
              {t.icon}
              {t.label}
            </span>
            {active && (
              <motion.span
                layoutId="tab-underline"
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-500"
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
