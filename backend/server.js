import express from "express";
import dotenv from "dotenv";
import connectDB from "./db/connect.js";
import notFound from "./middleware/not-found.js";
import errorHandlerMiddleware from "./middleware/error-handler.js";

import users from "./routes/users.js";
import bookings from "./routes/bookings.js";
import inventory from "./routes/inventory.js";
import vehicles from "./routes/vehicles.js";
import invoices from "./routes/invoices.js";
import leaveRequests from "./routes/leaveRequests.js";
import goodsRequests from "./routes/goodsRequests.js";
import jobs from "./routes/jobs.js";

dotenv.config();

const app = express();

//middleware
app.use(express.static("./public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (add this if you'll have a frontend later)
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", process.env.CLIENT_URL || "http://localhost:3000");
//   res.header("Access-Control-Allow-Credentials", "true");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
//   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
//   next();
// });

//routes
app.use("/api/v1/users", users);
app.use("/api/v1/bookings", bookings);
app.use("/api/v1/inventory", inventory);
app.use("/api/v1/vehicles", vehicles);
app.use("/api/v1/invoices", invoices);
app.use("/api/v1/leave-requests", leaveRequests);
app.use("/api/v1/goods-requests", goodsRequests);
app.use("/api/v1/jobs", jobs);

app.use(notFound);
app.use(errorHandlerMiddleware);
const port = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () => {
      console.log(`Server is listening on port ${port}...`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
