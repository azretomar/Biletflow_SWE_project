
const API = (process.argv[2] || process.env.API_URL || 'http://localhost:8080').replace(/\/+$/, '') + '/api';
const DEMO_PASSWORD = 'BiletFlowDemo2026';

const PEOPLE = {
  organizer: { email: 'demo.organizer@biletflow.test', full_name: 'Aruzhan Seitkali', role: 'organizer' },
  staff: { email: 'demo.staff@biletflow.test', full_name: 'Daniyar Staff', role: 'attendee' },
  attendee: { email: 'demo.attendee@biletflow.test', full_name: 'Aigerim Nurlanovna', role: 'attendee' },
  madina: { email: 'demo.madina@biletflow.test', full_name: 'Madina Akhmetova', role: 'attendee' },
  dias: { email: 'demo.dias@biletflow.test', full_name: 'Dias Bekov', role: 'attendee' },
};

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`${method} ${path}: ${res.status} ${data?.error ?? ''}`), { status: res.status });
  return data;
}

async function account(p) {
  try {
    return (await call(null, 'POST', '/auth/signup', { ...p, password: DEMO_PASSWORD })).token;
  } catch (err) {
    if (err.status !== 409) throw err;
    return (await call(null, 'POST', '/auth/login', { email: p.email, password: DEMO_PASSWORD })).token;
  }
}

const EVENTS = [
  {
    key: 'jazz',
    body: {
      title: 'Astana Jazz Night',
      description: 'An evening of live jazz with local bands and a guest quartet from Almaty.',
      category: 'music',
      date: '2026-12-12T19:00:00+05:00',
      ends_at: '2026-12-12T23:00:00+05:00',
      venue: 'Astana Concert Hall',
      venue_address: 'Kabanbay Batyr Ave 33, Astana',
      capacity: 300,
    },
    types: [
      { name: 'Standard', description: 'Seating in the main hall', price: 8000, quantity: 200 },
      { name: 'VIP', description: 'Front rows and a meet & greet', price: 20000, quantity: 40, max_per_order: 4 },
    ],
    paid: true,
  },
  {
    key: 'tech',
    body: {
      title: 'NU Tech Talks: AI in Kazakhstan',
      description: 'Short talks by students and engineers about AI projects in Kazakhstan, then networking.',
      category: 'education',
      date: '2026-12-05T18:00:00+05:00',
      ends_at: '2026-12-05T21:00:00+05:00',
      venue: 'Nazarbayev University, Block C3',
      venue_address: 'Kabanbay Batyr Ave 53, Astana',
      capacity: 150,
    },
    types: [{ name: 'General', description: 'Free entry with registration', price: 0, quantity: 150 }],
  },
  {
    key: 'run',
    body: {
      title: 'Winter Fun Run 5K',
      description: 'A friendly 5 km run around the Esil embankment. Hot tea at the finish.',
      category: 'sports',
      date: '2026-12-20T10:00:00+05:00',
      venue: 'Esil Embankment',
      venue_address: 'Start near Triathlon Park, Astana',
      capacity: 250,
    },
    types: [
      { name: 'Runner', description: 'Bib, medal and tea', price: 5000, quantity: 200, max_per_order: 2 },
      { name: 'Spectator', description: 'Cheer zone at the finish', price: 0, quantity: 50 },
    ],
    paid: true,
  },
  {
    key: 'pitch',
    body: {
      title: 'Student Startup Pitch Night',
      description: 'Ten student teams pitch their startups to a jury of founders and investors.',
      category: 'other',
      date: '2026-12-02T18:30:00+05:00',
      venue: 'Astana Hub',
      venue_address: 'Mangilik El Ave 55/8, Astana',
      capacity: 120,
    },
    types: [{ name: 'Guest', description: 'Free', price: 0, quantity: 120 }],
  },
  {
    key: 'film',
    body: {
      title: 'Winter Film Festival',
      description: 'Short films by Kazakh directors. Programme coming soon.',
      category: 'other',
      date: '2027-01-15T17:00:00+05:00',
      venue: 'Kinopark 7 Keruen',
      capacity: 180,
      status: 'draft',
    },
    types: [{ name: 'Festival pass', description: 'All screenings', price: 0, quantity: 180 }],
  },
];

