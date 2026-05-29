import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
//  PageTransition — fade the new route in on every navigation.
//
//  Deliberately simple: a single keyed motion.div, no AnimatePresence, no
//  mode="wait", no h-full. The key={pathname} means React unmounts the
//  previous wrapper and mounts a fresh one whenever the route changes — and
//  the new wrapper's `initial → animate` cycle plays as a 180-ms fade-in.
//
//  An earlier version used AnimatePresence + mode="wait" + h-full. Each of
//  those individually is fine; together they let some routes mount with
//  zero height (h-full of a content-sized parent = 0px), making the page
//  appear blank until the user refreshed. The simpler version below cannot
//  produce that failure mode.
// ─────────────────────────────────────────────────────────────────────────────
export default function PageTransition({ children }) {
  const location = useLocation();
  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
