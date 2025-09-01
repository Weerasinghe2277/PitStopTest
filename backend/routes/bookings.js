import express from "express";
import {
  createBooking,
  getAllBookings,
  getBookingById,
  getBookingByBookingId,
  updateBooking,
  assignInspector,
  updateBookingStatus,
  addBookingNote,
  cancelBooking,
  deleteBooking,
  getBookingStats,
  searchBookings,
  getBookingsByCustomer
} from "../controllers/bookingController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Search route (should be before other parameterized routes)
router.get("/search", authenticate, searchBookings);

// Statistics and reports routes (admin/manager only)
router.get("/stats", authenticate, authorize("admin", "manager"), getBookingStats);

// Customer-specific bookings
router.get("/customer/:customerId", authenticate, authorize("admin", "manager", "service_advisor"), getBookingsByCustomer);

// Main CRUD routes
router.route("/")
  .get(authenticate, getAllBookings) // All authenticated users can view bookings
  .post(authenticate, authorize("admin", "manager", "service_advisor", "cashier"), createBooking); // Staff can create bookings

// Booking by bookingId (custom ID like BK00001)
router.route("/booking-id/:bookingId")
  .get(authenticate, getBookingByBookingId);

// Booking management by database ID
router.route("/:id")
  .get(authenticate, getBookingById)
  .patch(authenticate, authorize("admin", "manager", "service_advisor", "cashier"), updateBooking)
  .delete(authenticate, authorize("admin", "manager"), deleteBooking);

// Special booking operations
router.patch("/:id/assign-inspector", authenticate, authorize("admin", "manager", "service_advisor", "cashier"), assignInspector);
router.patch("/:id/status", authenticate, authorize("admin", "manager", "service_advisor", "technician"), updateBookingStatus);
router.post("/:id/notes", authenticate, addBookingNote);
router.patch("/:id/cancel", authenticate, authorize("admin", "manager", "service_advisor", "cashier"), cancelBooking);

export default router;
