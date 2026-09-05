import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// minimum amount a new bid must add on top of the current price (JOD)
const MIN_BID_INCREMENT = 100;

// localhost:5000/api/cars
// GET
// query >> ?q=  (searches title/make/model)  &make=  &status=
// Public: returns ACTIVE auctions by default. status=all|ended|cancelled
// is used by admins to monitor the whole platform.
router.get("/", async (req, res) => {
  await finalizeExpiredAuctions();

  const { q, make, status } = req.query;

  let query = `
    SELECT c.*, u.username AS seller,
           (SELECT COUNT(*) FROM bids b WHERE b.car_id = c.id) AS bid_count
    FROM cars c
    JOIN users u ON u.id = c.user_id
    WHERE 1 = 1`;
  const params = [];

  if (!status || status === "active") {
    params.push("active");
    query += ` AND c.status = $${params.length}`;
  } else if (status !== "all") {
    params.push(status);
    query += ` AND c.status = $${params.length}`;
  }

  if (q) {
    params.push(`%${q}%`);
    query += ` AND (c.title ILIKE $${params.length} OR c.make ILIKE $${params.length} OR c.model ILIKE $${params.length})`;
  }

  if (make) {
    params.push(make);
    query += ` AND c.make = $${params.length}`;
  }

  query += " ORDER BY c.end_time ASC";

  const result = await db.query(query, params);
  res.json(result.rows);
});

// localhost:5000/api/cars/:id
// GET
// Returns the car details together with its full, immutable bid history.
router.get("/:id", async (req, res) => {
  await finalizeExpiredAuctions();

  const carResult = await db.query(
    `SELECT c.*, u.username AS seller
     FROM cars c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (carResult.rows.length === 0) return res.status(404).json({ message: "Car not found" });

  const bidsResult = await db.query(
    `SELECT b.id, b.amount, b.created_at, u.username AS bidder, u.id AS bidder_id
     FROM bids b
     JOIN users u ON u.id = b.user_id
     WHERE b.car_id = $1
     ORDER BY b.created_at ASC, b.id ASC`,
    [req.params.id]
  );

  // when the auction has ended, the highest (last) bidder is the winner
  const car = carResult.rows[0];
  const bids = bidsResult.rows;
  const winner =
    car.status === "ended" && bids.length > 0 ? bids[bids.length - 1].bidder : null;

  res.json({ car, bids, winner });
});

// localhost:5000/api/cars
// POST  (auth: normal user)
// body >> { title, make, model, year, mileage, description,
//           image_url, starting_price, end_time }
// Creates a new ACTIVE auction listing.
router.post("/", auth, async (req, res) => {
  if (req.user.role !== "normal") {
    return res.status(403).json({ message: "Only normal users can create listings" });
  }

  const { title, make, model, year, mileage, description, image_url, starting_price, end_time } = req.body;

  const requiredFields = ["title", "make", "model", "year", "mileage", "description", "image_url", "starting_price", "end_time"];
  const missing = requiredFields.filter((field) => !req.body[field]);
  if (missing.length > 0) {
    return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
  }

  if (Number(starting_price) <= 0) {
    return res.status(400).json({ message: "Starting price must be greater than 0" });
  }

  // the countdown timer must start in the future
  if (new Date(end_time) <= new Date()) {
    return res.status(400).json({ message: "Auction end time must be in the future" });
  }

  const result = await db.query(
    `INSERT INTO cars (user_id, title, make, model, year, mileage, description, image_url, starting_price, current_price, end_time, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, 'active')
     RETURNING *`,
    [req.user.id, title, make, model, year, mileage, description, image_url, starting_price, end_time]
  );

  res.status(201).json({ message: "Listing created successfully", car: result.rows[0] });
});

// localhost:5000/api/cars/:id/bids
// POST  (auth: normal user, not the owner)
// body >> { amount }
// Server-side validation: active status, live timer, strictly higher
// than the current price, and at least MIN_BID_INCREMENT above it.
router.post("/:id/bids", auth, async (req, res) => {
  if (req.user.role !== "normal") {
    return res.status(403).json({ message: "Only normal users can place bids" });
  }

  await finalizeExpiredAuctions();

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

  const bidResult = await db.query(
    "INSERT INTO bids (car_id, user_id, amount) VALUES ($1, $2, $3) RETURNING *",
    [car.id, req.user.id, amount]
  );

  // the car's displayed current price follows the latest accepted bid
  await db.query("UPDATE cars SET current_price = $1 WHERE id = $2", [amount, car.id]);

  res.status(201).json({ message: "Bid placed successfully", bid: bidResult.rows[0] });
});

export default router;
