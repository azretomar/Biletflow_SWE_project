import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import { send } from "../lib/useApi";
import { t } from "../i18n";

// Account pages from SRS 4.1: email verification and password reset.
// They use the same two-panel layout as Sign up and Log in.
// Backend (docs/api.md; the emails themselves are sent by the backend):
//   POST /api/auth/verify-email          { token }
//   POST /api/auth/resend-verification   (logged in)
//   POST /api/auth/forgot-password       { email }          always answers 200
//   POST /api/auth/reset-password        { token, password }

// /verify-email?token=... : the link from the verification email lands here.
export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { user } = useAuth();
  const [state, setState] = useState(token ? "checking" : "no_token"); // checking | done | failed | no_token
  const [message, setMessage] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // verify once, even in React's development double-run
    send("/auth/verify-email", "POST", { token }).then((r) => {
      setState(r.ok ? "done" : "failed");
      setMessage(r.message);
    });
  }, [token]);

  async function resend() {
    const r = await send("/auth/resend-verification", "POST", {});
    setResendMsg(r.ok ? t("A new verification email is on its way.") : r.message);
  }

  return (
    <AuthLayout title={t("Email verification")}>
      <div className="form" aria-live="polite">
        {state === "checking" && <p>{t("Checking your link...")}</p>}
        {state === "done" && (
          <>
            <p className="form-success">{t("Your email is verified. Thank you!")}</p>
            <Link to={user ? "/" : "/login"} className="btn">{user ? t("Go to BiletFlow") : t("Log in")}</Link>
          </>
        )}
        {(state === "failed" || state === "no_token") && (
          <>
            <p className="form-error" role="alert">
              {state === "no_token" ? t("This link is incomplete. Open the link from your email again.") : message || t("This link is invalid or has expired.")}
            </p>
            {user ? (
              <button type="button" className="btn" onClick={resend}>{t("Send a new verification email")}</button>
            ) : (
              <p className="form-note">
                <Link to="/login">{t("Log in")}</Link> {t("to get a new verification email.")}
              </p>
            )}
            {resendMsg && <p className="form-note" role="status">{resendMsg}</p>}
          </>
        )}
      </div>
    </AuthLayout>
  );
}

// /forgot-password : ask for a reset link.
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(t("Enter the email you signed up with."));
      return;
    }
    setBusy(true);
    const r = await send("/auth/forgot-password", "POST", { email: email.trim() });
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.message);
  }

  return (
    <AuthLayout title={t("Reset your password")} subtitle={t("We'll email you a link to choose a new password.")}>
      {sent ? (
        <div className="form" aria-live="polite">
          <p className="form-success">
            {t("If an account with {email} exists, a reset link is on its way. The link works for one hour.", { email: email.trim() })}
          </p>
          <p className="form-note"><Link to="/login">{t("Back to Log in")}</Link></p>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="field">
            <label htmlFor="email">{t("Email")}</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn" disabled={busy}>{busy ? t("Sending...") : t("Send reset link")}</button>
          <p className="form-note">{t("Remembered it?")} <Link to="/login">{t("Log in")}</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}

// /reset-password?token=... : the link from the reset email lands here.
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8 || password.length > 72) {
      setError(t("The password must be 8 to 72 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("The two passwords do not match."));
      return;
    }
    setBusy(true);
    const r = await send("/auth/reset-password", "POST", { token, password });
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.message);
  }

  if (!token) {
    return (
      <AuthLayout title={t("Choose a new password")}>
        <div className="form">
          <p className="form-error" role="alert">{t("This link is incomplete. Open the link from your email again.")}</p>
          <p className="form-note"><Link to="/forgot-password">{t("Request a new link")}</Link></p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("Choose a new password")}>
      {done ? (
        <div className="form" aria-live="polite">
          <p className="form-success">{t("Your password has been changed.")}</p>
          <Link to="/login" className="btn">{t("Log in")}</Link>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="field">
            <label htmlFor="password">{t("New password")}</label>
            <input id="password" type="password" autoComplete="new-password" aria-describedby="pw-hint"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <span id="pw-hint" className="field-hint">{t("8 to 72 characters")}</span>
          </div>
          <div className="field">
            <label htmlFor="confirm">{t("Repeat the new password")}</label>
            <input id="confirm" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button type="submit" className="btn" disabled={busy}>{busy ? t("Saving...") : t("Save new password")}</button>
        </form>
      )}
    </AuthLayout>
  );
}
