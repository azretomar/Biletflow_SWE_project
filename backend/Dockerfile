# --- build stage ---
FROM golang:1.26-alpine AS build
WORKDIR /src

# Download modules first so this layer is cached until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api .

# --- runtime stage ---
FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -H -u 10001 app
COPY --from=build /out/api /api
USER app
EXPOSE 8080
# Secrets (DATABASE_URL, JWT_SECRET) come from the environment, never baked in.
CMD ["/api"]
