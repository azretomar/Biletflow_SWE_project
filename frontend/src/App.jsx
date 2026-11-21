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
import RequireAdmin from "./pages/admin/RequireAdmin";
import { AdminSupportList, AdminSupportCase } from "./pages/admin/AdminSupport";
import RequireLogin from "./components/RequireLogin";
import PrintTicket from "./pages/PrintTicket";
import Checkout from "./pages/Checkout";
import MyOrders from "./pages/MyOrders";
import EventOrders from "./pages/organizer/EventOrders";
import OrganizerProfile from "./pages/organizer/OrganizerProfile";
import { VerifyEmail, ForgotPassword, ResetPassword } from "./pages/AccountPages";
import { SupportList, SupportNew, SupportCase } from "./pages/Support";
import PromoCampaigns from "./pages/organizer/PromoCampaigns";
import EventAnalytics from "./pages/organizer/EventAnalytics";
import EventHistory from "./pages/organizer/EventHistory";
import OrganizerDashboard from "./pages/organizer/OrganizerDashboard";
import EditEvent from "./pages/organizer/EditEvent";
import EventManagement from "./pages/organizer/EventManagement";
import MyTickets from "./pages/MyTickets";
import TicketView from "./pages/TicketView";   
import EventDetail from "./pages/EventDetail";
import Registration from "./pages/Registration";

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
        <Route path="/create-event" element={<RequireLogin roles={["organizer"]}><CreateEvent /></RequireLogin>} />
        <Route path="/organizer/promo" element={<PromoCampaigns />} />
        <Route path="/organizer/events/:id/analytics" element={<EventAnalytics />} />
        <Route path="/organizer/events/:id/history" element={<EventHistory />} />
        <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
        <Route path="/organizer/events/:id/edit" element={<EditEvent />} />   
        <Route path="/organizer/events/:id" element={<EventManagement />} />   
        <Route path="/my-tickets" element={<MyTickets />} />
        <Route path="/tickets/:id" element={<TicketView />} />
        <Route path="/tickets/:id/print" element={<PrintTicket />} />
        <Route path="/events/:id/checkout" element={<Checkout />} />
        <Route path="/my-orders" element={<RequireLogin><MyOrders /></RequireLogin>} />
        <Route path="/organizer/events/:id/orders" element={<RequireLogin roles={["organizer"]}><EventOrders /></RequireLogin>} />
        <Route path="/organizer/profile" element={<RequireLogin roles={["organizer"]}><OrganizerProfile /></RequireLogin>} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/support" element={<RequireLogin><SupportList /></RequireLogin>} />
        <Route path="/support/new" element={<RequireLogin><SupportNew /></RequireLogin>} />
        <Route path="/support/:id" element={<RequireLogin><SupportCase /></RequireLogin>} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/register" element={<Registration />} />
        
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
