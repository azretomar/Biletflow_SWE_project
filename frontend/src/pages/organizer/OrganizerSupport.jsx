import Navbar from "../../components/Navbar";
import { AdminSupportList, AdminSupportCase } from "../admin/AdminSupport";
import "../admin/admin.css";
import "./organizerSupport.css";

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
