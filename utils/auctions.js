import db from "../db.js";

// Close every auction whose countdown has reached zero: the status
// becomes "ended" so no new bids are accepted and the winner is fixed.
// Called at the start of every read so the data is always up to date.
export async function finalizeExpiredAuctions() {
  await db.query(
    "UPDATE cars SET status = 'ended' WHERE status = 'active' AND end_time <= NOW()"
  );
}
