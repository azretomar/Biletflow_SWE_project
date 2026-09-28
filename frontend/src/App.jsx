import { useState } from "react";
import "./App.css";

function App() {
  const [text, setText] = useState("");

  return (
    <div className="page">
      <h1>Create event</h1>

      <label className="tagline" htmlFor="event-name">
        Event name
      </label>

      <input
        id="event-name"
        className="big-input"
        type="text"
        placeholder="Type something..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <p className="tagline">You typed: {text}</p>
    </div>
  );
}

export default App;