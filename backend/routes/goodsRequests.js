import express from "express";
import {
  createGoodsRequest,
  getAllGoodsRequests,
  getMyGoodsRequests,
  getGoodsRequestById,
  updateGoodsRequest,
  deleteGoodsRequest,
  approveGoodsRequest,
  rejectGoodsRequest,
  releaseGoods,
  getGoodsRequestStats,
  getPendingGoodsRequests,
} from "../controllers/goodsRequestController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Inspector routes - service advisors (inspectors) can create and manage their requests
router.post("/", authenticate, authorize("service_advisor", "manager", "admin"), createGoodsRequest);
router.get("/my-requests", authenticate, getMyGoodsRequests);

// Inventory Manager routes for goods request management
router.get("/", authenticate, authorize("admin", "manager"), getAllGoodsRequests);
router.get("/pending", authenticate, authorize("admin", "manager"), getPendingGoodsRequests);
router.get("/stats", authenticate, authorize("admin", "manager"), getGoodsRequestStats);

// Routes that require ID parameter
router.route("/:id")
  .get(authenticate, getGoodsRequestById) // User can view their own, Inventory Manager/Admin can view any
  .patch(authenticate, updateGoodsRequest) // Inspector can update their own pending requests
  .delete(authenticate, deleteGoodsRequest); // Inspector can delete their own pending requests

// Inventory Manager approval/rejection routes
router.patch("/:id/approve", authenticate, authorize("admin", "manager"), approveGoodsRequest);
router.patch("/:id/reject", authenticate, authorize("admin", "manager"), rejectGoodsRequest);
router.patch("/:id/release", authenticate, authorize("admin", "manager"), releaseGoods);

export default router;
