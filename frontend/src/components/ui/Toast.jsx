// ─────────────────────────────────────────────────────────────────────────────
//  Toaster — root-mounted ToastContainer with our config.
//
//  Mount once in main.jsx. Other ToastContainer instances elsewhere in the
//  tree become no-ops because react-toastify routes to the first matching
//  container.
//
//  The `toast` helper function lives in ./toastApi.js — import it there:
//    import { toast } from '../../components/ui/toastApi.js'
//  Keeping `toast` out of this file lets ESLint enable react-refresh on it.
// ─────────────────────────────────────────────────────────────────────────────
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { TOAST_DEFAULTS } from './toastApi.js';

export function Toaster() {
  return <ToastContainer {...TOAST_DEFAULTS} />;
}
