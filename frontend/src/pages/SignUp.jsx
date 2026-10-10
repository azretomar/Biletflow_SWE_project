import { useState } from "react";
import { Link } from "react-router-dom";

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
    <div className="page narrow">
      <h1>Sign up</h1>

      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
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
            value={form.password}
            onChange={handleChange}
          />
        </div>

        <div className="field">
          <span className="label-text">I am a...</span>
          <div className="role-group">
            <button
              type="button"
              className={form.role === "attendee" ? "role-btn active" : "role-btn"}
              onClick={() => setForm({ ...form, role: "attendee" })}
            >
              Attendee
            </button>
            <button
              type="button"
              className={form.role === "organizer" ? "role-btn active" : "role-btn"}
              onClick={() => setForm({ ...form, role: "organizer" })}
            >
              Organizer
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
    </div>
  );
}

export default SignUp;