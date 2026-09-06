import express from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
const router = express.Router();

// A JWT is a signed "ID card". Its payload carries { id, username, role }
// and it expires after 1 hour. Because it is SIGNED with JWT_SECRET, the
// server can trust it on later requests without touching the database -
// that is what "stateless authentication" means.
function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ============ POST /api/auth/register ============
// body: { username, email, password }
// Creates a new NORMAL user and returns a JWT.
//
// Trace the flow step by step:
//   validate fields -> check duplicates -> hash password -> INSERT user
//   -> sign JWT -> respond 201 with { token, user }
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  // step 1: all three fields must be present
  if (!username || !email || !password) {
    return res.status(400).json({ message: "Username, email and password are required" });
  }

  // step 2: username AND email must be unique (both columns are UNIQUE
  // in the schema, so we check the two of them in one query)
  const exists = await db.query(
    "SELECT * FROM users WHERE email = $1 OR username = $2",
    [email, username]
  );
  if (exists.rows.length > 0) {
    return res.status(400).json({ message: "Username or email already exists" });
  }

  // step 3: INSERT the new user.
  //  - the role is hard-coded to 'normal': nobody can register as admin
  //  - the password is stored HASHED (see utils/password.js)
  //  - RETURNING gives us the created row back without a second query
  const result = await db.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, 'normal')
     RETURNING id, username, email, role`,
    [username, email, hashPassword(password)]
  );

  // step 4: sign a JWT and send it. The client saves it in localStorage
  // and the user is effectively logged in right after registering.
  const user = result.rows[0];
  res.status(201).json({ message: "Account created successfully", token: createToken(user), user });
});

// ============ POST /api/auth/login ============
// body: { email, password }
// Verifies the credentials and returns a JWT.
//
// Trace: find user by email -> compare password hashes -> sign JWT
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // step 1: does a user with this email exist?
  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  if (result.rows.length === 0) {
    // deliberately the SAME message as a wrong password, so an attacker
    // cannot find out which emails are registered
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // step 2: re-hash the typed password with the stored salt and compare
  // (the logic lives in utils/password.js)
  const user = result.rows[0];
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // step 3: success - sign a fresh JWT and send it together with a SAFE
  // copy of the user. Note: password_hash is NEVER sent to the client.
  const safeUser = { id: user.id, username: user.username, email: user.email, role: user.role };
  res.json({ message: "Logged in successfully", token: createToken(user), user: safeUser });
});

export default router;
