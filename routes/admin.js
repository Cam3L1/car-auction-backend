import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import adminAuth from "../middleware/adminAuth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// EVERY route in this file is admin-only.
// This router.use line runs auth (who is calling?) and then adminAuth
// (is this person allowed?) BEFORE every handler below - so each
// handler can safely assume req.user.role === "admin".
router.use(auth, adminAuth);

// ============ GET /api/admin/cars ============
// Platform monitoring: ALL auctions regardless of status, with the
// seller's name and the bid count for the dashboard tables.
router.get("/cars", async (req, res) => {
  await finalizeExpiredAuctions();

  const result = await db.query(
    `SELECT c.*, u.username AS seller,
            (SELECT COUNT(*) FROM bids b WHERE b.car_id = c.id) AS bid_count
     FROM cars c
     JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC`
  );
  res.json(result.rows);
});

// ============ GET /api/admin/bids ============
// Platform-wide bidding log (moderation view), newest first. Joined
// with the car title and bidder name so each row is readable on its own.
router.get("/bids", async (req, res) => {
  const result = await db.query(
    `SELECT b.id, b.amount, b.created_at, b.car_id, c.title AS car_title,
            u.username AS bidder, u.id AS bidder_id
     FROM bids b
     JOIN cars c ON c.id = b.car_id
     JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC, b.id DESC`
  );
  res.json(result.rows);
});

// ============ DELETE /api/admin/bids/:bidId ============
// Removes an invalid/fraudulent bid AND fixes the car's price:
//   - deleted bid was the highest  -> price reverts to the PREVIOUS
//                                     highest bid
//   - deleted bid was the ONLY bid -> price reverts to the STARTING
//                                     price
//
// Trace: find the bid (404) -> DELETE it -> find the new top bid ->
//        no bids left? use starting_price -> UPDATE the car -> respond
router.delete("/bids/:bidId", async (req, res) => {
  // step 1: make sure the bid exists before deleting anything
  const bidResult = await db.query("SELECT * FROM bids WHERE id = $1", [req.params.bidId]);
  if (bidResult.rows.length === 0) return res.status(404).json({ message: "Bid not found" });

  const bid = bidResult.rows[0];

  // step 2: delete the bid (admins may REMOVE bids, never edit them -
  // the history stays immutable)
  await db.query("DELETE FROM bids WHERE id = $1", [bid.id]);

  // step 3: what is the previous highest bid on that car now?
  const topResult = await db.query(
    "SELECT amount FROM bids WHERE car_id = $1 ORDER BY amount DESC LIMIT 1",
    [bid.car_id]
  );

  // step 4: fall back to the starting price when no bids remain
  let revertedPrice;
  if (topResult.rows.length > 0) {
    revertedPrice = topResult.rows[0].amount;
  } else {
    const carResult = await db.query("SELECT starting_price FROM cars WHERE id = $1", [bid.car_id]);
    revertedPrice = carResult.rows[0].starting_price;
  }

  // step 5: apply the reverted price to the car
  await db.query("UPDATE cars SET current_price = $1 WHERE id = $2", [revertedPrice, bid.car_id]);

  res.json({
    message: "Bid deleted and current price reverted",
    deleted: bid,
    newCurrentPrice: revertedPrice,
  });
});

// ============ DELETE /api/admin/cars/:id ============
// Removes a non-compliant listing ENTIRELY. Its bids disappear with it
// automatically thanks to ON DELETE CASCADE in the database schema.
router.delete("/cars/:id", async (req, res) => {
  const result = await db.query("DELETE FROM cars WHERE id = $1 RETURNING *", [req.params.id]);

  result.rows.length > 0
    ? res.json({ message: "Listing deleted", deleted: result.rows[0] })
    : res.status(404).json({ message: "Car not found" });
});

// ============ PUT /api/admin/cars/:id/cancel ============
// Cancels a listing that violates the guidelines. Unlike DELETE this
// KEEPS the car visible with status 'cancelled', but VOIDS its bids:
// every bid is deleted and the price resets to the starting price.
//
// Trace: find the car (404) -> DELETE all its bids -> UPDATE status
//        and price in one query -> respond
router.put("/cars/:id/cancel", async (req, res) => {
  const carResult = await db.query("SELECT * FROM cars WHERE id = $1", [req.params.id]);
  if (carResult.rows.length === 0) return res.status(404).json({ message: "Car not found" });

  // void every bid placed on this listing
  await db.query("DELETE FROM bids WHERE car_id = $1", [carResult.rows[0].id]);

  // status -> 'cancelled' and price -> starting price, in one UPDATE
  const result = await db.query(
    "UPDATE cars SET status = 'cancelled', current_price = starting_price WHERE id = $1 RETURNING *",
    [carResult.rows[0].id]
  );

  res.json({ message: "Listing cancelled and bids voided", cancelled: result.rows[0] });
});

export default router;
