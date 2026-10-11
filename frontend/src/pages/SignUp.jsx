import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";

function SignUp() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "attendee",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Signing up:", { ...form, password: "***" });
  };

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute.">
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="fullName">Full name</label>
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
          <label htmlFor="email">Email</label>
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-describedby="password-hint"
            value={form.password}
            onChange={handleChange}
          />
          <span id="password-hint" className="field-hint">8 to 72 characters</span>
        </div>

        <div className="field">
          <span className="label-text">I want to...</span>
          <div className="role-group">
            <button
              type="button"
              className={form.role === "attendee" ? "role-btn active" : "role-btn"}
              aria-pressed={form.role === "attendee"}
              onClick={() => setForm({ ...form, role: "attendee" })}
            >
              Attend events
              <small>Find events and get tickets</small>
            </button>
            <button
              type="button"
              className={form.role === "organizer" ? "role-btn active" : "role-btn"}
              aria-pressed={form.role === "organizer"}
              onClick={() => setForm({ ...form, role: "organizer" })}
            >
              Organize events
              <small>Create events and sell tickets</small>
            </button>
          </div>
        </div>

        <button type="submit" className="btn">
          Create account
        </button>

        <p className="form-note">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default SignUp;
