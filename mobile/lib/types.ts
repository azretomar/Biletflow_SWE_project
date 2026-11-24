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
