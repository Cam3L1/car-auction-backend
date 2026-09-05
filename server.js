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
const PORT = process.env.PORT || 5000;

// middlewares: allow the React frontend, parse JSON bodies, log requests
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// localhost:5000/api/...
app.use("/api/auth", authRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("🚗 CarBid API is running");
});

// global error handler: every failed request returns a JSON response
// (Express 5 forwards rejected async handlers here automatically)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

// start the server only after a successful database connection
db.connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err.message);
    process.exit(1);
  });
