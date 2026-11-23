import Navbar from "../../components/Navbar";
import { AdminSupportList, AdminSupportCase } from "../admin/AdminSupport";
import "../admin/admin.css";
import "./organizerSupport.css";

// Organizer support inbox (SRS 4.13, UC9): attendees' requests about the organizer's events.
// The organizer can reply, take a case and change its status; platform admins see the same cases.
// Planned endpoints (docs/api.md): until the backend adds /api/organizer/support/cases the page
// says "This part is not connected to the server yet".
export function OrganizerSupportList() {
  return (
    <div className="admin org-support">
      <Navbar />
      <main className="bf-page org-support-page">
        <AdminSupportList scope="organizer" />
      </main>
    </div>
  );
}

export function OrganizerSupportCase() {
  return (
    <div className="admin org-support">
      <Navbar />
      <main className="bf-page org-support-page">
        <AdminSupportCase scope="organizer" />
      </main>
    </div>
  );
}
