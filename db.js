import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

// return NUMERIC columns (prices) as JS numbers instead of strings
pg.types.setTypeParser(1700, (value) => parseFloat(value));

// Single PostgreSQL client shared by all routes
const db = new pg.Client(process.env.DATABASE_URL);

export default db;
