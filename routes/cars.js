import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// Business rule: every new bid must add at least this much (JOD)
// on top of the current price.
const MIN_BID_INCREMENT = 100;

// ============ GET /api/cars ============
// Public. Lists ACTIVE auctions, ending soonest first.
// Optional query-string filters:  ?q=   (title/make/model search)
//                                &make= (exact make)
//                                &status= (active | ended | cancelled | all)
//
// Trace: finalize expired auctions -> build the WHERE clause from the
//        filters -> run ONE query -> send the rows as JSON
router.get("/", async (req, res) => {
  // close any auction whose countdown already hit zero, first
  await finalizeExpiredAuctions();

  const { q, make, status } = req.query;

  // The WHERE clause is assembled piece by piece with $1, $2, ...
  // placeholders. User input is NEVER written directly into the SQL
  // string - only passed as parameters (that is what prevents SQL
  // injection).
  let query = `
    SELECT c.*, u.username AS seller,
           (SELECT COUNT(*) FROM bids b WHERE b.car_id = c.id) AS bid_count
    FROM cars c
    JOIN users u ON u.id = c.user_id
    WHERE 1 = 1`;
  const params = [];

  // by default (no status given) only ACTIVE auctions are shown
  if (!status || status === "active") {
    params.push("active");
    query += ` AND c.status = $${params.length}`;
  } else if (status !== "all") {
    params.push(status);
    query += ` AND c.status = $${params.length}`;
  }

  // free-text search across title, make and model (ILIKE = case-insensitive)
  if (q) {
    params.push(`%${q}%`);
    query += ` AND (c.title ILIKE $${params.length} OR c.make ILIKE $${params.length} OR c.model ILIKE $${params.length})`;
  }

  // exact make filter
  if (make) {
    params.push(make);
    query += ` AND c.make = $${params.length}`;
  }

  query += " ORDER BY c.end_time ASC";

  const result = await db.query(query, params);
  res.json(result.rows);
});

