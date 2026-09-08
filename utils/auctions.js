import db from "../db.js";

// close every auction whose countdown reached zero
export async function finalizeExpiredAuctions() {
  await db.query(
    "UPDATE cars SET status = 'ended' WHERE status = 'active' AND end_time <= NOW()"
  );
}
