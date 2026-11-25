import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import AuthLayout from "./AuthLayout";
import { t } from "../i18n";

function LogIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state && location.state.from;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      const home =
        user.role === "platform_admin" ? "/admin" :
        user.role === "organizer" ? "/organizer/dashboard" : "/events";
      navigate(from || home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("Welcome back")} subtitle={t("Log in to see your tickets and events.")}>
      <form className="form" onSubmit={handleSubmit}>
        {error && <p className="form-error" role="alert">{error}</p>}

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
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange}
          />
        </div>
        <Link to="/forgot-password" className="forgot-link">{t("Forgot password?")}</Link>

        <button type="submit" className="btn" disabled={loading}>
          {loading ? t("Logging in...") : t("Log in")}
        </button>

        <p className="form-note">
          {t("Don't have an account?")} <Link to="/signup">{t("Sign up")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default LogIn;
