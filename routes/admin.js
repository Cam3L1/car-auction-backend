import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import adminAuth from "../middleware/adminAuth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// every admin route requires a valid JWT AND the admin role
router.use(auth, adminAuth);

// localhost:5000/api/admin/cars
// GET
// Platform monitoring: all auctions regardless of status.
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

// localhost:5000/api/admin/bids
// GET
// Platform-wide bidding log (moderation view), newest first.
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

// localhost:5000/api/admin/bids/:bidId
// DELETE
// Removes an invalid/fraudulent bid. If it was the current highest bid,
// the car's displayed price reverts to the previous highest bid
// (or back to the starting price when no other bids exist).
router.delete("/bids/:bidId", async (req, res) => {
  const bidResult = await db.query("SELECT * FROM bids WHERE id = $1", [req.params.bidId]);
  if (bidResult.rows.length === 0) return res.status(404).json({ message: "Bid not found" });

  const bid = bidResult.rows[0];
  await db.query("DELETE FROM bids WHERE id = $1", [bid.id]);

  // find the previous highest bid for that car
  const topResult = await db.query(
    "SELECT amount FROM bids WHERE car_id = $1 ORDER BY amount DESC LIMIT 1",
    [bid.car_id]
  );

  let revertedPrice;
  if (topResult.rows.length > 0) {
    revertedPrice = topResult.rows[0].amount;
  } else {
    const carResult = await db.query("SELECT starting_price FROM cars WHERE id = $1", [bid.car_id]);
    revertedPrice = carResult.rows[0].starting_price;
  }

  await db.query("UPDATE cars SET current_price = $1 WHERE id = $2", [revertedPrice, bid.car_id]);

  res.json({
    message: "Bid deleted and current price reverted",
    deleted: bid,
    newCurrentPrice: revertedPrice,
  });
});

// localhost:5000/api/admin/cars/:id
// DELETE
// Removes a non-compliant listing entirely (bids are removed
// automatically thanks to ON DELETE CASCADE).
router.delete("/cars/:id", async (req, res) => {
  const result = await db.query("DELETE FROM cars WHERE id = $1 RETURNING *", [req.params.id]);

  result.rows.length > 0
    ? res.json({ message: "Listing deleted", deleted: result.rows[0] })
    : res.status(404).json({ message: "Car not found" });
});

// localhost:5000/api/admin/cars/:id/cancel
// PUT
// Cancels a listing that violates guidelines: all associated bids are
// voided and the price resets to the starting price.
router.put("/cars/:id/cancel", async (req, res) => {
  const carResult = await db.query("SELECT * FROM cars WHERE id = $1", [req.params.id]);
  if (carResult.rows.length === 0) return res.status(404).json({ message: "Car not found" });

  await db.query("DELETE FROM bids WHERE car_id = $1", [carResult.rows[0].id]);

  const result = await db.query(
    "UPDATE cars SET status = 'cancelled', current_price = starting_price WHERE id = $1 RETURNING *",
    [carResult.rows[0].id]
  );

  res.json({ message: "Listing cancelled and bids voided", cancelled: result.rows[0] });
});

export default router;
