import express from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
const router = express.Router();

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Username, email and password are required" });
  }

  const exists = await db.query(
    "SELECT * FROM users WHERE email = $1 OR username = $2",
    [email, username]
  );
  if (exists.rows.length > 0) {
    return res.status(400).json({ message: "Username or email already exists" });
  }

  const result = await db.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, 'normal')
     RETURNING id, username, email, role`,
    [username, email, hashPassword(password)]
  );

  const user = result.rows[0];
  res.status(201).json({ message: "Account created successfully", token: createToken(user), user });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  if (result.rows.length === 0) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const user = result.rows[0];
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const safeUser = { id: user.id, username: user.username, email: user.email, role: user.role };
  res.json({ message: "Logged in successfully", token: createToken(user), user: safeUser });
});

export default router;
