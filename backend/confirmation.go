package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

var kzTime = time.FixedZone("UTC+5", 5*60*60)

func confirmationContent(appURL string, ev Event, orderID string, tickets []ticketBrief) (subject, body string) {
	subject = "Your tickets for " + ev.Title

	venue := strings.TrimSpace(ev.Venue)
	if venue == "" {
		venue = "to be announced"
	}

	var b strings.Builder
	b.WriteString("Thank you for your order on BiletFlow!\n\n")
	fmt.Fprintf(&b, "Event: %s\n", ev.Title)
	fmt.Fprintf(&b, "Date: %s\n", ev.Date.In(kzTime).Format("2 January 2006, 15:04 (UTC+5)"))
	fmt.Fprintf(&b, "Venue: %s\n", venue)
	fmt.Fprintf(&b, "Order: %s\n\n", orderID)
	if len(tickets) == 1 {
		b.WriteString("Your ticket:\n")
	} else {
		fmt.Fprintf(&b, "Your %d tickets:\n", len(tickets))
	}
	for _, t := range tickets {
		fmt.Fprintf(&b, "  %s/tickets/%s\n", appURL, t.ID)
	}
	return subject, b.String()
}

func (s *Server) sendOrderConfirmation(ctx context.Context, userID string, ev Event, orderID string, tickets []ticketBrief) {
	var email string
	if err := s.db.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		log.Printf("confirmation email: load buyer %s: %v", userID, err)
		return
	}
	subject, body := confirmationContent(s.cfg.AppURL, ev, orderID, tickets)
	sendEmail(email, subject, body)
}
