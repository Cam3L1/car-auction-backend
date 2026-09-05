# MazadJo — Backend API

REST API for **MazadJo**, an online car auction platform. Built with **Node.js, Express.js and PostgreSQL** for the *Special Topics in Computer Science 1* full-stack assignment.

> Frontend repository: [car-auction-frontend](https://github.com/Cam3L1/car-auction-frontend)

---

## 📚 Table of Contents

1. [Features](#-features)
2. [Tech Stack](#-tech-stack)
3. [Setup](#-setup)
4. [Environment Variables](#-environment-variables)
5. [API Reference](#-api-reference)
6. [Bidding Rules (Business Logic)](#-bidding-rules-business-logic)
7. [Database Schema (ERD)](#-database-schema-erd)
8. [Project Structure](#-project-structure)
9. [Testing](#-testing)
10. [Troubleshooting](#-troubleshooting)
11. [Deployment](#-deployment)
12. [Git Workflow](#-git-workflow)

---

## ✨ Features

- **Stateless JWT authentication** — token issued on login/registration, verified by middleware on every protected route
- **Role-based access control** — `normal` users buy and sell, `admin` users moderate the platform
- **Car auction listings** — create listings with images and a server-stored countdown `end_time`
- **Bidding engine** — server-side validation: higher than current price, minimum increment of 100 JOD, timer enforcement, no bidding on your own listing
- **Automatic auction finalization** — expired auctions close automatically and the highest bidder becomes the winner
- **Admin moderation** — delete fraudulent bids (price reverts automatically), cancel or delete non-compliant listings
- **Immutable bid history** — every bid is inserted chronologically and never updated

## 🛠 Tech Stack

| Technology      | Purpose                                    |
| --------------- | ------------------------------------------ |
| Node.js         | JavaScript runtime                          |
| Express.js      | Web framework + REST routing                |
| PostgreSQL      | Relational database (`pg` driver)           |
| jsonwebtoken    | Stateless JWT authentication                |
| dotenv          | Environment configuration                   |
| cors            | Allow cross-origin requests from the React app |
| morgan          | Request logging                             |
| nodemon         | Auto-restart during development             |

## 🚀 Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (any modern version works)

### 1. Clone and install

```bash
git clone https://github.com/Cam3L1/car-auction-backend.git
cd car-auction-backend
npm install
```

### 2. Create the database

```bash
# using psql (or run schema.sql inside pgAdmin)
createdb car_auction
psql -d car_auction -f schema.sql
```

`schema.sql` creates the three tables **and inserts realistic seed data**
(5 users, 8 auction listings, 16 bids). It is idempotent: it drops and
recreates the tables, so you can re-run it any time to reset the demo data.

### 3. Configure the environment

```bash
cp .env.example .env
# then edit .env and set your own values
```

### 4. Start the server

```bash
# development (auto-restarts on file changes)
npm run dev

# production
npm start
```

The API is now available at `http://localhost:5001`. You should see:

```
MazadJo API is running
```

### Seed accounts

| Role  | Email               | Password    |
| ----- | ------------------- | ----------- |
| admin | `admin@carbid.com`  | `admin123`  |
| user  | `sara@example.com`  | `password123` |
| user  | `omar@example.com`  | `password123` |
| user  | `lina@example.com`  | `password123` |
| user  | `khaled@example.com`| `password123` |

## 🔑 Environment Variables

| Variable       | Description                                        | Example                                   |
| -------------- | -------------------------------------------------- | ----------------------------------------- |
| `PORT`         | Port the API listens on                            | `5001`                                    |
| `DATABASE_URL` | PostgreSQL connection string                       | `postgres://user@localhost:5432/car_auction` |
| `JWT_SECRET`   | Secret used to sign and verify JWTs                | `a_long_random_string`                    |

> ⚠️ On macOS the AirPlay Receiver occupies port **5000**, so the API runs on **5001**.
> `.env` is git-ignored — never commit secrets.

## 📡 API Reference

Base URL: `http://localhost:5001/api`

**Conventions**

- All request/response bodies are JSON.
- Authenticated routes require the header `Authorization: Bearer <token>`.
- `token` is returned by `/auth/register` and `/auth/login` and expires after **1 hour**.
- Prices are `NUMERIC(12,2)` and serialized as JSON numbers (e.g. `12800`).
- Timestamps are ISO 8601 UTC strings.

### POST `/auth/register`

Creates a new **normal** user and returns a JWT.

**Body**

```json
{
  "username": "jordan_driver",
  "email": "jordan@example.com",
  "password": "password123"
}
```

**Responses**

| Code | Meaning                          |
| ---- | -------------------------------- |
| 201  | Account created                  |
| 400  | Missing fields / duplicate username or email |

```json
{
  "message": "Account created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 6, "username": "jordan_driver", "email": "jordan@example.com", "role": "normal" }
}
```

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"jordan_driver","email":"jordan@example.com","password":"password123"}'
```

### POST `/auth/login`

Verifies credentials and returns a JWT.

**Body**

```json
{ "email": "sara@example.com", "password": "password123" }
```

**Responses**: `200` → token + user · `401` → invalid credentials (same message for a
wrong password and an unknown email, so account enumeration is avoided).

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sara@example.com","password":"password123"}'
```

### GET `/cars`

Public. Returns **active** auctions ordered by ending soonest.

**Query parameters**

| Param    | Description                                          |
| -------- | ---------------------------------------------------- |
| `q`      | Searches `title`, `make` and `model` (case-insensitive) |
| `make`   | Exact make filter (e.g. `make=Toyota`)               |
| `status` | `active` (default) · `ended` · `cancelled` · `all`   |

```bash
curl "http://localhost:5001/api/cars?q=tesla"
curl "http://localhost:5001/api/cars?make=BMW"
curl "http://localhost:5001/api/cars?status=all"
```

```json
[
  {
    "id": 5,
    "user_id": 2,
    "title": "Mercedes C200 2022 - AMG Line",
    "make": "Mercedes-Benz",
    "model": "C200",
    "year": 2022,
    "mileage": 35000,
    "description": "Elegant C200 with AMG line package...",
    "image_url": "/images/car-5-mercedes-c200.jpg",
    "starting_price": 33000,
    "current_price": 33800,
    "end_time": "2026-09-05T23:15:30.315Z",
    "status": "active",
    "created_at": "2026-09-05T18:15:30.315Z",
    "seller": "sara_k",
    "bid_count": 2
  }
]
```

### GET `/cars/:id`

Public. Returns the car details together with its full, immutable,
chronological bid history, and the winner when the auction has ended.

```bash
curl http://localhost:5001/api/cars/6
```

```json
{
  "car": { "...": "same shape as the list above, plus description" },
  "bids": [
    { "id": 12, "amount": 20400, "created_at": "2026-09-03T14:15:30.315Z",
      "bidder": "lina_m", "bidder_id": 4 }
  ],
  "winner": "lina_m"
}
```

**Responses**: `200` · `404` car not found.

### POST `/cars`

**Auth: normal user.** Creates an active auction listing.

**Body**

```json
{
  "title": "Toyota Corolla 2020 - Full Option",
  "make": "Toyota",
  "model": "Corolla",
  "year": 2020,
  "mileage": 30000,
  "description": "Well maintained, service history available.",
  "image_url": "https://example.com/corolla.jpg",
  "starting_price": 10000,
  "end_time": "2026-09-12T00:00:00.000Z"
}
```

**Validation**: all fields required · `starting_price > 0` · `end_time` must be in
the future.

**Responses**: `201` → created car · `400` missing/invalid fields · `401` no token ·
`403` not a normal user.

```bash
curl -X POST http://localhost:5001/api/cars \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "title":"Toyota Corolla 2020 - Full Option", "make":"Toyota", "model":"Corolla",
        "year":2020, "mileage":30000, "description":"Well maintained.",
        "image_url":"https://example.com/corolla.jpg", "starting_price":10000,
        "end_time":"2026-09-12T00:00:00.000Z" }'
```

### POST `/cars/:id/bids`

**Auth: normal user, non-owner.** Places a bid. See
[Bidding Rules](#-bidding-rules-business-logic) for the full validation logic.

**Body**

```json
{ "amount": 13000 }
```

**Responses**

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 201  | Bid accepted; car's `current_price` updated                    |
| 400  | Rule violation (price, increment, status, timer)               |
| 401  | No/invalid token                                               |
| 403  | Admin, or the listing owner                                    |
| 404  | Car not found                                                  |

```bash
curl -X POST http://localhost:5001/api/cars/1/bids \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 13000}'
```

### GET `/users/profile`

**Auth: any logged-in user.** Returns the profile dashboard data.

```json
{
  "user": { "id": 2, "username": "sara_k", "role": "normal" },
  "sellerCars": [
    { "id": 1, "title": "Toyota Camry 2019 - Full Option", "status": "active",
      "current_price": 12800, "highest_bid": 12800, "bid_count": 3, "end_time": "..." }
  ],
  "bidderCars": [
    { "id": 3, "title": "Tesla Model 3 2022 - Long Range", "status": "active",
      "my_highest_bid": 31000, "top_bidder_id": 3 }
  ]
}
```

- **sellerCars**: every listing the user created (seller view)
- **bidderCars**: every car the user bid on, with their own highest bid and the
  current leading bidder (`top_bidder_id`) — the frontend uses these to highlight
  "You are the highest bidder" and "🏆 You won"

```bash
curl http://localhost:5001/api/users/profile -H "Authorization: Bearer $TOKEN"
```

### GET `/admin/cars`

**Auth: admin.** All auctions regardless of status (platform monitoring).

```bash
curl http://localhost:5001/api/admin/cars -H "Authorization: Bearer $ADMIN_TOKEN"
```

### GET `/admin/bids`

**Auth: admin.** Platform-wide bidding log, newest first, joined with the car
title and bidder username.

```bash
curl http://localhost:5001/api/admin/bids -H "Authorization: Bearer $ADMIN_TOKEN"
```

### DELETE `/admin/bids/:bidId`

**Auth: admin.** Deletes an invalid/fraudulent bid. If it was the current highest
bid, the car's `current_price` reverts to the previous highest bid — or back to
the starting price when no other bids exist.

```json
{ "message": "Bid deleted and current price reverted",
  "deleted": { "id": 8, "car_id": 5, "user_id": 4, "amount": 33800, "created_at": "..." },
  "newCurrentPrice": 33500 }
```

**Responses**: `200` · `404` bid not found.

```bash
curl -X DELETE http://localhost:5001/api/admin/bids/8 -H "Authorization: Bearer $ADMIN_TOKEN"
```

### PUT `/admin/cars/:id/cancel`

**Auth: admin.** Cancels a non-compliant listing: **all associated bids are
voided** and the price resets to the starting price.

```bash
curl -X PUT http://localhost:5001/api/admin/cars/4/cancel -H "Authorization: Bearer $ADMIN_TOKEN"
```

### DELETE `/admin/cars/:id`

**Auth: admin.** Removes a listing entirely. Its bids disappear automatically
thanks to `ON DELETE CASCADE`.

```bash
curl -X DELETE http://localhost:5001/api/admin/cars/8 -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Error codes summary

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 400  | Invalid payload or business-rule violation     |
| 401  | Missing, invalid or expired JWT                |
| 403  | Wrong role (e.g. normal user on an admin route, admin creating listings, owner bidding on own car) |
| 404  | Resource not found                             |
| 500  | Unexpected server error (global error handler) |

## ⚖️ Bidding Rules (Business Logic)

Every bid is validated server-side in `POST /cars/:id/bids`, in order:

1. **Authentication** — the request must carry a valid JWT (`401` otherwise).
2. **Role** — only `normal` users may bid; admins get `403`.
3. **Ownership** — you cannot bid on your own listing (`403`).
4. **Status** — the auction must be `active`; `ended`/`cancelled` auctions return `400`.
5. **Timer enforcement** — bids after `end_time` (countdown zero) are rejected (`400`).
6. **Strictly higher** — the bid must be greater than the current price (`400`).
7. **Minimum increment** — the bid must add at least **100 JOD** on top of the
   current price (`400`).

On success the bid is inserted (history is **immutable** — bids are never
updated) and the car's `current_price` follows the latest accepted bid.

**Winner determination**: when an auction's `end_time` passes, the shared
`finalizeExpiredAuctions()` helper (run before every read) transitions the status
to `ended`. The winner is simply the highest (chronologically last) bidder.

## 🗄 Database Schema (ERD)

```
┌──────────────┐        ┌─────────────────────┐        ┌──────────────┐
│    users     │ 1    n │        cars         │ 1    n │     bids     │
├──────────────┤────────├─────────────────────┤────────├──────────────┤
│ id (PK)      │        │ id (PK)             │        │ id (PK)      │
│ username UQ  │        │ user_id (FK) ───────┼─┐      │ car_id (FK)  │
│ email UQ     │        │ title               │ └──────┤  ON DELETE   │
│ password_hash│        │ make, model, year   │        │   CASCADE    │
│ role         │        │ mileage, description│        │ user_id (FK) │
│ created_at   │        │ image_url           │        │ amount       │
└──────────────┘        │ starting_price      │        │ created_at   │
                        │ current_price       │        └──────────────┘
                        │ end_time            │
                        │ status              │  status ∈ (active, ended, cancelled)
                        │ created_at          │
                        └─────────────────────┘
```

- **Integrity**: PKs on every table, FKs to `users`/`cars`, `ON DELETE CASCADE`
  on `bids.car_id`, `CHECK` constraints on `role` and `status`, `UNIQUE` on
  `username`/`email`.
- **Types**: prices are `NUMERIC(12,2)` (exact currency math), timers are
  `TIMESTAMPTZ` (time-zone aware), `current_price` is maintained by the API.

Full DDL + seed data: [`schema.sql`](schema.sql)

## 📁 Project Structure

```
car-auction-backend/
├── server.js              # Express app: middleware + routers + error handler
├── db.js                  # PostgreSQL client (pg), NUMERIC → number parsing
├── schema.sql             # Database schema + seed data
├── .env.example           # Environment template (PORT, DATABASE_URL, JWT_SECRET)
├── routes/
│   ├── auth.js            # POST /api/auth/register, /api/auth/login
│   ├── cars.js            # listings + bid placement
│   ├── users.js           # profile dashboard
│   └── admin.js           # admin moderation endpoints
├── middleware/
│   ├── auth.js            # JWT verification (attaches req.user)
│   └── adminAuth.js       # role authorization (admin only)
└── utils/
    ├── password.js        # scrypt password hashing (Node built-in crypto)
    └── auctions.js        # auto-finalize expired auctions
```

**Architecture notes**

- **Separation of concerns** — one router file per resource; middleware handles
  cross-cutting concerns (auth, role checks).
- **DRY** — the JWT creation, password hashing and auction finalization logic
  each live in exactly one place.
- **Error handling** — Express 5 forwards rejected async handlers to the global
  JSON error handler in `server.js`, so the API never returns an HTML error page.
- **Security** — passwords are salted + hashed with `scrypt` (never stored in
  plain text), SQL uses parameterized queries (`$1, $2...`) so user input can
  never be injected into a query.

## 🧪 Testing

### Postman

Import [`postman/CarBid.postman_collection.json`](postman/CarBid.postman_collection.json)
into Postman. The collection:

- stores the JWT in a `token` variable automatically after login/register
- includes example bodies for every endpoint
- ships inline tests (status codes, response shapes) for the key flows

Recommended manual flow:

1. `Auth > Login` (as `sara@example.com`) → token is saved
2. `Cars > List active auctions`
3. `Cars > Place bid - below min increment` → expect `400`
4. `Cars > Place bid` → expect `201`
5. `Admin > Login as admin` → re-run admin folder requests

### Validation coverage

The routes were validated against every required behaviour:

- register/login flows (201/200/400/401) and duplicate accounts
- search `q`, `make` filter and `status` browsing
- all five bid rejection rules + a successful bid updating `current_price`
- profile seller/bidder views
- deleting the highest bid → price reverts to the previous highest
- cancelling a listing → bids voided, price reset

## 🔧 Troubleshooting

| Symptom | Cause / Fix |
| ------- | ----------- |
| `Failed to connect to the database` on startup | PostgreSQL is not running (`brew services start postgresql@18`) or `DATABASE_URL` is wrong |
| Server starts but port is unreachable / wrong responses | On macOS, port 5000 belongs to AirPlay — use `PORT=5001` (default) |
| `401 Invalid or expired token` after a while | JWTs expire after 1 hour — log in again to get a fresh token |
| `403 Admin access only` | Your account's `role` is `normal` — log in as `admin@carbid.com` |
| `400 Missing required fields` | Every listing field is required — check the exact list in the response message |
| Bid rejected with `400` | See the [bidding rules](#-bidding-rules-business-logic) — the message states which rule failed |
| Want a clean demo state | Re-run `psql -d car_auction -f schema.sql` — it drops and reseeds everything |

## 🚢 Deployment

The API is a plain Express app and can be deployed to any Node.js host:

1. **Database**: create a PostgreSQL instance (e.g. Render, Railway, Neon,
   Supabase) and run `schema.sql` on it (pgAdmin → Query Tool → Open file →
   Execute).
2. **App**: push the repository and connect it to the host of your choice
   (Render Web Service, Railway, Heroku-style). The start command is
   `npm start` (Nodemon is a dev dependency only).
3. **Environment variables**: set `PORT`, `DATABASE_URL` (the hosted connection
   string) and a strong random `JWT_SECRET` in the platform's settings.
4. **CORS**: `app.use(cors())` currently allows any origin for development. For
   production, restrict it to the deployed frontend URL:

```js
app.use(cors({ origin: "https://your-frontend.onrender.com" }));
```

5. **Frontend**: point `src/api.js` at the deployed API URL and rebuild.

## 🌿 Git Workflow

Feature-branch workflow with pull requests: `feat/*`, `chore/*`, `docs/*`,
`fix/*`, `test/*` branches merged into `main` with structured conventional
commits (`feat:`, `docs:`, `fix:`, `test:`).

---

*Built as part of the Special Topics in Computer Science 1 assignment (2025-2026).*
