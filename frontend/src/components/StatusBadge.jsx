// Small pill that renders the swap-request status in a colour-coded chip.
// Used across IncomingRequests / OutgoingRequests / SwapApproval so the
// language and palette stay consistent.

const STATUS_STYLES = {
  pending_peer:     { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Awaiting peer'    },
  pending_admin:    { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Awaiting admin'   },
  approved:         { bg: 'bg-emerald-100',text: 'text-emerald-800',label: 'Approved'         },
  rejected_by_peer: { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Rejected (peer)'  },
  rejected_by_admin:{ bg: 'bg-red-100',    text: 'text-red-800',    label: 'Rejected (admin)' },
  cancelled:        { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Cancelled'        },
};

export default function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
