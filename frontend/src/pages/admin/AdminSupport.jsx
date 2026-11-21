import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { useApi, send, statusNote } from "../../lib/useApi";
import { shortDateTime, CASE_STATUS } from "../../lib/format";
import { CATEGORIES, ContextLink, Thread, ReplyBox } from "../Support";
import "../support.css";

// Platform Admin: support cases (SRS 4.12, 4.13).
// Needs (proposal, platform_admin only):
//   GET   /api/admin/support/cases?status=   -> [{ id, subject, status, category, requester: { full_name, email },
//                                                 assignee: { id, full_name } | null, updated_at, context }]
//   GET   /api/admin/support/cases/{id}      -> same as one case + messages
//   PATCH /api/admin/support/cases/{id}        { status } or { assign_to_me: true }
//   POST  /api/admin/support/cases/{id}/messages { body }

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting for customer" },
  { value: "resolved", label: "Resolved" },
];

function categoryLabel(v) {
  const c = CATEGORIES.find((x) => x.value === v);
  return c ? c.label : v || "-";
}

function CaseStatusBadge({ status }) {
  const s = CASE_STATUS[status] || { label: status };
  return <span className={"badge badge-case-" + status}>{s.label}</span>;
}

export function AdminSupportList() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") || "";
  const [search, setSearch] = useState("");
  const { data: cases, status, error } = useApi(`/admin/support/cases${filter ? `?status=${filter}` : ""}`, []);
  const note = statusNote(status, error);

  const visible = cases.filter((c) => {
    const text = (c.id + " " + c.subject + " " + c.requester.full_name + " " + c.requester.email).toLowerCase();
    return !search || text.includes(search.toLowerCase());
  });

  return (
    <div className="admin-page">
      <h1>Support cases</h1>
      <div className="toolbar">
        <input type="search" className="search-input" placeholder="Search by subject, person or case number..."
          aria-label="Search support cases" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="filter-tabs" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value}
              className={filter === f.value ? "filter-tab active" : "filter-tab"}
              onClick={() => setParams(f.value ? { status: f.value } : {})}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {note && <p className="page-intro" role="status">{note}</p>}

      <div className="panel">
        {visible.length === 0 ? (
          <p className="empty">{cases.length === 0 ? "No support cases." : "No cases match your search."}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Case</th>
                <th>From</th>
                <th>Topic</th>
                <th>Assigned to</th>
                <th>Updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/admin/support/${c.id}`}>{c.subject}</Link>
                    <span className="cell-sub">#{c.id}</span>
                  </td>
                  <td>
                    {c.requester.full_name}
                    <span className="cell-sub">{c.requester.email}</span>
                  </td>
                  <td>{categoryLabel(c.category)}</td>
                  <td>{c.assignee ? c.assignee.full_name : <span className="text-danger">Nobody</span>}</td>
                  <td className="nowrap">{shortDateTime(c.updated_at)}</td>
                  <td><CaseStatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function AdminSupportCase() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: c, setData, status, error } = useApi(`/admin/support/cases/${id}`, null);
  const [msg, setMsg] = useState("");
  const note = statusNote(status, error);

  async function patch(body, apply) {
    setMsg("");
    const r = await send(`/admin/support/cases/${id}`, "PATCH", body);
    if (r.ok) setData({ ...c, ...apply, ...(r.data || {}) });
    else setMsg(r.message);
  }

  async function reply(body) {
    const r = await send(`/admin/support/cases/${id}/messages`, "POST", { body });
    if (r.ok) {
      const created = r.data && r.data.id ? r.data : {
        id: Date.now(), author_name: user.full_name || user.email, author_role: user.role, body,
        created_at: new Date().toISOString(),
      };
      setData({ ...c, messages: [...c.messages, created] });
    }
    return r;
  }

  return (
    <div className="admin-page">
      <Link to="/admin/support" className="back-link">← All support cases</Link>
      {note && <p className="page-intro" role="status">{note}</p>}
      {!c ? (
        status !== "loading" && <h1>Support case #{id}</h1>
      ) : (
        <>
          <div className="detail-header">
            <div>
              <h1>{c.subject}</h1>
              <div className="detail-meta">
                <CaseStatusBadge status={c.status} />
                <span>Case #{c.id}</span>
                <span>{categoryLabel(c.category)}</span>
                <ContextLink context={c.context} />
              </div>
            </div>
            <div className="detail-actions">
              {(!c.assignee || c.assignee.id !== user.id) && (
                <button type="button" className="btn-small btn-secondary"
                  onClick={() => patch({ assign_to_me: true }, { assignee: { id: user.id, full_name: user.full_name } })}>
                  Assign to me
                </button>
              )}
              <label className="sr-only" htmlFor="case-status">Status</label>
              <select id="case-status" className="search-input case-status-select" value={c.status}
                onChange={(e) => patch({ status: e.target.value }, { status: e.target.value })}>
                {STATUS_FILTERS.filter((f) => f.value).map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
          {msg && <p className="text-danger" role="alert">{msg}</p>}

          <div className="detail-grid">
            <section className="panel">
              <h2>From</h2>
              <dl className="info-list">
                <dt>Name</dt>
                <dd>{c.requester ? c.requester.full_name : "-"}</dd>
                <dt>Email</dt>
                <dd>{c.requester ? c.requester.email : "-"}</dd>
                <dt>Opened</dt>
                <dd>{shortDateTime(c.created_at)}</dd>
                <dt>Assigned</dt>
                <dd>{c.assignee ? c.assignee.full_name : "Nobody"}</dd>
              </dl>
            </section>
          </div>

          <section className="panel">
            <h2>Conversation</h2>
            <Thread messages={c.messages} meRole="staff" />
            <ReplyBox onSend={reply} placeholder="Reply to the customer..." />
          </section>
        </>
      )}
    </div>
  );
}
