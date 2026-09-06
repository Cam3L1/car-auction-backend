import db from "../db.js";

// Auctions close themselves. When a car's end_time has passed, its
// countdown is over - this helper flips every expired ACTIVE auction to
// ENDED with a single UPDATE query.
//
// It is called at the START of every read (list, details, bids,
// profile) so the data is always up to date without a background job.
// Once an auction is 'ended':
//   - new bids are rejected (rule 2 in the bid endpoint)
//   - the winner is simply whoever holds the highest bid
export async function finalizeExpiredAuctions() {
  await db.query(
    "UPDATE cars SET status = 'ended' WHERE status = 'active' AND end_time <= NOW()"
  );
}
