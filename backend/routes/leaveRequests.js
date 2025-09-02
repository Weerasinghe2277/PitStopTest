import express from "express";
import {
  createLeaveRequest,
  getAllLeaveRequests,
  getMyLeaveRequests,
  getLeaveRequestById,
  updateLeaveRequest,
  deleteLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  getLeaveStats,
  getUpcomingLeaves,
} from "../controllers/leaveRequestController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Employee routes - all employees can access these
router.post("/", authenticate, createLeaveRequest);
router.get("/my-requests", authenticate, getMyLeaveRequests);

// Admin/Manager routes for leave management
router.get("/", authenticate, authorize("admin", "manager"), getAllLeaveRequests);
router.get("/stats", authenticate, authorize("admin", "manager"), getLeaveStats);
router.get("/upcoming", authenticate, authorize("admin", "manager"), getUpcomingLeaves);

// Routes that require ID parameter
router.route("/:id")
  .get(authenticate, getLeaveRequestById) // Employee can view their own, Admin/Manager can view any
  .patch(authenticate, updateLeaveRequest) // Employee can update their own pending requests
  .delete(authenticate, deleteLeaveRequest); // Employee can delete their own pending requests

// Admin/Manager approval routes
router.patch("/:id/approve", authenticate, authorize("admin", "manager"), approveLeaveRequest);
router.patch("/:id/reject", authenticate, authorize("admin", "manager"), rejectLeaveRequest);

export default router;
