import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useAuth } from "../../AuthContext";
import { useApi, send, statusNote } from "../../lib/useApi";
import "./organizerProfile.css";

// Organizer profile (SRS 4.1): public contact details and payout details.
// Payouts are simulated in the MVP (SRS 8): no real money is sent.
// Backend (docs/api.md):
//   GET /api/organizer/profile -> { display_name, bio, contact_email, phone, website, city,
//                                   payout: { holder_name, bank_name, iban, bin_iin } }
//   PUT /api/organizer/profile    same shape
const EMPTY = {
  display_name: "",
  bio: "",
  contact_email: "",
  phone: "",
  website: "",
  city: "",
  payout: { holder_name: "", bank_name: "", iban: "", bin_iin: "" },
};

// Kazakhstan IBAN: "KZ" + 2 check digits + 16 characters = 20 characters.
function ibanProblem(iban) {
  const v = iban.replace(/\s+/g, "").toUpperCase();
  if (!v) return "";
  return /^KZ\d{2}[A-Z0-9]{16}$/.test(v) ? "" : "A Kazakhstan IBAN has 20 characters and starts with KZ.";
}

function binProblem(bin) {
  if (!bin) return "";
  return /^\d{12}$/.test(bin) ? "" : "BIN / IIN has exactly 12 digits.";
}

function OrganizerProfile() {
  const { user } = useAuth();
  const { data, status, error } = useApi("/organizer/profile", EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Fill the form once the profile arrives; start from the account name otherwise.
  useEffect(() => {
    setForm({
      ...EMPTY,
      ...data,
      display_name: data.display_name || (user && user.full_name) || "",
      contact_email: data.contact_email || (user && user.email) || "",
      payout: { ...EMPTY.payout, ...(data.payout || {}) },
    });
  }, [data, user]);

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function changePayout(e) {
    setForm({ ...form, payout: { ...form.payout, [e.target.name]: e.target.value } });
  }

  const ibanError = ibanProblem(form.payout.iban);
  const binError = binProblem(form.payout.bin_iin);

  async function save(e) {
    e.preventDefault();
    setMessage("");
    if (!form.display_name.trim()) {
      setMessage("Enter the organizer name.");
      return;
    }
    if (ibanError || binError) {
      setMessage("Fix the highlighted payout fields.");
      return;
    }
    setSaving(true);
    const body = { ...form, payout: { ...form.payout, iban: form.payout.iban.replace(/\s+/g, "").toUpperCase() } };
    const r = await send("/organizer/profile", "PUT", body);
    setSaving(false);
    setMessage(r.ok ? "Profile saved." : r.message);
  }

  const note = statusNote(status, error);

  return (
    <div className="op">
      <Navbar />
      <main className="bf-page op-page">
        <Link to="/organizer/dashboard" className="bf-back">&lt;Back to dashboard</Link>
        <h1 className="bf-title">Organizer profile</h1>
        {note && <p className="bf-muted op-note" role="status">{note}</p>}

        <form className="op-form" onSubmit={save} noValidate>
          <section className="bf-card op-card">
            <h2>Public details</h2>
            <p className="bf-muted op-hint">Shown to attendees on your event pages.</p>
            <label className="bf-label" htmlFor="display_name">Organizer name</label>
            <input id="display_name" name="display_name" className="bf-input" value={form.display_name} onChange={change} />
            <label className="bf-label" htmlFor="bio">About</label>
            <textarea id="bio" name="bio" className="bf-input op-text" value={form.bio} onChange={change}
              placeholder="e.g. Student jazz club at Nazarbayev University" />
            <div className="op-row">
              <div>
                <label className="bf-label" htmlFor="contact_email">Contact email</label>
                <input id="contact_email" name="contact_email" type="email" className="bf-input" value={form.contact_email} onChange={change} />
              </div>
              <div>
                <label className="bf-label" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" type="tel" className="bf-input" value={form.phone} onChange={change} placeholder="+7 7__ ___ __ __" />
              </div>
            </div>
            <div className="op-row">
              <div>
                <label className="bf-label" htmlFor="website">Website or social page</label>
                <input id="website" name="website" type="url" className="bf-input" value={form.website} onChange={change} />
              </div>
              <div>
                <label className="bf-label" htmlFor="city">City</label>
                <input id="city" name="city" className="bf-input" value={form.city} onChange={change} placeholder="e.g. Astana" />
              </div>
            </div>
          </section>

          <section className="bf-card op-card">
            <h2>Payout details</h2>
            <p className="op-test-note">
              Demo only: payouts are simulated and no money is sent. Needed before paid sales can be activated.
              Only you and platform administrators can see this.
            </p>
            <label className="bf-label" htmlFor="holder_name">Account holder</label>
            <input id="holder_name" name="holder_name" className="bf-input" value={form.payout.holder_name} onChange={changePayout} />
            <div className="op-row">
              <div>
                <label className="bf-label" htmlFor="bank_name">Bank</label>
                <input id="bank_name" name="bank_name" className="bf-input" value={form.payout.bank_name} onChange={changePayout} />
              </div>
              <div>
                <label className="bf-label" htmlFor="bin_iin">BIN / IIN</label>
                <input id="bin_iin" name="bin_iin" inputMode="numeric" className="bf-input" value={form.payout.bin_iin} onChange={changePayout}
                  aria-invalid={!!binError} aria-describedby={binError ? "bin-error" : undefined} />
                {binError && <span id="bin-error" className="op-error">{binError}</span>}
              </div>
            </div>
            <label className="bf-label" htmlFor="iban">IBAN</label>
            <input id="iban" name="iban" className="bf-input" value={form.payout.iban} onChange={changePayout}
              placeholder="KZ00 0000 0000 0000 0000"
              aria-invalid={!!ibanError} aria-describedby={ibanError ? "iban-error" : undefined} />
            {ibanError && <span id="iban-error" className="op-error">{ibanError}</span>}
          </section>

          <div className="op-actions">
            {message && <span className="op-message" role="status">{message}</span>}
            <button type="submit" className="bf-btn" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default OrganizerProfile;
