import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdminData, formatDate, checklistDone } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";
import { t } from "../../i18n";

const CHECKLIST = [
  { key: "identity_verified", get label() { return t("Identity"); } },
  { key: "fee_paid", get label() { return t("Fee paid"); } },
  { key: "payout_account", get label() { return t("Payout account"); } },
  { key: "terms_accepted", get label() { return t("Terms"); } },
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
      <h1>{t("Paid-sales activations")}</h1>
      <p className="page-intro">
        {t("Organizers must finish every step before they can sell paid tickets for an event. Fees and payouts are simulated for the demo, so no real money moves.")}
      </p>

      <div className="panel">
        {rows.length === 0 ? (
          <p className="empty">{t("No activation requests yet.")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("Event")}</th>
                <th>{t("Organizer")}</th>
                <th>{t("Requested")}</th>
                <th>{t("Checklist")}</th>
                <th>{t("Paid sales")}</th>
                <th><span className="sr-only">{t("Actions")}</span></th>
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
                      <ul className="checklist" aria-label={t("{done} of {total} steps done", { done, total: CHECKLIST.length })}>
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
                          {t("Stop sales")}
                        </button>
                      )}
                      {a.paid_sales === "stopped" && !e.suspended && checklistDone(a) && (
                        <button type="button" className="btn-small btn-secondary" onClick={() => setConfirming(e)}>
                          {t("Resume")}
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
          title={confirming.activation.paid_sales === "active" ? t("Stop paid sales?") : t("Resume paid sales?")}
          message={
            confirming.activation.paid_sales === "active"
              ? t("Attendees will not be able to buy paid tickets for \"{title}\".", { title: confirming.title })
              : t("Attendees will be able to buy paid tickets for \"{title}\" again.", { title: confirming.title })
          }
          confirmLabel={confirming.activation.paid_sales === "active" ? t("Stop paid sales") : t("Resume sales")}
          danger={confirming.activation.paid_sales === "active"}
          needsReason
          onConfirm={(reason) => {
            setPaidSalesStopped(confirming.id, confirming.activation.paid_sales === "active", reason);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default AdminActivations;
