import express from "express";
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  assignInspector,
  updateBookingStatus,
  addBookingNote,
  getBookingStats,
  getAvailableInspectors,
} from "../controllers/bookingController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public/Customer accessible routes (with authentication)
router.get("/available-inspectors", authenticate, authorize("cashier", "admin", "manager"), getAvailableInspectors);

// Booking CRUD operations
router.route("/")
  .get(authenticate, authorize("cashier", "admin", "manager", "service_advisor"), getAllBookings)
  .post(authenticate, authorize("cashier"), createBooking);

// Booking management by ID
router.route("/:id")
  .get(authenticate, authorize("cashier", "admin", "manager", "service_advisor"), getBookingById)
  .patch(authenticate, authorize("cashier", "admin", "manager"), updateBooking);

// Booking workflow operations
router.patch("/:id/assign-inspector", authenticate, authorize("cashier"), assignInspector);
router.patch("/:id/status", authenticate, authorize("service_advisor", "cashier"), updateBookingStatus);
router.patch("/:id/cancel", authenticate, authorize("cashier", "admin", "manager"), cancelBooking);
router.post("/:id/notes", authenticate, authorize("cashier", "service_advisor", "admin", "manager"), addBookingNote);

// Administrative routes
router.get("/stats/overview", authenticate, authorize("admin", "manager"), getBookingStats);

export default router;
