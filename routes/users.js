import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// GET /api/users/profile - seller + bidder dashboard data
router.get("/profile", auth, async (req, res) => {
  await finalizeExpiredAuctions();

  const sellerCars = await db.query(
    `SELECT c.*, u.username AS seller,
            (SELECT b.amount FROM bids b WHERE b.car_id = c.id ORDER BY b.amount DESC LIMIT 1) AS highest_bid,
            (SELECT COUNT(*) FROM bids b WHERE b.car_id = c.id) AS bid_count
     FROM cars c
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );

  const bidderCars = await db.query(
    `SELECT c.*, u.username AS seller,
            MAX(b.amount) AS my_highest_bid,
            (SELECT b2.user_id FROM bids b2 WHERE b2.car_id = c.id
               ORDER BY b2.amount DESC, b2.created_at ASC LIMIT 1) AS top_bidder_id
     FROM bids b
     JOIN cars c ON c.id = b.car_id
     JOIN users u ON u.id = c.user_id
     WHERE b.user_id = $1
     GROUP BY c.id, u.username
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );

  res.json({
    user: { id: req.user.id, username: req.user.username, role: req.user.role },
    sellerCars: sellerCars.rows,
    bidderCars: bidderCars.rows,
  });
});

export default router;
