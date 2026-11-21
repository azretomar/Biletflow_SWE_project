import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../AuthContext";
import { useApi, send, statusNote } from "../lib/useApi";
import { shortDateTime, CASE_STATUS } from "../lib/format";
import "./support.css";

// Asynchronous support chat for attendees and organizers (SRS 4.13).
// A case can point at the event, order or ticket it is about.
// Needs (proposal; only the case's author and staff may read a case):
//   GET  /api/support/cases            -> [{ id, subject, status, category, updated_at, context }]
//   POST /api/support/cases              { category, subject, message, context: { type, id } } -> { id }
//   GET  /api/support/cases/{id}       -> { id, subject, status, category, context, created_at,
//                                           messages: [{ id, author_name, author_role, body, created_at }] }
//   POST /api/support/cases/{id}/messages { body }

export const CATEGORIES = [
  { value: "tickets", label: "My tickets or entry" },
  { value: "payment", label: "Payment or refund" },
  { value: "event", label: "Question about an event" },
  { value: "account", label: "My account" },
  { value: "organizer", label: "Organizer tools" },
  { value: "other", label: "Something else" },
];

const CONTEXT_LINKS = {
  event: (id) => `/events/${id}`,
  order: () => "/my-orders",
  ticket: (id) => `/tickets/${id}`,
};

export function ContextLink({ context }) {
  if (!context || !context.type || !context.id) return null;
  const to = CONTEXT_LINKS[context.type] ? CONTEXT_LINKS[context.type](context.id) : null;
  const text = `${context.type.charAt(0).toUpperCase() + context.type.slice(1)} ${context.id}`;
  return to ? <Link to={to} className="sp-context">{text}</Link> : <span className="sp-context">{text}</span>;
}

function CaseBadge({ status }) {
  const s = CASE_STATUS[status] || { label: status, badge: "" };
  return <span className={`bf-badge ${s.badge}`}>{s.label}</span>;
}

