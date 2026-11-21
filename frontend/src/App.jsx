import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import "./App.css";
import "./shared.css";
import Home from "./pages/Home";
import SignUp from "./pages/SignUp";
import LogIn from "./pages/LogIn";
import CreateEvent from "./pages/CreateEvent";
import EventList from "./pages/EventList";
import EventDetail from "./pages/EventDetail";
import Checkout from "./pages/Checkout";
import MyTickets from "./pages/MyTickets";
import TicketView from "./pages/TicketView";
import PrintTicket from "./pages/PrintTicket";
import MyOrders from "./pages/MyOrders";
import NotFound from "./pages/NotFound";
import { VerifyEmail, ForgotPassword, ResetPassword } from "./pages/AccountPages";
import { SupportList, SupportNew, SupportCase } from "./pages/Support";
import TicketTypeForm from "./pages/TicketTypeForm";
import ActivationChecklist from "./pages/ActivationChecklist";
import OrganizerDashboard from "./pages/organizer/OrganizerDashboard";
import EventManagement from "./pages/organizer/EventManagement";
import EditEvent from "./pages/organizer/EditEvent";
import EventOrders from "./pages/organizer/EventOrders";
import OrganizerProfile from "./pages/organizer/OrganizerProfile";
import PromoCampaigns from "./pages/organizer/PromoCampaigns";
import EventAnalytics from "./pages/organizer/EventAnalytics";
import EventHistory from "./pages/organizer/EventHistory";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEvents from "./pages/admin/AdminEvents";
import AdminEventDetail from "./pages/admin/AdminEventDetail";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminActivations from "./pages/admin/AdminActivations";
import RequireAdmin from "./pages/admin/RequireAdmin";
import { AdminSupportList, AdminSupportCase } from "./pages/admin/AdminSupport";
import RequireLogin from "./components/RequireLogin";

// Old registration links now go to Checkout, which handles free and paid tickets
// and promo codes in one place. Chosen ticket quantities are passed along.
function RegisterRedirect() {
  const { id } = useParams();
  const location = useLocation();
  return <Navigate to={`/events/${id}/checkout`} replace state={location.state} />;
}

// Pages for logged-in users, and pages only organizers may open.
const member = (page) => <RequireLogin>{page}</RequireLogin>;
const organizer = (page) => <RequireLogin roles={["organizer"]}>{page}</RequireLogin>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<EventList />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Logged-in attendees (and everyone else who is logged in) */}
        <Route path="/events/:id/checkout" element={member(<Checkout />)} />
        <Route path="/events/:id/register" element={<RegisterRedirect />} />
        <Route path="/my-tickets" element={member(<MyTickets />)} />
        <Route path="/tickets/:id" element={member(<TicketView />)} />
        <Route path="/tickets/:id/print" element={member(<PrintTicket />)} />
        <Route path="/my-orders" element={member(<MyOrders />)} />
        <Route path="/support" element={member(<SupportList />)} />
        <Route path="/support/new" element={member(<SupportNew />)} />
        <Route path="/support/:id" element={member(<SupportCase />)} />

        {/* Organizers */}
        <Route path="/create-event" element={organizer(<CreateEvent />)} />
        <Route path="/organizer/dashboard" element={organizer(<OrganizerDashboard />)} />
        <Route path="/organizer/profile" element={organizer(<OrganizerProfile />)} />
        <Route path="/organizer/promo" element={organizer(<PromoCampaigns />)} />
        <Route path="/organizer/events/:id" element={organizer(<EventManagement />)} />
        <Route path="/organizer/events/:id/edit" element={organizer(<EditEvent />)} />
        <Route path="/organizer/events/:id/ticket-types/new" element={organizer(<TicketTypeForm />)} />
        <Route path="/organizer/events/:id/activation" element={organizer(<ActivationChecklist />)} />
        <Route path="/organizer/events/:id/orders" element={organizer(<EventOrders />)} />
        <Route path="/organizer/events/:id/analytics" element={organizer(<EventAnalytics />)} />
        <Route path="/organizer/events/:id/history" element={organizer(<EventHistory />)} />

        {/* Platform Admin section: only users with role "platform_admin" may open it. */}
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminDashboard />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="events/:id" element={<AdminEventDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="activations" element={<AdminActivations />} />
          <Route path="support" element={<AdminSupportList />} />
          <Route path="support/:id" element={<AdminSupportCase />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
