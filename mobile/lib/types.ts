export type Role = 'attendee' | 'organizer' | 'event_admin' | 'platform_admin';

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  email_verified: boolean;
  created_at: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  ends_at: string | null;
  venue: string;
  venue_address: string;
  capacity: number;
  category: string;
  image_url: string;
  organizer_id: string;
  organizer_name: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  status: 'draft' | 'published' | 'cancelled';
  visibility: 'public' | 'unlisted' | 'private';
  paid_sales: 'none' | 'active' | 'stopped';
  suspended: boolean;
};

export type EventListItem = Event & { min_price: number };

export type TicketType = {
  id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  quantity_left: number;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
  max_per_order: number | null;
  hidden: boolean;
};

export type EventDetail = Event & { ticket_types: TicketType[] };

export type TicketStatus = 'valid' | 'checked_in' | 'cancelled' | 'refunded';

export type Ticket = {
  id: string;
  qr_code: string;
  status: TicketStatus;
  event: { id: string; title: string; date: string; venue: string; image_url: string; status: string };
  ticket_type: { name: string; price: number };
  checked_in_at?: string;
};

export type RegisterResponse = {
  order_id: string;
  tickets: { id: string; qr_code: string; status: TicketStatus }[];
};

export type StaffEvent = {
  id: string;
  title: string;
  date: string;
  venue: string;
  access: 'organizer' | 'staff';
};

export type StaffMember = {
  user_id: string;
  email: string;
  full_name: string;
  assigned_at: string;
};

export type CheckinResult = {
  result: 'valid' | 'already_used' | 'invalid';
  ticket: (Ticket & { attendee_name: string }) | null;
};

export type UndoCheckinResponse = {
  ticket_id: string;
  status: 'valid';
};

export type OrderStatus = 'paid' | 'free' | 'failed' | 'cancelled' | 'refunded';

export type Order = {
  id: string;
  created_at: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  promo_code: string;
  event: { id: string; title: string; date: string };
  items: { ticket_type: string; quantity: number; price: number }[];
  tickets: { id: string; status: TicketStatus }[];
};

export type SupportCategory = 'tickets' | 'payment' | 'event' | 'account' | 'organizer' | 'other';
export type CaseStatus = 'open' | 'in_progress' | 'waiting' | 'resolved';
export type CaseContext = { type: 'event' | 'order' | 'ticket'; id: string };

export type SupportMessage = {
  id: number;
  author_name: string;
  author_role: Role;
  body: string;
  created_at: string;
};

export type SupportCase = {
  id: number;
  subject: string;
  status: CaseStatus;
  category: SupportCategory;
  context: CaseContext | null;
  created_at: string;
  updated_at: string;
  assignee: { id?: string; full_name: string } | null;
  messages?: SupportMessage[];
};

export type Analytics = {
  event: { title: string; starts_at: string; venue: string; status: string };
  capacity: number;
  sold: number;
  checked_in: number;
  revenue: { gross: number; discounts: number; refunds: number; net: number };
  sales_by_day: { date: string; tickets: number; revenue: number }[];
  by_ticket_type: { name: string; price: number; quantity: number; sold: number; revenue: number }[];
  promo: { code: string; redemptions: number; discount_total: number }[];
};

export type HistoryType = 'event' | 'tickets' | 'orders' | 'checkin' | 'payments' | 'support';

export type HistoryEntry = {
  id: string;
  at: string;
  actor: string;
  type: string;
  message: string;
};

export type HistoryResponse = {
  event: { title: string; date: string };
  activity: HistoryEntry[];
};

export type OrganizerEvent = EventListItem & {
  ticket_type_count: number;
  total_quantity: number;
  sold: number;
};

export type Attendee = {
  ticket_id: string;
  order_id: string;
  full_name: string;
  email: string;
  ticket_type: string;
  status: TicketStatus;
  checked_in_at: string | null;
};

export type OrganizerOrder = Order & { attendee?: { full_name: string; email: string } };

export type Activation = {
  identity_verified: boolean;
  payout_connected: boolean;
  fee_paid: boolean;
  terms_accepted: boolean;
  activated: boolean;
  paid_sales: 'none' | 'active' | 'stopped';
  fee_kzt: number;
  requested_at: string | null;
  has_paid_ticket_type: boolean;
};

export type OrganizerProfile = {
  display_name: string;
  bio: string;
  contact_email: string;
  phone: string;
  website: string;
  city: string;
  payout: { holder_name: string; bank_name: string; iban: string; bin_iin: string };
};

export type Campaign = {
  id: string;
  event_id: string | null;
  event_title: string;
  name: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  amount: number;
  starts_at: string;
  ends_at: string;
  max_redemptions: number;
  redemptions: number;
  disabled: boolean;
  qr_url: string;
  created_at: string;
};

export type PromoValidation = { code: string; discount_type: 'percent' | 'fixed'; amount: number };

export type CheckoutResponse = {
  order_id: string;
  status: 'paid' | 'free' | 'failed';
  subtotal: number;
  discount: number;
  total: number;
  tickets: { id: string; qr_code: string; status: TicketStatus }[];
};

export type OrganizerCase = SupportCase & {
  event?: { id: string; title: string };
  requester?: { id?: string; full_name: string; email?: string };
};

export type StaffAttendees = {
  registered: number;
  checked_in: number;
  attendees: {
    ticket_id: string;
    qr_code: string;
    full_name: string;
    email: string;
    ticket_type: string;
    status: TicketStatus;
    checked_in_at: string | null;
  }[];
};
