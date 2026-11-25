package main

import (
	"strings"
	"testing"
	"time"
)

func TestConfirmationContent(t *testing.T) {
	ev := Event{
		Title: "Jazz Night",
		Venue: "Astana Arena",
		Date:  time.Date(2027, 3, 14, 15, 0, 0, 0, time.UTC),
	}
	tickets := []ticketBrief{{ID: "t-111"}, {ID: "t-222"}}

	subject, body := confirmationContent("https://biletflow", ev, "order-9", tickets)

	if subject != "Your tickets for Jazz Night" {
		t.Errorf("subject = %q", subject)
	}
	for _, want := range []string{
		"14 March 2027, 20:00",
		"Astana Arena",
		"order-9",
		"https://biletflow/tickets/t-111",
		"https://biletflow/tickets/t-222",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("body is missing %q:\n%s", want, body)
		}
	}
	if n := strings.Count(body, "/tickets/"); n != 2 {
		t.Errorf("want one link per ticket (2), got %d", n)
	}
}

func TestConfirmationContentNoVenue(t *testing.T) {
	ev := Event{Title: "Online talk", Date: time.Now()}
	_, body := confirmationContent("https://biletflow", ev, "o", []ticketBrief{{ID: "a"}})
	if !strings.Contains(body, "Venue: to be announced") {
		t.Errorf("empty venue should have a fallback:\n%s", body)
	}
}
