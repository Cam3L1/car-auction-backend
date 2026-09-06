import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import carRoutes from "./routes/cars.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import db from "./db.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// ============ MIDDLEWARE CHAIN ============
// Every request that reaches this server flows through these three
// middlewares IN ORDER, before any route handler runs:
//
//   browser → cors() → express.json() → morgan() → router → handler
//
// 1. cors()          adds the CORS headers that let the React frontend
//                    (a different origin) call this API from the browser
// 2. express.json()  reads the request body and attaches it to req.body
//                    as a JS object (for POST/PUT requests)
// 3. morgan("dev")   prints one short log line per request to the console
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Mount the routers: each file inside /routes handles one resource.
// The prefixes here must match the paths used inside each router file.
app.use("/api/auth", authRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);

// Simple health check: open http://localhost:5001 in a browser to see it
app.get("/", (req, res) => {
  res.send("MazadJo API is running");
});

// ============ GLOBAL ERROR HANDLER ============
// Express 5 automatically forwards any rejected promise from an async
// route handler to THIS function, so every unexpected error becomes a
// clean JSON response instead of crashing the server.
// (The 4 parameters tell Express this is an error-handling middleware.)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

// Only start listening AFTER the database connection succeeded -
// otherwise every request would fail anyway.
db.connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err.message);
    process.exit(1);
  });
