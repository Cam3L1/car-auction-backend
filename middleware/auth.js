import jwt from "jsonwebtoken";

// This middleware PROTECTS routes: it answers "WHO is calling?".
// How to trace a request through it:
//
//   browser sends header  "Authorization: Bearer <token>"
//        ↓
//   1. read the header - missing or not starting with "Bearer " -> 401
//   2. cut off the word "Bearer " and keep the token part
//   3. jwt.verify(token, JWT_SECRET) checks the signature:
//      - token forged or tampered with  -> it THROWS -> 401
//      - token older than 1 hour        -> it THROWS -> 401
//   4. success: the decoded payload { id, username, role } is attached
//      to req.user so the route handler can use it
//        ↓
//   next() passes the request on to the route handler
export default function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided. Please log in." });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
