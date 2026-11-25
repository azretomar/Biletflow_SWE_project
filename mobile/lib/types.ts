// Shapes of the backend's JSON responses (see backend/*.go).

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

// POST /api/checkin/undo
export type UndoCheckinResponse = {
  ticket_id: string;
  status: 'valid';
};

// ---- Package 1-3: orders ----

// GET /api/my-orders
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

// ---- Package 2-3: support, analytics, history ----

export type SupportCategory = 'tickets' | 'payment' | 'event' | 'account' | 'organizer' | 'other';
export type CaseStatus = 'open' | 'in_progress' | 'waiting' | 'resolved';
export type CaseContext = { type: 'event' | 'order' | 'ticket'; id: string };

// GET /api/support/cases (list) and GET /api/support/cases/{id} (with messages)
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

// GET /api/organizer/events/{id}/analytics
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

// GET /api/organizer/events/{id}/history
export type HistoryType = 'event' | 'tickets' | 'orders' | 'checkin' | 'payments' | 'support';

export type HistoryEntry = {
  id: string;
  at: string;
  actor: string;
  // One of HistoryType; older audit categories may appear too, they count as "event".
  type: string;
  message: string;
};

export type HistoryResponse = {
  event: { title: string; date: string };
  activity: HistoryEntry[];
};
