import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// GET /api/cars - active listings with search & filters
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
  if (!status || status === "active") { params.push("active"); query += ` AND c.status = $${params.length}`; }
  else if (status !== "all") { params.push(status); query += ` AND c.status = $${params.length}`; }
  if (q) { params.push(`%${q}%`); query += ` AND (c.title ILIKE $${params.length} OR c.make ILIKE $${params.length} OR c.model ILIKE $${params.length})`; }
  if (make) { params.push(make); query += ` AND c.make = $${params.length}`; }
  query += " ORDER BY c.end_time ASC";
  const result = await db.query(query, params);
  res.json(result.rows);
});

// GET /api/cars/:id - details + immutable bid history + winner
router.get("/:id", async (req, res) => {
  await finalizeExpiredAuctions();
  const carResult = await db.query(
    `SELECT c.*, u.username AS seller FROM cars c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [req.params.id]
  );
  if (carResult.rows.length === 0) return res.status(404).json({ message: "Car not found" });
  const bidsResult = await db.query(
    `SELECT b.id, b.amount, b.created_at, u.username AS bidder, u.id AS bidder_id
     FROM bids b JOIN users u ON u.id = b.user_id
     WHERE b.car_id = $1 ORDER BY b.created_at ASC, b.id ASC`,
    [req.params.id]
  );
  const car = carResult.rows[0];
  const bids = bidsResult.rows;
  const winner = car.status === "ended" && bids.length > 0 ? bids[bids.length - 1].bidder : null;
  res.json({ car, bids, winner });
});

// POST /api/cars - create an active listing (normal user)
router.post("/", auth, async (req, res) => {
  if (req.user.role !== "normal") {
    return res.status(403).json({ message: "Only normal users can create listings" });
  }
  const { title, make, model, year, mileage, description, image_url, starting_price, end_time } = req.body;
  const requiredFields = ["title", "make", "model", "year", "mileage", "description", "image_url", "starting_price", "end_time"];
  const missing = requiredFields.filter((field) => !req.body[field]);
  if (missing.length > 0) return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
  if (Number(starting_price) <= 0) return res.status(400).json({ message: "Starting price must be greater than 0" });
  if (new Date(end_time) <= new Date()) return res.status(400).json({ message: "Auction end time must be in the future" });
  const result = await db.query(
    `INSERT INTO cars (user_id, title, make, model, year, mileage, description, image_url, starting_price, current_price, end_time, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, 'active') RETURNING *`,
    [req.user.id, title, make, model, year, mileage, description, image_url, starting_price, end_time]
  );
  res.status(201).json({ message: "Listing created successfully", car: result.rows[0] });
});

export default router;
