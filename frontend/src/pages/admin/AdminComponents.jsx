import { useState } from "react";
import { t } from "../../i18n";

// A small colored label, e.g. "published", "suspended", "active".
// The text is always shown, so color is never the only signal (accessibility).
const STATUS_LABELS = {
  get published() { return t("Published"); },
  get draft() { return t("Draft"); },
  get cancelled() { return t("Cancelled"); },
  get suspended() { return t("Suspended"); },
  get active() { return t("Active"); },
  get sales_active() { return t("Paid sales active"); },
  get sales_pending() { return t("Paid sales pending"); },
  get sales_stopped() { return t("Paid sales stopped"); },
  get sales_none() { return t("No paid sales"); },
};

export function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] ? STATUS_LABELS[status] : status.replace("_", " ");
  return <span className={"badge badge-" + status}>{label}</span>;
}

// A pop-up box that asks the admin to confirm an action and give a reason.
// The reason is required because admin actions must be auditable (SRS 7).
export function ConfirmDialog({ title, message, confirmLabel, danger, needsReason, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const canConfirm = !needsReason || reason.trim().length > 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (canConfirm) onConfirm(reason.trim());
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{message}</p>

        {needsReason && (
          <div className="field">
            <label htmlFor="dialog-reason">{t("Reason (saved in the audit log)")}</label>
            <textarea
              id="dialog-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("e.g. Multiple scam reports, venue does not exist")}
              autoFocus
            />
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn-small btn-secondary" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button type="submit" className={danger ? "btn-small btn-danger" : "btn-small"} disabled={!canConfirm}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
