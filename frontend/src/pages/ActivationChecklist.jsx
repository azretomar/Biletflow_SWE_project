import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./activationChecklist.css";

const INITIAL_STEPS = [
  { key: "ticket", label: "Event has a paid ticket type", done: false, todo: "Not done", action: "Add ticket type" },
  { key: "identity", label: "Identity verification", done: false, todo: "Not done", action: "Verify" },
  { key: "payout", label: "Payout account", done: false, todo: "Not done", action: "Connect" },
  { key: "fee", label: "Activation fee", done: false, todo: "Not paid", action: "Pay fee" },
  { key: "terms", label: "Paid-event terms", done: false, todo: "Not accepted", action: "Accept" },
];

function ActivationChecklist() {
  const { id } = useParams();
  const [steps, setSteps] = useState(INITIAL_STEPS);

  const allDone = steps.every((s) => s.done);

  function markDone(key) {
    setSteps(steps.map((s) => (s.key === key ? { ...s, done: true } : s)));
  }

  return (
    <div className="checklist">
      <Navbar />

      <main className="bf-page checklist-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;Back to Event management</Link>
        <h1 className="bf-title">Activate paid sales</h1>
        <p className="bf-muted checklist-event">Event name</p>

        <div className="bf-card checklist-card">
          {steps.map((s) => (
            <div key={s.key} className="checklist-row">
              <span className="checklist-label">{s.label}</span>
              <span className={s.done ? "bf-badge bf-badge-valid" : "bf-badge bf-badge-completed"}>
                {s.done ? "Done" : s.todo}
              </span>
              <span className="checklist-action">
                {s.done ? null : s.key === "ticket" ? (
                  <Link to={`/organizer/events/${id}/ticket-types/new`} className="bf-btn-outline">
                    {s.action}
                  </Link>
                ) : (
                  <button type="button" className="bf-btn-outline" onClick={() => markDone(s.key)}>
                    {s.action}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <p className="bf-muted checklist-note">Demonstration only. No real money is moved.</p>

        <button type="button" className="bf-btn bf-btn-block checklist-activate" disabled={!allDone}>
          Activate paid sales
        </button>
      </main>
    </div>
  );
}

export default ActivationChecklist;