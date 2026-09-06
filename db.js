import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

// By default pg returns NUMERIC columns (prices) as STRINGS.
// This parser converts them to real JS numbers (e.g. "12800.00" -> 12800)
// so the API responds with clean JSON numbers.
pg.types.setTypeParser(1700, (value) => parseFloat(value));

// ONE shared PostgreSQL client for the whole app.
// Every route file does `import db from "../db.js"` and then calls
// db.query(sql, params) - they all share this same connection.
const db = new pg.Client(process.env.DATABASE_URL);

export default db;
