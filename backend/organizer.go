package main

import (
	"net/http"
)

// Organizer-only views of the organizer's own data.
func (s *Server) registerOrganizerRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/organizer/events",
		s.requireAuth(s.requireRole("organizer")(http.HandlerFunc(s.handleOrganizerEvents))))
}

type organizerEvent struct {
	Event
	MinPrice    int `json:"min_price"`
	TicketTypes int `json:"ticket_type_count"`
	TotalQty    int `json:"total_quantity"`
	Sold        int `json:"sold"`
}

// GET /api/organizer/events
// Events created by the logged-in organizer, soonest first, with how many tickets
// were issued (sum of quantity - quantity_left over the event's ticket types).
func (s *Server) handleOrganizerEvents(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `
		SELECT e.id, e.title, e.description, e.date, e.venue, e.capacity, e.category,
		       e.image_url, u.full_name, e.registration_closes_at,
		       COALESCE(MIN(t.price), 0),
		       COUNT(t.id),
		       COALESCE(SUM(t.quantity), 0),
		       COALESCE(SUM(t.quantity - t.quantity_left), 0)
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		LEFT JOIN ticket_types t ON t.event_id = e.id
		WHERE e.organizer_id = $1
		GROUP BY e.id, u.full_name
		ORDER BY e.date ASC`, claims.Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	list := []organizerEvent{}
	for rows.Next() {
		var it organizerEvent
		if err := rows.Scan(&it.ID, &it.Title, &it.Description, &it.Date, &it.Venue,
			&it.Capacity, &it.Category, &it.ImageURL, &it.OrganizerName,
			&it.RegistrationCloses, &it.MinPrice, &it.TicketTypes, &it.TotalQty, &it.Sold); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		list = append(list, it)
	}
	if rows.Err() != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, list)
}
