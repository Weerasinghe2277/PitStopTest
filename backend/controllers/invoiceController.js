import { Invoice } from "../models/Invoice.js";
import { Booking } from "../models/Booking.js";
import User from "../models/User.js";
import asyncWrapper from "../middleware/async.js";
import { createCustomError } from "../errors/custom-error.js";

// Create a new invoice
const createInvoice = asyncWrapper(async (req, res, next) => {
  const {
    booking,
    customer,
    items,
    laborCharges,
    tax,
    discount,
    paymentMethod,
    notes,
  } = req.body;

  // Validate required fields
  if (!booking || !customer || !items || items.length === 0) {
    return next(createCustomError("Please provide booking, customer, and at least one item", 400));
  }

  // Verify booking exists and is completed
  const bookingDoc = await Booking.findById(booking);
  if (!bookingDoc) {
    return next(createCustomError("Booking not found", 404));
  }

  if (bookingDoc.status !== "completed") {
    return next(createCustomError("Invoice can only be created for completed bookings", 400));
  }

  // Check if invoice already exists for this booking
  const existingInvoice = await Invoice.findOne({ booking });
  if (existingInvoice) {
    return next(createCustomError("Invoice already exists for this booking", 400));
  }

  // Verify customer exists and matches booking
  const customerDoc = await User.findById(customer);
  if (!customerDoc) {
    return next(createCustomError("Customer not found", 404));
  }

  if (customerDoc.role !== "customer") {
    return next(createCustomError("Specified user is not a customer", 400));
  }

  if (bookingDoc.customer.toString() !== customer) {
    return next(createCustomError("Customer must match the booking customer", 400));
  }

  // Calculate totals
  let subtotal = 0;
  const processedItems = items.map(item => {
    if (!item.description || !item.quantity || !item.unitPrice) {
      throw new Error("Each item must have description, quantity, and unit price");
    }
    
    const itemTotal = item.quantity * item.unitPrice;
    subtotal += itemTotal;
    
    return {
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: itemTotal,
    };
  });

  // Add labor charges to subtotal
  const totalLaborCharges = laborCharges || 0;
  subtotal += totalLaborCharges;

  // Calculate final total
  const taxAmount = tax || 0;
  const discountAmount = discount || 0;
  const finalTotal = subtotal + taxAmount - discountAmount;

  if (finalTotal < 0) {
    return next(createCustomError("Total amount cannot be negative", 400));
  }

  // Create the invoice
  const invoice = await Invoice.create({
    booking,
    customer,
    items: processedItems,
    laborCharges: totalLaborCharges,
    subtotal,
    tax: taxAmount,
    discount: discountAmount,
    total: finalTotal,
    paymentMethod,
    notes,
    createdBy: req.user.userId,
  });

  // Populate related data for response
  await invoice.populate([
    {
      path: 'booking',
      select: 'bookingId serviceType scheduledDate status',
      populate: {
        path: 'vehicle',
        select: 'vehicleId registrationNumber make model'
      }
    },
    {
      path: 'customer',
      select: 'userId profile.firstName profile.lastName profile.phoneNumber email'
    },
    {
      path: 'createdBy',
      select: 'userId profile.firstName profile.lastName role'
    }
  ]);

  res.status(201).json({
    success: true,
    message: "Invoice created successfully",
    invoice,
  });
});