// ============ GET /api/cars/:id ============
// Public. One car + its FULL bid history + the winner when ended.
//
// Two queries:
//   1. the car row (joined with the seller's username) - 404 if unknown
//   2. every bid on that car, OLDEST FIRST (the history is immutable:
//      bids are only ever INSERTed, never updated)
// The winner is simply the LAST row of that chronological list.
router.get("/:id", async (req, res) => {
  await finalizeExpiredAuctions();

  // query 1: the car itself
  const carResult = await db.query(
    `SELECT c.*, u.username AS seller
     FROM cars c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (carResult.rows.length === 0) return res.status(404).json({ message: "Car not found" });

  // query 2: the chronological, immutable bid history
  const bidsResult = await db.query(
    `SELECT b.id, b.amount, b.created_at, u.username AS bidder, u.id AS bidder_id
     FROM bids b
     JOIN users u ON u.id = b.user_id
     WHERE b.car_id = $1
     ORDER BY b.created_at ASC, b.id ASC`,
    [req.params.id]
  );

  const car = carResult.rows[0];
  const bids = bidsResult.rows;

  // highest bidder = the last row of the ordered history.
  // Only meaningful once the auction has ended, so we report null
  // while it is still running.
  const winner =
    car.status === "ended" && bids.length > 0 ? bids[bids.length - 1].bidder : null;

  res.json({ car, bids, winner });
});

// ============ POST /api/cars ============
// Auth: NORMAL user (admins get 403). Creates a new ACTIVE listing.
// body: { title, make, model, year, mileage, description,
//         image_url, starting_price, end_time }
//
// Trace: auth middleware (401 without token) -> role check (403) ->
//        field validation (400) -> INSERT -> 201 with the new car
router.post("/", auth, async (req, res) => {
  // only normal users sell cars - admins monitor and moderate
  if (req.user.role !== "normal") {
    return res.status(403).json({ message: "Only normal users can create listings" });
  }

  const { title, make, model, year, mileage, description, image_url, starting_price, end_time } = req.body;

  // validation 1: every field must be present. The response lists the
  // exact missing fields so the client can show a helpful message.
  const requiredFields = ["title", "make", "model", "year", "mileage", "description", "image_url", "starting_price", "end_time"];
  const missing = requiredFields.filter((field) => !req.body[field]);
  if (missing.length > 0) {
    return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
  }

  // validation 2: the starting price must be positive
  if (Number(starting_price) <= 0) {
    return res.status(400).json({ message: "Starting price must be greater than 0" });
  }

  // validation 3: the countdown must start in the future
  if (new Date(end_time) <= new Date()) {
    return res.status(400).json({ message: "Auction end time must be in the future" });
  }

  // INSERT the listing:
  //  - current_price starts EQUAL to starting_price ($9 is used twice)
  //  - status starts as 'active'
  const result = await db.query(
    `INSERT INTO cars (user_id, title, make, model, year, mileage, description, image_url, starting_price, current_price, end_time, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, 'active')
     RETURNING *`,
    [req.user.id, title, make, model, year, mileage, description, image_url, starting_price, end_time]
  );

  res.status(201).json({ message: "Listing created successfully", car: result.rows[0] });
});

// ============ POST /api/cars/:id/bids ============
// Auth: NORMAL user, NOT the owner.  body: { amount }
//
// This is the heart of the app: every bidding rule is enforced HERE on
// the server (never trust the client). Trace a bid through the rules:
//
//   1. auth middleware sets req.user            -> else 401
//   2. role check: only normal users bid        -> else 403
//   3. fetch the car being bid on               -> else 404
//   4. RULE 1: owner cannot bid on own listing  -> 403
//   5. RULE 2: auction must still be active     -> 400
//   6. RULE 3: countdown must not be at zero    -> 400
//   7. RULE 4: bid must be HIGHER than price    -> 400
//   8. RULE 5: bid must respect min increment   -> 400
//   9. all passed -> INSERT bid + UPDATE price  -> 201
router.post("/:id/bids", auth, async (req, res) => {
  if (req.user.role !== "normal") {
    return res.status(403).json({ message: "Only normal users can place bids" });
  }

  // close any auctions whose timer already expired (keeps rules 2 & 3
  // in sync with the countdown)
  await finalizeExpiredAuctions();

  // fetch the auction being bid on
  const carResult = await db.query("SELECT * FROM cars WHERE id = $1", [req.params.id]);
  if (carResult.rows.length === 0) return res.status(404).json({ message: "Car not found" });

  const car = carResult.rows[0];
  const amount = Number(req.body.amount);

  // rule 1: users cannot bid on their own listings
  if (car.user_id === req.user.id) {
    return res.status(403).json({ message: "You cannot bid on your own listing" });
  }

  // rule 2: the auction must still be active
  if (car.status !== "active") {
    return res.status(400).json({ message: `This auction is ${car.status}, bids are closed` });
  }

  // rule 3: countdown enforcement - reject bids after the timer hits zero
  if (new Date(car.end_time) <= new Date()) {
    return res.status(400).json({ message: "This auction has ended, no more bids are accepted" });
  }

  // rule 4: every bid must be strictly higher than the current price
  if (amount <= Number(car.current_price)) {
    return res
      .status(400)
      .json({ message: `Bid must be higher than the current price (${car.current_price} JOD)` });
  }

  // rule 5: minimum increment above the current price
  if (amount < Number(car.current_price) + MIN_BID_INCREMENT) {
    return res.status(400).json({
      message: `Bid must be at least ${MIN_BID_INCREMENT} JOD above the current price`,
    });
  }

  // all rules passed -> record the bid in the immutable history...
  const bidResult = await db.query(
    "INSERT INTO bids (car_id, user_id, amount) VALUES ($1, $2, $3) RETURNING *",
    [car.id, req.user.id, amount]
  );

  // ...and move the car's displayed price to the new highest bid
  await db.query("UPDATE cars SET current_price = $1 WHERE id = $2", [amount, car.id]);

  res.status(201).json({ message: "Bid placed successfully", bid: bidResult.rows[0] });
});

export default router;
