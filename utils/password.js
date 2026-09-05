import crypto from "crypto";

// Hash a password with a random salt using Node's built-in scrypt.
// The result is stored as "salt:hash" in the password_hash column.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Compare a plain password against a stored "salt:hash" string.
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return check === hash;
}
