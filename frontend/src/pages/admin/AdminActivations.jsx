import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdminData, formatDate, checklistDone } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";

const CHECKLIST = [
  { key: "identity_verified", label: "Identity" },
  { key: "fee_paid", label: "Fee paid" },
  { key: "payout_account", label: "Payout account" },
  { key: "terms_accepted", label: "Terms" },
];

// Screen 5: Paid-sales activations - which events asked to sell paid tickets,
// how far their checklist is (SRS 3.2), and an option to stop their sales.
function AdminActivations() {
  const { events, getUser, setPaidSalesStopped } = useAdminData();
  const [confirming, setConfirming] = useState(null);

  // Only events that started the paid-sales process have an "activation".
  const rows = events
    .filter((e) => e.activation)
    .sort((a, b) => b.activation.requested_at.localeCompare(a.activation.requested_at));

  return (
    <div className="admin-page">
      <h1>Paid-sales activations</h1>
      <p className="page-intro">
        Organizers must finish every step before they can sell paid tickets for an event.
        Fees and payouts are simulated for the demo, so no real money moves.
      </p>

      <div className="panel">
        {rows.length === 0 ? (
          <p className="empty">No activation requests yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Organizer</th>
                <th>Requested</th>
                <th>Checklist</th>
                <th>Paid sales</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const a = e.activation;
                const done = CHECKLIST.filter((c) => a[c.key]).length;
                return (
                  <tr key={e.id}>
                    <td><Link to={"/admin/events/" + e.id}>{e.title}</Link></td>
                    <td>{getUser(e.organizer_id)?.full_name}</td>
                    <td className="nowrap">{formatDate(a.requested_at)}</td>
                    <td>
                      <ul className="checklist" aria-label={`${done} of ${CHECKLIST.length} steps done`}>
                        {CHECKLIST.map((c) => (
                          <li key={c.key} className={a[c.key] ? "done" : "missing"}>
                            <span aria-hidden="true">{a[c.key] ? "✓" : "✗"}</span> {c.label}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td><StatusBadge status={"sales_" + a.paid_sales} /></td>
                    <td className="actions">
                      {a.paid_sales === "active" && (
                        <button type="button" className="btn-small btn-danger" onClick={() => setConfirming(e)}>
                          Stop sales
                        </button>
                      )}
                      {a.paid_sales === "stopped" && !e.suspended && checklistDone(a) && (
                        <button type="button" className="btn-small btn-secondary" onClick={() => setConfirming(e)}>
                          Resume
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming.activation.paid_sales === "active" ? "Stop paid sales?" : "Resume paid sales?"}
          message={
            confirming.activation.paid_sales === "active"
              ? `Attendees will not be able to buy paid tickets for "${confirming.title}".`
              : `Attendees will be able to buy paid tickets for "${confirming.title}" again.`
          }
          confirmLabel={confirming.activation.paid_sales === "active" ? "Stop paid sales" : "Resume sales"}
          danger={confirming.activation.paid_sales === "active"}
          needsReason
          onConfirm={() => {
            setPaidSalesStopped(confirming.id, confirming.activation.paid_sales === "active");
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default AdminActivations;
