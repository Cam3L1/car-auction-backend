import crypto from "crypto";

// We NEVER store a plain password in the database. Instead we store:
//
//   "salt:hash"
//
// where "hash" is the password scrambled with a "salt" using scrypt -
// a slow, one-way function built into Node (no extra library needed).

// hashPassword("secret") -> "a1b2c3...:f9e8d7..."
// Steps:
//   1. generate a random 16-byte salt (a unique random prefix, so two
//      users with the same password still get DIFFERENT hashes)
//   2. run scrypt over (password + salt) to produce a 64-byte hash
//   3. return "salt:hash" - the salt is saved next to the hash so we
//      can repeat the exact same calculation later to verify a login
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// verifyPassword("secret", stored) -> true / false
// Steps:
//   1. split the stored "salt:hash" string into its two parts
//   2. hash the password the user just typed with the SAME salt
//   3. compare the freshly computed hash with the stored one:
//      equal   -> the password is correct
//      differs -> wrong password
// We compare hashes; we never decrypt anything (scrypt is one-way).
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return check === hash;
}