// Get all invoices with filtering and pagination
const getAllInvoices = asyncWrapper(async (req, res) => {
  const {
    customer,
    booking,
    status,
    paymentMethod,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    page = 1,
    limit = 10,
    search,
    sortBy = "createdAt",
    sortOrder = "desc"
  } = req.query;

  // Build query object
  let query = {};

  // Filter by customer
  if (customer) {
    query.customer = customer;
  }

  // Filter by booking
  if (booking) {
    query.booking = booking;
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by payment method
  if (paymentMethod) {
    query.paymentMethod = paymentMethod;
  }

  // Filter by date range
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }

  // Filter by amount range
  if (minAmount || maxAmount) {
    query.total = {};
    if (minAmount) query.total.$gte = parseFloat(minAmount);
    if (maxAmount) query.total.$lte = parseFloat(maxAmount);
  }

  // Search functionality
  if (search) {
    query.$or = [
      { invoiceId: { $regex: search, $options: "i" } },
      { notes: { $regex: search, $options: "i" } },
    ];
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Execute query with population
  const invoices = await Invoice.find(query)
    .populate([
      {
        path: 'booking',
        select: 'bookingId serviceType scheduledDate status',
        populate: {
          path: 'vehicle',
          select: 'vehicleId registrationNumber make model'
        }
      },
      {
        path: 'customer',
        select: 'userId profile.firstName profile.lastName profile.phoneNumber email customerDetails.membershipTier'
      },
      {
        path: 'createdBy',
        select: 'userId profile.firstName profile.lastName role'
      }
    ])
    .sort(sort)
    .limit(limit * 1)
    .skip(skip);

  // Get total count for pagination
  const total = await Invoice.countDocuments(query);

  res.status(200).json({
    success: true,
    count: invoices.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    invoices,
  });
});

// Get invoice by ID
const getInvoiceById = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;

  const invoice = await Invoice.findById(id)
    .populate([
      {
        path: 'booking',
        select: 'bookingId serviceType scheduledDate status description priority',
        populate: {
          path: 'vehicle',
          select: 'vehicleId registrationNumber make model year color mileage'
        }
      },
      {
        path: 'customer',
        select: 'userId profile email customerDetails'
      },
      {
        path: 'createdBy',
        select: 'userId profile.firstName profile.lastName role'
      }
    ]);

  if (!invoice) {
    return next(createCustomError(`No invoice found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    invoice,
  });
});

// Get invoice by invoice ID (INV00001)
const getInvoiceByInvoiceId = asyncWrapper(async (req, res, next) => {
  const { invoiceId } = req.params;

  const invoice = await Invoice.findOne({ 
    invoiceId: invoiceId.toUpperCase() 
  }).populate([
    {
      path: 'booking',
      select: 'bookingId serviceType scheduledDate status description',
      populate: {
        path: 'vehicle',
        select: 'vehicleId registrationNumber make model year'
      }
    },
    {
      path: 'customer',
      select: 'userId profile email customerDetails.membershipTier'
    },
    {
      path: 'createdBy',
      select: 'userId profile.firstName profile.lastName role'
    }
  ]);

  if (!invoice) {
    return next(createCustomError(`No invoice found with invoice ID: ${invoiceId}`, 404));
  }

  res.status(200).json({
    success: true,
    invoice,
  });
});

// Get invoices by customer
const getInvoicesByCustomer = asyncWrapper(async (req, res, next) => {
  const { customerId } = req.params;
  const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query;

  // Verify customer exists
  const customer = await User.findById(customerId);
  if (!customer) {
    return next(createCustomError("Customer not found", 404));
  }

  if (customer.role !== "customer") {
    return next(createCustomError("Specified user is not a customer", 400));
  }

  // Build query
  let query = { customer: customerId };
  if (status) {
    query.status = status;
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  const invoices = await Invoice.find(query)
    .populate([
      {
        path: 'booking',
        select: 'bookingId serviceType scheduledDate',
        populate: {
          path: 'vehicle',
          select: 'vehicleId registrationNumber make model'
        }
      }
    ])
    .sort(sort)
    .limit(limit * 1)
    .skip(skip);

  const total = await Invoice.countDocuments(query);

  res.status(200).json({
    success: true,
    count: invoices.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    invoices,
  });
});

// Update invoice
const updateInvoice = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // Check if invoice exists
  const invoice = await Invoice.findById(id);
  if (!invoice) {
    return next(createCustomError(`No invoice found with id: ${id}`, 404));
  }

  // Prevent updating certain fields
  delete updateData.invoiceId;
  delete updateData.booking;
  delete updateData.customer;
  delete updateData.createdBy;

  // Prevent updating paid invoices (except status and payment details)
  if (invoice.status === "paid") {
    const allowedFields = ["paymentMethod", "paidAt", "notes"];
    const updateFields = Object.keys(updateData);
    const invalidFields = updateFields.filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      return next(createCustomError("Cannot modify paid invoice except payment method, paid date, and notes", 400));
    }
  }

  // Recalculate totals if items are updated
  if (updateData.items) {
    let subtotal = 0;
    const processedItems = updateData.items.map(item => {
      if (!item.description || !item.quantity || !item.unitPrice) {
        throw new Error("Each item must have description, quantity, and unit price");
      }
      
      const itemTotal = item.quantity * item.unitPrice;
      subtotal += itemTotal;
      
      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: itemTotal,
      };
    });

    updateData.items = processedItems;
    subtotal += updateData.laborCharges || invoice.laborCharges;
    updateData.subtotal = subtotal;
    
    const taxAmount = updateData.tax !== undefined ? updateData.tax : invoice.tax;
    const discountAmount = updateData.discount !== undefined ? updateData.discount : invoice.discount;
    updateData.total = subtotal + taxAmount - discountAmount;

    if (updateData.total < 0) {
      return next(createCustomError("Total amount cannot be negative", 400));
    }
  }

  const updatedInvoice = await Invoice.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true,
    }
  ).populate([
    {
      path: 'booking',
      select: 'bookingId serviceType scheduledDate status',
      populate: {
        path: 'vehicle',
        select: 'vehicleId registrationNumber make model'
      }
    },
    {
      path: 'customer',
      select: 'userId profile.firstName profile.lastName profile.phoneNumber email'
    },
    {
      path: 'createdBy',
      select: 'userId profile.firstName profile.lastName role'
    }
  ]);

  res.status(200).json({
    success: true,
    message: "Invoice updated successfully",
    invoice: updatedInvoice,
  });
});

// Update invoice status
const updateInvoiceStatus = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { status, paymentMethod, paidAt } = req.body;

  if (!status || !["draft", "pending", "paid", "cancelled"].includes(status)) {
    return next(createCustomError("Please provide a valid status (draft, pending, paid, cancelled)", 400));
  }

  const invoice = await Invoice.findById(id);
  if (!invoice) {
    return next(createCustomError(`No invoice found with id: ${id}`, 404));
  }

  // Validate status transitions
  if (invoice.status === "paid" && status !== "paid") {
    return next(createCustomError("Cannot change status of a paid invoice", 400));
  }

  if (invoice.status === "cancelled" && status !== "cancelled") {
    return next(createCustomError("Cannot change status of a cancelled invoice", 400));
  }

  // If marking as paid, require payment method
  if (status === "paid") {
    if (!paymentMethod) {
      return next(createCustomError("Payment method is required when marking invoice as paid", 400));
    }
    invoice.paymentMethod = paymentMethod;
    invoice.paidAt = paidAt || new Date();
  }

  invoice.status = status;
  await invoice.save();

  await invoice.populate([
    {
      path: 'customer',
      select: 'userId profile.firstName profile.lastName'
    },
    {
      path: 'booking',
      select: 'bookingId'
    }
  ]);

  res.status(200).json({
    success: true,
    message: "Invoice status updated successfully",
    invoice,
  });
});

// Delete invoice (soft delete by changing status to cancelled)
const deleteInvoice = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { permanent = false } = req.query;

  const invoice = await Invoice.findById(id);
  if (!invoice) {
    return next(createCustomError(`No invoice found with id: ${id}`, 404));
  }

  // Cannot delete paid invoices
  if (invoice.status === "paid") {
    return next(createCustomError("Cannot delete a paid invoice", 400));
  }

  if (permanent === "true") {
    // Permanent deletion (admin only)
    await Invoice.findByIdAndDelete(id);
    res.status(200).json({
      success: true,
      message: "Invoice permanently deleted",
      invoice: {
        invoiceId: invoice.invoiceId,
        total: invoice.total,
      },
    });
  } else {
    // Soft delete - change status to cancelled
    invoice.status = "cancelled";
    await invoice.save();
    
    res.status(200).json({
      success: true,
      message: "Invoice cancelled successfully",
      invoice: {
        invoiceId: invoice.invoiceId,
        status: invoice.status,
        total: invoice.total,
      },
    });
  }
});

// Get invoice statistics
const getInvoiceStats = asyncWrapper(async (req, res) => {
  // Invoice count by status
  const statusStats = await Invoice.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$total" }
      },
    },
  ]);

  // Invoice count by payment method
  const paymentMethodStats = await Invoice.aggregate([
    {
      $match: { status: "paid" }
    },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        totalAmount: { $sum: "$total" }
      },
    },
  ]);

  // Monthly revenue (last 12 months)
  const revenueStats = await Invoice.aggregate([
    {
      $match: {
        status: "paid",
        paidAt: {
          $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$paidAt" },
          month: { $month: "$paidAt" }
        },
        totalRevenue: { $sum: "$total" },
        invoiceCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 }
    }
  ]);

  // Top customers by spending
  const topCustomers = await Invoice.aggregate([
    {
      $match: { status: "paid" }
    },
    {
      $group: {
        _id: "$customer",
        totalSpent: { $sum: "$total" },
        invoiceCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "customerInfo"
      }
    },
    {
      $unwind: "$customerInfo"
    },
    {
      $project: {
        customerId: "$customerInfo.userId",
        customerName: {
          $concat: ["$customerInfo.profile.firstName", " ", "$customerInfo.profile.lastName"]
        },
        totalSpent: 1,
        invoiceCount: 1
      }
    },
    {
      $sort: { totalSpent: -1 }
    },
    {
      $limit: 10
    }
  ]);

  // Total counts and amounts
  const totalInvoices = await Invoice.countDocuments();
  const paidInvoices = await Invoice.countDocuments({ status: "paid" });
  const pendingInvoices = await Invoice.countDocuments({ status: "pending" });
  const cancelledInvoices = await Invoice.countDocuments({ status: "cancelled" });

  // Total revenue
  const totalRevenueResult = await Invoice.aggregate([
    { $match: { status: "paid" } },
    { $group: { _id: null, totalRevenue: { $sum: "$total" } } }
  ]);
  const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].totalRevenue : 0;

  // Average invoice amount
  const avgInvoiceResult = await Invoice.aggregate([
    { $group: { _id: null, avgAmount: { $avg: "$total" } } }
  ]);
  const averageInvoiceAmount = avgInvoiceResult.length > 0 ? Math.round(avgInvoiceResult[0].avgAmount) : 0;

  res.status(200).json({
    success: true,
    stats: {
      totalInvoices,
      paidInvoices,
      pendingInvoices,
      cancelledInvoices,
      totalRevenue,
      averageInvoiceAmount,
      statusStats,
      paymentMethodStats,
      revenueStats,
      topCustomers,
    },
  });
});

// Search invoices (for quick lookups)
const searchInvoices = asyncWrapper(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({
      success: true,
      invoices: [],
      message: "Please provide at least 2 characters for search",
    });
  }

  const searchQuery = {
    $or: [
      { invoiceId: { $regex: q, $options: "i" } },
      { notes: { $regex: q, $options: "i" } },
    ],
  };

  const invoices = await Invoice.find(searchQuery)
    .populate([
      {
        path: 'customer',
        select: 'userId profile.firstName profile.lastName'
      },
      {
        path: 'booking',
        select: 'bookingId',
        populate: {
          path: 'vehicle',
          select: 'registrationNumber'
        }
      }
    ])
    .select('invoiceId total status createdAt customer booking')
    .limit(limit * 1)
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: invoices.length,
    invoices,
  });
});

// Generate invoice PDF (placeholder for future implementation)
const generateInvoicePDF = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;

  const invoice = await Invoice.findById(id)
    .populate([
      {
        path: 'booking',
        populate: {
          path: 'vehicle',
          select: 'vehicleId registrationNumber make model year'
        }
      },
      {
        path: 'customer',
        select: 'profile email'
      }
    ]);

  if (!invoice) {
    return next(createCustomError(`No invoice found with id: ${id}`, 404));
  }

  // TODO: Implement PDF generation using libraries like puppeteer, jsPDF, or PDFKit
  // For now, return invoice data that can be used to generate PDF on frontend
  
  res.status(200).json({
    success: true,
    message: "Invoice data ready for PDF generation",
    invoice,
    pdfData: {
      invoiceId: invoice.invoiceId,
      date: invoice.createdAt,
      dueDate: new Date(invoice.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
      customer: invoice.customer,
      booking: invoice.booking,
      items: invoice.items,
      laborCharges: invoice.laborCharges,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      discount: invoice.discount,
      total: invoice.total,
      status: invoice.status
    }
  });
});

export {
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
};
