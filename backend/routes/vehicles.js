import express from "express";
import {
  createVehicle,
  getAllVehicles,
  getVehicleById,
  getVehicleByRegistration,
  getVehiclesByOwner,
  updateVehicle,
  updateVehicleMileage,
  updateVehicleStatus,
  deleteVehicle,
  getVehicleStats,
  searchVehicles,
  transferOwnership,
} from "../controllers/vehicalContrller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public routes (for vehicle lookup without authentication)
// Note: In production, you might want to protect these too
router.get("/search", searchVehicles); // Quick search for booking
router.get("/registration/:registrationNumber", getVehicleByRegistration); // Lookup by reg number

// Protected routes - require authentication
// Vehicle CRUD operations
router.route("/")
  .get(authenticate, getAllVehicles) // All roles can view vehicles
  .post(authenticate, authorize("admin", "manager", "service_advisor"), createVehicle); // Only staff can create vehicles

// Vehicle statistics (admin/manager only)
router.get("/stats/overview", authenticate, authorize("admin", "manager"), getVehicleStats);

// Vehicle by owner (customers can see their own, staff can see all)
router.get("/owner/:ownerId", authenticate, getVehiclesByOwner);

// Vehicle management by ID
router.route("/:id")
  .get(authenticate, getVehicleById) // All authenticated users can view vehicle details
  .patch(authenticate, authorize("admin", "manager", "service_advisor"), updateVehicle) // Staff can update vehicle info
  .delete(authenticate, authorize("admin", "manager"), deleteVehicle); // Admin/Manager can delete vehicles

// Specialized vehicle operations
router.patch("/:id/mileage", 
  authenticate, 
  authorize("admin", "manager", "service_advisor", "technician"), 
  updateVehicleMileage
); // Staff can update mileage after service

router.patch("/:id/status", 
  authenticate, 
  authorize("admin", "manager", "service_advisor"), 
  updateVehicleStatus
); // Staff can change vehicle status

router.patch("/:id/transfer-ownership", 
  authenticate, 
  authorize("admin", "manager"), 
  transferOwnership
); // Admin/Manager can transfer ownership

export default router;
