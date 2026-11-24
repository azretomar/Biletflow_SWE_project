import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import Navbar from "../components/Navbar";
import { useApi, send, statusNote } from "../lib/useApi";
import "./activationChecklist.css";
import { locale, t } from "../i18n";

// Paid sales activation checklist (SRS 3.2, 4.5). Everything is simulated: no real money,
// no real identity check. The paid-ticket step is read from GET /api/events/{id} (already exists).
// Backend (docs/api.md):
//   GET  /api/organizer/events/{id}/activation -> { identity_verified, payout_connected, fee_paid,
//                                                   terms_accepted, activated, fee_kzt }
//   POST /api/organizer/events/{id}/activation/{step}   step = identity | payout | fee | terms
//   POST /api/organizer/events/{id}/activation/activate
// The payout account comes from the organizer profile.

const EMPTY = {
  identity_verified: false,
  payout_connected: false,
  fee_paid: false,
  terms_accepted: false,
  activated: false,
  fee_kzt: 0,
};

const STEPS = [
  { key: "identity", field: "identity_verified", get label() { return t("Identity verification"); }, get todo() { return t("Not done"); }, get action() { return t("Verify (simulated)"); } },
  { key: "payout", field: "payout_connected", get label() { return t("Payout account"); }, get todo() { return t("Not done"); }, get action() { return t("Connect"); } },
  { key: "fee", field: "fee_paid", get label() { return t("Activation fee"); }, get todo() { return t("Not paid"); }, get action() { return t("Pay fee (simulated)"); } },
  { key: "terms", field: "terms_accepted", get label() { return t("Paid-event terms"); }, get todo() { return t("Not accepted"); }, get action() { return t("Accept"); } },
];

function ActivationChecklist() {
  const { id } = useParams();
  const eventReq = useApi(`/events/${id}`, null);
  const { data: state, setData, status, error } = useApi(`/organizer/events/${id}/activation`, EMPTY);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const event = eventReq.data;
  const hasPaidType = Boolean(event && (event.ticket_types || []).some((tt) => tt.price > 0));
  const allDone = hasPaidType && STEPS.every((s) => state[s.field]);

  async function doStep(step) {
    setMessage("");
    setBusy(step.key);
    const r = await send(`/organizer/events/${id}/activation/${step.key}`, "POST", {});
    setBusy("");
    if (r.ok) setData({ ...state, ...(r.data || {}), [step.field]: true });
    else setMessage(r.message);
  }

  async function activate() {
    setMessage("");
    setBusy("activate");
    const r = await send(`/organizer/events/${id}/activation/activate`, "POST", {});
    setBusy("");
    if (r.ok) setData({ ...state, activated: true });
    else setMessage(r.message);
  }

  const note = statusNote(status, error);

  return (
    <div className="checklist">
      <Navbar />

      <main className="bf-page checklist-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;{t("Back to Event management")}</Link>
        <h1 className="bf-title">{t("Activate paid sales")}</h1>
        <p className="bf-muted checklist-event">{event ? event.title : eventReq.status === "loading" ? t("Loading...") : t("Event")}</p>
        {note && <p className="bf-muted checklist-note" role="status">{note}</p>}

        {state.activated ? (
          <div className="bf-card checklist-card">
            <p><strong>{t("Paid sales are active.")}</strong> {t("Attendees can now buy paid tickets for this event.")}</p>
          </div>
        ) : (
          <div className="bf-card checklist-card">
            <div className="checklist-row">
              <span className="checklist-label">{t("Event has a paid ticket type")}</span>
              <span className={hasPaidType ? "bf-badge bf-badge-valid" : "bf-badge bf-badge-completed"}>
                {hasPaidType ? t("Done") : t("Not done")}
              </span>
              <span className="checklist-action">
                {!hasPaidType && (
                  <Link to={`/organizer/events/${id}/ticket-types/new`} className="bf-btn-outline">{t("Add ticket type")}</Link>
                )}
              </span>
            </div>
            {STEPS.map((s) => {
              const done = state[s.field];
              return (
                <div key={s.key} className="checklist-row">
                  <span className="checklist-label">
                    {s.label}
                    {s.key === "fee" && state.fee_kzt > 0 && ` (${state.fee_kzt.toLocaleString(locale())} ₸)`}
                  </span>
                  <span className={done ? "bf-badge bf-badge-valid" : "bf-badge bf-badge-completed"}>
                    {done ? t("Done") : s.todo}
                  </span>
                  <span className="checklist-action">
                    {!done && (
                      s.key === "payout" ? (
                        <Link to="/organizer/profile" className="bf-btn-outline">{t("Open profile")}</Link>
                      ) : (
                        <button type="button" className="bf-btn-outline" disabled={busy !== ""} onClick={() => doStep(s)}>
                          {busy === s.key ? t("Please wait...") : s.action}
                        </button>
                      )
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="bf-muted checklist-note">{t("Demonstration only. No real money is moved.")}</p>
        {message && <p className="checklist-error" role="alert">{message}</p>}

        {!state.activated && (
          <button type="button" className="bf-btn bf-btn-block checklist-activate" disabled={!allDone || busy !== ""} onClick={activate}>
            {busy === "activate" ? t("Activating...") : t("Activate paid sales")}
          </button>
        )}
      </main>
    </div>
  );
}

export default ActivationChecklist;
