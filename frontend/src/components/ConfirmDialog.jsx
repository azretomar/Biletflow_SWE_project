import { useState } from "react";
import "./confirmDialog.css";
import { t } from "../i18n";

function ConfirmDialog({ title, message, confirmLabel, danger, needsReason, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canConfirm = (!needsReason || reason.trim().length > 0) && !busy;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cd-backdrop" onClick={onCancel}>
      <form
        className="cd"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="cd-title">{title}</h2>
        <p>{message}</p>
        {needsReason && (
          <>
            <label className="bf-label" htmlFor="cd-reason">{t("Reason (saved in the audit log)")}</label>
            <textarea
              id="cd-reason"
              className="bf-input cd-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </>
        )}
        <div className="cd-actions">
          <button type="button" className="bf-btn-outline" onClick={onCancel}>{t("Cancel")}</button>
          <button type="submit" className={danger ? "bf-btn-danger" : "bf-btn"} disabled={!canConfirm}>
            {busy ? t("Please wait...") : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConfirmDialog;
