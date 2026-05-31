FROM golang:1.21-alpine

WORKDIR /app

COPY go.mod ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest

WORKDIR /app

COPY --from=0 /app/main .
COPY --from=0 /app/.env.example ./.env

EXPOSE 8080

CMD ["./main"]
