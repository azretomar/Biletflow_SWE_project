import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="page narrow">
      <h1>BiletFlow</h1>

      <div className="home-options">
        <div className="home-option">
          <p>New here? Create an account.</p>
          <Link to="/signup" className="btn">
            Sign up
          </Link>
        </div>

        <div className="home-option">
          <p>Already have an account? Log in.</p>
          <Link to="/login" className="btn">
            Log in
          </Link>
        </div>

        <div className="home-option">
          <p>Organizing something? Create an event.</p>
          <Link to="/create-event" className="btn">
            Create event
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home;