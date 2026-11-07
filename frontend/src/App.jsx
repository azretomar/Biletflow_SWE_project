import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import "./shared.css";
import Home from "./pages/Home";
import SignUp from "./pages/SignUp";
import LogIn from "./pages/LogIn";
import CreateEvent from "./pages/CreateEvent";
import EventList from "./pages/EventList";
import TicketTypeForm from "./pages/TicketTypeForm";
import ActivationChecklist from "./pages/ActivationChecklist";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEvents from "./pages/admin/AdminEvents";
import AdminEventDetail from "./pages/admin/AdminEventDetail";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminActivations from "./pages/admin/AdminActivations";
import PromoCampaigns from "./pages/organizer/PromoCampaigns";
import EventAnalytics from "./pages/organizer/EventAnalytics";
import EventHistory from "./pages/organizer/EventHistory";
import OrganizerDashboard from "./pages/organizer/OrganizerDashboard";
import EditEvent from "./pages/organizer/EditEvent";
import EventManagement from "./pages/organizer/EventManagement";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<EventList />} />
        <Route path="/organizer/events/:id/ticket-types/new" element={<TicketTypeForm />} />
        <Route path="/organizer/events/:id/activation" element={<ActivationChecklist />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/create-event" element={<CreateEvent />} />
        <Route path="/organizer/promo" element={<PromoCampaigns />} />
        <Route path="/organizer/events/:id/analytics" element={<EventAnalytics />} />
        <Route path="/organizer/events/:id/history" element={<EventHistory />} />
        <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
        <Route path="/organizer/events/:id/edit" element={<EditEvent />} />   
        <Route path="/organizer/events/:id" element={<EventManagement />} />

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
