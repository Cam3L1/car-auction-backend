import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

// NUMERIC columns come back as numbers, not strings
pg.types.setTypeParser(1700, (value) => parseFloat(value));

const db = new pg.Client(process.env.DATABASE_URL);

export default db;