// /support : the user's own cases.
export function SupportList() {
  const { data: cases, status, error } = useApi("/support/cases", []);
  const note = statusNote(status, error);

  return (
    <div className="sp">
      <Navbar />
      <main className="bf-page sp-page">
        <div className="sp-head">
          <h1 className="bf-title">Help and support</h1>
          <Link to="/support/new" className="bf-btn">New request</Link>
        </div>
        <p className="bf-muted sp-sub">Write to us any time. We usually answer within one working day.</p>
        {note && <p className="bf-muted sp-note" role="status">{note}</p>}

        {cases.length === 0 ? (
          <section className="bf-card sp-empty">
            <p className="bf-muted">You have no support requests.</p>
          </section>
        ) : (
          <ul className="sp-list">
            {cases.map((c) => (
              <li key={c.id}>
                <Link to={`/support/${c.id}`} className="bf-card sp-row">
                  <span className="sp-row-main">
                    <strong>{c.subject}</strong>
                    <span className="bf-muted sp-row-meta">
                      #{c.id} · updated {shortDateTime(c.updated_at)}
                    </span>
                  </span>
                  <CaseBadge status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// /support/new?event=..|order=..|ticket=.. : open a case, optionally about something specific.
export function SupportNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const preset = ["ticket", "order", "event"].find((t) => params.get(t));
  const [form, setForm] = useState({
    category: preset === "order" ? "payment" : preset === "ticket" ? "tickets" : preset === "event" ? "event" : "",
    subject: "",
    message: "",
    contextType: preset || "",
    contextId: preset ? params.get(preset) : "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.category || !form.subject.trim() || form.message.trim().length < 10) {
      setError("Choose a topic, add a subject, and describe the problem in at least 10 characters.");
      return;
    }
    setBusy(true);
    const r = await send("/support/cases", "POST", {
      category: form.category,
      subject: form.subject.trim(),
      message: form.message.trim(),
      context: form.contextType && form.contextId ? { type: form.contextType, id: form.contextId.trim() } : null,
    });
    setBusy(false);
    if (r.ok) navigate(`/support/${r.data.id}`);
    else setError(r.message);
  }

  return (
    <div className="sp">
      <Navbar />
      <main className="bf-page sp-page">
        <Link to="/support" className="bf-back">&lt;Back to support</Link>
        <h1 className="bf-title">New support request</h1>

        <form className="bf-card sp-form" onSubmit={submit} noValidate>
          {error && <p className="sp-error" role="alert">{error}</p>}

          <label className="bf-label" htmlFor="category">Topic</label>
          <select id="category" name="category" className="bf-input" value={form.category} onChange={change}>
            <option value="">Choose a topic...</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <label className="bf-label" htmlFor="subject">Subject</label>
          <input id="subject" name="subject" className="bf-input" maxLength={120} value={form.subject} onChange={change}
            placeholder="e.g. I did not receive my ticket" />

          <label className="bf-label" htmlFor="message">Message</label>
          <textarea id="message" name="message" className="bf-input sp-text" value={form.message} onChange={change}
            placeholder="What happened? What did you expect?" />

          <fieldset className="sp-context-field">
            <legend className="bf-label">Related to (optional)</legend>
            <div className="sp-context-row">
              <select name="contextType" aria-label="Related to" className="bf-input" value={form.contextType} onChange={change}>
                <option value="">Nothing specific</option>
                <option value="event">An event</option>
                <option value="order">An order</option>
                <option value="ticket">A ticket</option>
              </select>
              <input name="contextId" aria-label="Its number" className="bf-input" placeholder="Number or ID"
                value={form.contextId} onChange={change} disabled={!form.contextType} />
            </div>
          </fieldset>

          <p className="bf-muted sp-privacy">Never send card numbers or passwords in a support message.</p>
          <button type="submit" className="bf-btn" disabled={busy}>{busy ? "Sending..." : "Send request"}</button>
        </form>
      </main>
    </div>
  );
}

// Message thread used by both the user page and the admin page.
export function Thread({ messages, meRole }) {
  if (messages.length === 0) return <p className="bf-muted">No messages yet.</p>;
  return (
    <ol className="sp-thread">
      {messages.map((m) => {
        const staff = m.author_role === "platform_admin" || m.author_role === "support";
        const mine = meRole === "staff" ? staff : !staff;
        return (
          <li key={m.id} className={mine ? "sp-msg sp-msg-mine" : "sp-msg"}>
            <span className="sp-msg-meta">
              <strong>{staff ? `${m.author_name} (BiletFlow support)` : m.author_name}</strong>
              {" · "}
              <time dateTime={m.created_at}>{shortDateTime(m.created_at)}</time>
            </span>
            <p>{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplyBox({ onSend, disabled, placeholder = "Write a reply..." }) {
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const r = await onSend(body.trim());
    setBusy(false);
    if (r.ok) {
      setBody("");
      setMsg("");
    } else setMsg(r.message);
  }

  return (
    <form className="sp-reply" onSubmit={submit}>
      <label className="bf-sr-only" htmlFor="sp-reply">Reply</label>
      <textarea id="sp-reply" className="bf-input sp-text" value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder} disabled={disabled} />
      <div className="sp-reply-row">
        {msg && <span className="sp-error-inline" role="alert">{msg}</span>}
        <button type="submit" className="bf-btn" disabled={disabled || busy || !body.trim()}>
          {busy ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}

// /support/:id : one case and its messages.
export function SupportCase() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: c, setData, status, error } = useApi(`/support/cases/${id}`, null);
  const note = statusNote(status, error);

  async function reply(body) {
    const r = await send(`/support/cases/${id}/messages`, "POST", { body });
    if (r.ok && c) {
      const created = r.data && r.data.id ? r.data : {
        id: Date.now(), author_name: user.full_name || user.email, author_role: user.role, body,
        created_at: new Date().toISOString(),
      };
      setData({ ...c, messages: [...c.messages, created] });
    }
    return r;
  }

  return (
    <div className="sp">
      <Navbar />
      <main className="bf-page sp-page">
        <Link to="/support" className="bf-back">&lt;Back to support</Link>
        {note && <p className="bf-muted sp-note" role="status">{note}</p>}
        {c ? (
          <>
            <div className="sp-head">
              <h1 className="bf-title sp-case-title">{c.subject}</h1>
              <CaseBadge status={c.status} />
            </div>
            <p className="bf-muted sp-sub">
              Request #{c.id} · opened {shortDateTime(c.created_at)} <ContextLink context={c.context} />
            </p>
            <section className="bf-card sp-thread-card">
              <Thread messages={c.messages} meRole="user" />
              <ReplyBox onSend={reply} disabled={c.status === "resolved"}
                placeholder={c.status === "resolved" ? "This request is resolved. Open a new one if you need more help." : "Write a reply..."} />
            </section>
          </>
        ) : (
          status !== "loading" && <h1 className="bf-title">Support request #{id}</h1>
        )}
      </main>
    </div>
  );
}
