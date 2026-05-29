// ─────────────────────────────────────────────────────────────────────────────
//  toast wrapper — centralised react-toastify configuration.
//
//  Lives in its OWN file (not Toast.jsx) so that Toast.jsx can exclusively
//  export the <Toaster /> component, keeping `react-refresh/only-export-
//  components` happy. Other pages import { toast } from this file and get
//  our consistent defaults.
// ─────────────────────────────────────────────────────────────────────────────
import { toast as baseToast } from 'react-toastify';

export const TOAST_DEFAULTS = {
  position: 'top-right',
  autoClose: 3000,
  hideProgressBar: false,
  newestOnTop: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  theme: 'light',
};

function apply(fn) {
  return (msg, opts) => fn(msg, { ...TOAST_DEFAULTS, ...(opts || {}) });
}

export const toast = Object.assign(apply(baseToast), {
  success: apply(baseToast.success),
  error:   apply(baseToast.error),
  info:    apply(baseToast.info),
  warning: apply(baseToast.warning),
  dismiss: baseToast.dismiss,
});
