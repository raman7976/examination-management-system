// ═════════════════════════════════════════════════════════════════════════════
//  Motion presets — small, subtle variants used everywhere.
//
//  Design rules:
//   • No spring physics. No bouncy easing. Institutional UI should feel calm.
//   • Durations are 120–200 ms. Anything slower feels sluggish on dense
//     admin screens where users click rapidly.
//   • The same ease curve as the CSS tokens (cubic-bezier(0.16, 1, 0.3, 1))
//     so JS-driven motion matches CSS-driven motion (e.g. hover transitions).
// ═════════════════════════════════════════════════════════════════════════════

const EASE = [0.16, 1, 0.3, 1];

/** Pure opacity fade. Use for backdrops, simple reveals. */
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.18, ease: EASE },
};

/** Card / panel entrance — fades and slides up a few px. */
export const slideUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
  transition: { duration: 0.22, ease: EASE },
};

/** Route transitions. Slightly shorter so navigation feels responsive. */
export const pageEnter = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0 },
  transition: { duration: 0.18, ease: EASE },
};

/** Modal dialog body — small scale + fade. */
export const popIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.97 },
  transition: { duration: 0.16, ease: EASE },
};

/** Container for staggered list entrances. Pair with `slideUp` on each child. */
export const stagger = {
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
