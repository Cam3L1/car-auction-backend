import express from "express";
import db from "../db.js";
import auth from "../middleware/auth.js";
import { finalizeExpiredAuctions } from "../utils/auctions.js";
const router = express.Router();

// ============ GET /api/users/profile ============
// Auth: any logged-in user. The user's id comes from the JWT
// (req.user.id) - the client does NOT send it, so one user can never
// request another user's dashboard.
//
// Returns the data for BOTH sides of the profile page:
//   sellerCars - every listing the user created (seller view)
//   bidderCars - every car the user bid on   (bidder view)
router.get("/profile", auth, async (req, res) => {
  await finalizeExpiredAuctions();

  // --- seller view -------------------------------------------------
  // One row per listing created by this user, plus two subqueries:
  //   highest_bid = the largest bid so far (or NULL when no bids yet)
  //   bid_count   = how many bids were placed in total
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

  // --- bidder view -------------------------------------------------
  // Finds every car that has at least one bid FROM this user.
  //   my_highest_bid = the user's own highest bid on that car (MAX)
  //   top_bidder_id  = who currently leads the auction overall
  // The frontend compares top_bidder_id with the user's id to show
  // "Highest bidder" / "Outbid" / "You won!" badges.
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
