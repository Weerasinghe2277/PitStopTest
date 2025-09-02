import express from "express";
import {
  createJob,
  getAllJobs,
  getJobById,
  updateJobStatus,
  assignLabourers,
  addWorkLog,
  addInspectionReport,
  getJobsByBooking,
  getMyJobs,
  updateJob,
  deleteJob,
  getJobStats,
} from "../controllers/jobController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public routes (none for jobs - all require authentication)

// Protected routes - General job management
router.route("/")
  .get(authenticate, getAllJobs) // All authenticated users can view jobs (with role-based filtering)
  .post(authenticate, authorize("service_advisor", "manager", "admin"), createJob); // Only inspectors can create jobs

// Statistics route (for managers/admins)
router.get("/stats", authenticate, authorize("service_advisor", "manager", "admin"), getJobStats);

// My jobs route (for technicians to see their assigned jobs)
router.get("/my-jobs", authenticate, authorize("technician"), getMyJobs);

// Jobs by booking ID
router.get("/booking/:bookingId", authenticate, getJobsByBooking);

// Job-specific routes
router.route("/:id")
  .get(authenticate, getJobById) // All authenticated users can view individual jobs (with role-based access)
  .patch(authenticate, authorize("service_advisor", "manager", "admin"), updateJob) // Only inspectors can update job details
  .delete(authenticate, authorize("manager", "admin"), deleteJob); // Only managers/admins can delete jobs

// Job status management
router.patch("/:id/status", authenticate, updateJobStatus); // Technicians and inspectors can update status

// Labourer assignment (inspectors only)
router.patch("/:id/assign-labourers", authenticate, authorize("service_advisor", "manager", "admin"), assignLabourers);

// Work log management (technicians only)
router.post("/:id/work-log", authenticate, authorize("technician"), addWorkLog);

// Inspection reports (inspectors only)
router.post("/:id/inspection", authenticate, authorize("service_advisor", "manager", "admin"), addInspectionReport);

// Alternative route for creating jobs under a specific booking
router.post("/booking/:bookingId", authenticate, authorize("service_advisor", "manager", "admin"), createJob);

export default router;
