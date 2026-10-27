import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home";
import SignUp from "./pages/SignUp";
import LogIn from "./pages/LogIn";
import CreateEvent from "./pages/CreateEvent";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEvents from "./pages/admin/AdminEvents";
import AdminEventDetail from "./pages/admin/AdminEventDetail";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminActivations from "./pages/admin/AdminActivations";
import PromoCampaigns from "./pages/organizer/PromoCampaigns";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/create-event" element={<CreateEvent />} />
        <Route path="/organizer/promo" element={<PromoCampaigns />} />

        {/* Platform Admin section. Later only users with role "admin" may open it. */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="events/:id" element={<AdminEventDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="activations" element={<AdminActivations />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
