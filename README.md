# 🚗 CarBid — Backend API

REST API for **CarBid**, an online car auction platform. Built with **Node.js, Express.js and PostgreSQL** for the *Special Topics in Computer Science 1* full-stack assignment.

> Frontend repository: [car-auction-frontend](https://github.com/Cam3L1/car-auction-frontend)

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

```bash
# 1. clone the repository
git clone https://github.com/Cam3L1/car-auction-backend.git
cd car-auction-backend

# 2. install dependencies
npm install

# 3. create the database and load schema + seed data (PostgreSQL 14+)
#    (you can also run schema.sql inside pgAdmin)
createdb car_auction
psql -d car_auction -f schema.sql

# 4. configure the environment
cp .env.example .env
#    edit .env: DATABASE_URL, JWT_SECRET

# 5. start the development server (http://localhost:5001)
npm run dev
```

> ⚠️ On macOS the AirPlay Receiver occupies port **5000**, so the API runs on **5001**.

### Seed Accounts

| Role  | Email               | Password    |
| ----- | ------------------- | ----------- |
| admin | `admin@carbid.com`  | `admin123`  |
| user  | `sara@example.com`  | `password123` |
| user  | `omar@example.com`  | `password123` |
| user  | `lina@example.com`  | `password123` |
| user  | `khaled@example.com`| `password123` |

## 📚 API Documentation

Base URL: `http://localhost:5001/api` — most endpoints return JSON. Authenticated routes require the header `Authorization: Bearer <token>`.

### Authentication

| Method | Endpoint            | Access | Body                                   | Success      | Errors        |
| ------ | ------------------- | ------ | -------------------------------------- | ------------ | ------------- |
| POST   | `/auth/register`    | public | `{ username, email, password }`        | `201 { token, user }` | `400` duplicate/missing fields |
| POST   | `/auth/login`       | public | `{ email, password }`                  | `200 { token, user }` | `401` invalid credentials |

### Cars (auction listings)

| Method | Endpoint            | Access | Description                                                        |
| ------ | ------------------- | ------ | ------------------------------------------------------------------ |
| GET    | `/cars`             | public | Active auctions. Query: `q` (title/make/model), `make`, `status`   |
| GET    | `/cars/:id`         | public | Car details + full bid history + winner (when ended)               |
| POST   | `/cars`             | normal user | Create a listing. Body: `{ title, make, model, year, mileage, description, image_url, starting_price, end_time }` → `201 { car }` |
| POST   | `/cars/:id/bids`    | normal user, non-owner | Place a bid. Body: `{ amount }` → `201 { bid }`              |

**Bid rejection rules (all return `400`):**

- `amount <= current_price`
- `amount < current_price + 100` (minimum increment)
- auction `status` is not `active`
- current time is past `end_time` (countdown reached zero)
- owner bidders get `403`, unauthenticated requests get `401`

### Users

| Method | Endpoint            | Access | Description                                                        |
| ------ | ------------------- | ------ | ------------------------------------------------------------------ |
| GET    | `/users/profile`    | any logged-in user | `{ user, sellerCars, bidderCars }` — listings created by the user + cars they bid on with their highest bid and the leading bidder |

### Admin (monitoring + moderation)

| Method | Endpoint                  | Access | Description                                                        |
| ------ | ------------------------- | ------ | ------------------------------------------------------------------ |
| GET    | `/admin/cars`             | admin  | All auctions regardless of status (monitoring)                     |
| GET    | `/admin/bids`             | admin  | Platform-wide bidding log, newest first                            |
| DELETE | `/admin/bids/:bidId`      | admin  | Delete a bid; the car's `current_price` reverts to the previous highest bid (or starting price) |
| PUT    | `/admin/cars/:id/cancel`  | admin  | Cancel a listing; associated bids are voided, price resets         |
| DELETE | `/admin/cars/:id`         | admin  | Delete a listing entirely (bids removed by `ON DELETE CASCADE`)    |

A full **Postman collection** covering every endpoint is included in [`postman/CarBid.postman_collection.json`](postman/CarBid.postman_collection.json).

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

Full DDL + realistic seed data: [`schema.sql`](schema.sql)

## 📁 Project Structure

```
car-auction-backend/
├── server.js              # Express app: middleware + routers + error handler
├── db.js                  # PostgreSQL client (pg)
├── schema.sql             # Database schema + seed data
├── .env.example           # Environment template (PORT, DATABASE_URL, JWT_SECRET)
├── routes/
│   ├── auth.js            # POST /api/auth/register, /api/auth/login
│   ├── cars.js            # listings + bid placement
│   ├── users.js           # profile dashboard
│   └── admin.js           # admin moderation endpoints
├── middleware/
│   ├── auth.js            # JWT verification (req.user)
│   └── adminAuth.js       # role authorization (admin only)
└── utils/
    ├── password.js        # scrypt password hashing (Node crypto)
    └── auctions.js        # auto-finalize expired auctions
```

## 🧪 Testing

Every route, status code, payload and error state was validated with **Postman** (see the collection above). The key scenarios:

- register/login flows (201/200/400/401) and duplicate accounts
- search `q`, `make` filter and `status` browsing
- all five bid rejection rules + a successful bid updating `current_price`
- deleting the highest bid → price reverts to the previous highest
- cancelling a listing → bids voided

## 🌿 Git Workflow

Feature-branch workflow with pull requests: `feat/*`, `chore/*`, `docs/*`, `test/*` branches merged into `main` with structured conventional commits.

---

*Built as part of the Special Topics in Computer Science 1 assignment (2025-2026).*
