   import { useState } from "react";
   import { Link, useNavigate } from "react-router-dom";
   import { useAuth } from "../AuthContext";
   import AuthLayout from "./AuthLayout";
import { t } from "../i18n";

function SignUp() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "attendee",
  });

  const { signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await signup(form.fullName, form.email, form.password, form.role);
      navigate(user.role === "organizer" ? "/organizer/dashboard" : "/events");
    } catch (err) {
     setError(err.message);
    } finally {
     setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("Create your account")} subtitle={t("It takes less than a minute.")}>
      <form className="form" onSubmit={handleSubmit}>
      {error && <p className="form-error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="fullName">{t("Full name")}</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={handleChange}
          />
        </div>

        <div className="field">
          <label htmlFor="email">{t("Email")}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
          />
        </div>

        <div className="field">
          <label htmlFor="password">{t("Password")}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-describedby="password-hint"
            value={form.password}
            onChange={handleChange}
          />
          <span id="password-hint" className="field-hint">{t("8 to 72 characters")}</span>
        </div>

        <div className="field">
          <span className="label-text">{t("I want to...")}</span>
          <div className="role-group">
            <button
              type="button"
              className={form.role === "attendee" ? "role-btn active" : "role-btn"}
              aria-pressed={form.role === "attendee"}
              onClick={() => setForm({ ...form, role: "attendee" })}
            >
              {t("Attend events")}
              <small>{t("Find events and get tickets")}</small>
            </button>
            <button
              type="button"
              className={form.role === "organizer" ? "role-btn active" : "role-btn"}
              aria-pressed={form.role === "organizer"}
              onClick={() => setForm({ ...form, role: "organizer" })}
            >
              {t("Organize events")}
              <small>{t("Create events and sell tickets")}</small>
            </button>
          </div>
        </div>

      <button type="submit" className="btn" disabled={loading}>
        {loading ? t("Creating account...") : t("Create account")}
      </button>

        <p className="form-note">
          {t("Already have an account?")} <Link to="/login">{t("Log in")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default SignUp;
