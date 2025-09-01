import express from "express";
import {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  getInvoiceByInvoiceId,
  getInvoicesByCustomer,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceStats,
  searchInvoices,
  generateInvoicePDF,
} from "../controllers/invoiceController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public routes (limited access)
router.get("/search", authenticate, searchInvoices); // Quick search for invoices

// Protected routes - require authentication
// Invoice CRUD operations
router.route("/")
  .get(authenticate, getAllInvoices) // All staff can view invoices
  .post(authenticate, authorize("admin", "manager", "service_advisor"), createInvoice); // Staff can create invoices

// Invoice statistics (admin/manager only)
router.get("/stats/overview", authenticate, authorize("admin", "manager"), getInvoiceStats);

// Invoice by invoice ID (INV00001)
router.get("/invoice-id/:invoiceId", authenticate, getInvoiceByInvoiceId);

// Invoices by customer (customers can see their own, staff can see all)
router.get("/customer/:customerId", authenticate, getInvoicesByCustomer);

// Invoice management by ID
router.route("/:id")
  .get(authenticate, getInvoiceById) // All authenticated users can view invoice details
  .patch(authenticate, authorize("admin", "manager", "service_advisor"), updateInvoice) // Staff can update invoices
  .delete(authenticate, authorize("admin", "manager"), deleteInvoice); // Admin/Manager can delete invoices

// Specialized invoice operations
router.patch("/:id/status", 
  authenticate, 
  authorize("admin", "manager", "service_advisor"), 
  updateInvoiceStatus
); // Staff can update invoice status (for payments)

router.get("/:id/pdf", 
  authenticate, 
  generateInvoicePDF
); // Generate PDF for any authenticated user

export default router;
