import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";

function LogIn() {
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Logging in:", { ...form, password: "***" });
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to see your tickets and events.">
      <form className="form" onSubmit={handleSubmit}>
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
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange}
          />
        </div>

        <button type="submit" className="btn">
          Log in
        </button>

        <p className="form-note">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default LogIn;