async function main() {
  console.log(`Seeding ${API}`);
  const org = await account(PEOPLE.organizer);
  await account(PEOPLE.staff);
  const attendee = await account(PEOPLE.attendee);
  const madina = await account(PEOPLE.madina);
  const dias = await account(PEOPLE.dias);

  await call(org, 'PUT', '/organizer/profile', {
    display_name: 'Aruzhan Events',
    bio: 'Concerts, talks and sports events in Astana.',
    contact_email: PEOPLE.organizer.email,
    phone: '+7 701 000 00 00',
    website: 'https://example.com',
    city: 'Astana',
    payout: { holder_name: 'Aruzhan Events LLP', bank_name: 'Demo Bank', iban: 'KZ000000000000000000', bin_iin: '000000000000' },
  });

  const existing = await call(org, 'GET', '/organizer/events');
  const ev = {};
  for (const e of EVENTS) {
    let found = existing.find((x) => x.title === e.body.title);
    if (!found) found = await call(org, 'POST', '/events', e.body);
    const detail = await call(org, 'GET', `/events/${found.id}`);
    const types = {};
    for (const tt of e.types) {
      types[tt.name] =
        detail.ticket_types.find((x) => x.name === tt.name) ?? (await call(org, 'POST', `/events/${found.id}/ticket-types`, tt));
    }
    if (e.paid && detail.paid_sales === 'none') {
      for (const step of ['identity', 'payout', 'fee', 'terms', 'activate']) {
        await call(org, 'POST', `/organizer/events/${found.id}/activation/${step}`);
      }
    }
    ev[e.key] = { id: found.id, types };
    console.log(`  event: ${e.body.title}${e.body.status === 'draft' ? ' (draft)' : ''}`);
  }

  for (const key of ['jazz', 'tech']) {
    const staff = await call(org, 'GET', `/events/${ev[key].id}/staff`);
    if (!staff.some((s) => s.email === PEOPLE.staff.email)) {
      await call(org, 'POST', `/events/${ev[key].id}/staff`, { email: PEOPLE.staff.email });
    }
  }

  const campaigns = await call(org, 'GET', '/organizer/campaigns');
  let promo = campaigns.find((c) => c.name === 'Winter sale');
  if (!promo) {
    promo = await call(org, 'POST', '/organizer/campaigns', {
      event_id: ev.jazz.id,
      name: 'Winter sale',
      discount_type: 'percent',
      amount: 20,
      starts_at: new Date().toISOString(),
      ends_at: '2026-12-12T18:00:00+05:00',
      max_redemptions: 100,
    });
  }

  const hasTickets = async (token, eventId) => (await call(token, 'GET', '/my-tickets')).some((t) => t.event.id === eventId);
  const buy = (token, key, items, promoCode = '') =>
    call(token, 'POST', '/orders/checkout', {
      event_id: ev[key].id,
      items: items.map(([name, quantity]) => ({ ticket_type_id: ev[key].types[name].id, quantity })),
      promo_code: promoCode,
      simulate: 'success',
    });

  if (!(await hasTickets(attendee, ev.tech.id))) {
    await call(attendee, 'POST', `/events/${ev.tech.id}/register`, { ticket_type_id: ev.tech.types.General.id, quantity: 2 });
  }
  if (!(await hasTickets(attendee, ev.jazz.id))) await buy(attendee, 'jazz', [['Standard', 2]], promo.code);
  if (!(await hasTickets(madina, ev.jazz.id))) await buy(madina, 'jazz', [['VIP', 1]]);
  if (!(await hasTickets(madina, ev.tech.id))) {
    await call(madina, 'POST', `/events/${ev.tech.id}/register`, { ticket_type_id: ev.tech.types.General.id, quantity: 1 });
  }
  if (!(await hasTickets(dias, ev.run.id))) await buy(dias, 'run', [['Runner', 1], ['Spectator', 1]]);
  if (!(await hasTickets(dias, ev.pitch.id))) {
    await call(dias, 'POST', `/events/${ev.pitch.id}/register`, { ticket_type_id: ev.pitch.types.Guest.id, quantity: 1 });
  }
  if (!(await hasTickets(dias, ev.jazz.id))) {
    const order = await buy(dias, 'jazz', [['Standard', 1]]);
    await call(org, 'POST', `/organizer/orders/${order.order_id}/refund`, { reason: 'Dias cannot attend (demo refund)' });
  }

  const staff = await call(null, 'POST', '/auth/login', { email: PEOPLE.staff.email, password: DEMO_PASSWORD });
  const madinaTech = (await call(madina, 'GET', '/my-tickets')).find((t) => t.event.id === ev.tech.id);
  if (madinaTech?.status === 'valid') {
    await call(staff.token, 'POST', '/checkin', { event_id: ev.tech.id, qr_code: madinaTech.qr_code });
  }

  const cases = await call(attendee, 'GET', '/support/cases');
  if (!cases.some((c) => c.subject === 'Is there parking at the concert hall?')) {
    const c = await call(attendee, 'POST', '/support/cases', {
      category: 'event',
      subject: 'Is there parking at the concert hall?',
      message: 'Hello! I bought two tickets for Astana Jazz Night. Is there parking near the hall?',
      context: { type: 'event', id: ev.jazz.id },
    });
    await call(org, 'POST', `/organizer/support/cases/${c.id}/messages`, {
      body: 'Hi Aigerim! Yes, there is free parking behind the hall. See you there!',
    });
  }

  console.log(`\nDone. Promo code: ${promo.code}`);
  console.log('Accounts (password: DEMO_PASSWORD in this file):');
  for (const [who, p] of Object.entries(PEOPLE)) console.log(`  ${who.padEnd(9)} ${p.email}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
