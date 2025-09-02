import { Booking } from "../models/Booking.js";
import User from "../models/User.js";
import { createCustomError } from "../errors/custom-error.js";
import asyncWrapper from "../middleware/async.js";

// Create booking (cashier only)
const createBooking = asyncWrapper(async (req, res, next) => {
  const { customer, vehicle, serviceType, scheduledDate, timeSlot, description, priority } = req.body;

  // Validate required fields
  if (!customer || !vehicle || !serviceType || !scheduledDate || !timeSlot) {
    return next(createCustomError("Missing required booking fields", 400));
  }

  // Check if customer exists and is a customer role
  const customerUser = await User.findById(customer);
  if (!customerUser) {
    return next(createCustomError("Customer not found", 404));
  }
  if (customerUser.role !== "customer") {
    return next(createCustomError("Selected user is not a customer", 400));
  }

  // Create booking with initial log entry
  const bookingData = {
    customer,
    vehicle,
    serviceType,
    scheduledDate,
    timeSlot,
    description,
    priority: priority || "medium",
    createdBy: req.user.userId,
    notes: [{
      note: "Booking created",
      createdBy: req.user.userId,
      createdAt: new Date()
    }]
  };

  const booking = await Booking.create(bookingData);

  // Populate customer and vehicle details
  await booking.populate("customer vehicle createdBy");

  res.status(201).json({
    success: true,
    message: "Booking created successfully",
    booking,
  });
});

// Get all bookings with filtering and pagination
const getAllBookings = asyncWrapper(async (req, res) => {
  const {
    status,
    serviceType,
    priority,
    customer,
    assignedInspector,
    page = 1,
    limit = 10,
    search,
    dateFrom,
    dateTo
  } = req.query;

  let query = {};

  // Build query based on filters
  if (status) query.status = status;
  if (serviceType) query.serviceType = serviceType;
  if (priority) query.priority = priority;
  if (customer) query.customer = customer;
  if (assignedInspector) query.assignedInspector = assignedInspector;

  // Date range filter
  if (dateFrom || dateTo) {
    query.scheduledDate = {};
    if (dateFrom) query.scheduledDate.$gte = new Date(dateFrom);
    if (dateTo) query.scheduledDate.$lte = new Date(dateTo);
  }

  // Add search functionality
  if (search) {
    query.$or = [
      { bookingId: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  const bookings = await Booking.find(query)
    .populate("customer", "userId profile.firstName profile.lastName email profile.phoneNumber")
    .populate("vehicle", "vehicleId make model year licensePlate")
    .populate("assignedInspector", "userId profile.firstName profile.lastName")
    .populate("createdBy", "userId profile.firstName profile.lastName")
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: -1 });

  const total = await Booking.countDocuments(query);

  res.status(200).json({
    success: true,
    count: bookings.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    bookings,
  });
});

// Get booking by ID
const getBookingById = asyncWrapper(async (req, res, next) => {
  const { id: bookingId } = req.params;

  const booking = await Booking.findById(bookingId)
    .populate("customer", "userId profile.firstName profile.lastName email profile.phoneNumber profile.address customerDetails")
    .populate("vehicle")
    .populate("assignedInspector", "userId profile.firstName profile.lastName employeeDetails")
    .populate("createdBy", "userId profile.firstName profile.lastName")
    .populate("notes.createdBy", "userId profile.firstName profile.lastName");

  if (!booking) {
    return next(createCustomError(`No booking with id: ${bookingId}`, 404));
  }

  res.status(200).json({
    success: true,
    booking,
  });
});

// Update booking (cashier/admin only)
const updateBooking = asyncWrapper(async (req, res, next) => {
  const { id: bookingId } = req.params;

  // Prevent updating certain sensitive fields
  const restrictedFields = ["bookingId", "createdBy", "customer"];
  restrictedFields.forEach(field => delete req.body[field]);

  const booking = await Booking.findByIdAndUpdate(
    bookingId,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  ).populate("customer vehicle assignedInspector createdBy");

  if (!booking) {
    return next(createCustomError(`No booking with id: ${bookingId}`, 404));
  }

  res.status(200).json({
    success: true,
    message: "Booking updated successfully",
    booking,
  });
});

// Cancel booking (cashier/admin only)
const cancelBooking = asyncWrapper(async (req, res, next) => {
  const { id: bookingId } = req.params;
  const { reason } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return next(createCustomError(`No booking with id: ${bookingId}`, 404));
  }

  // Check if booking can be cancelled
  if (booking.status === "completed") {
    return next(createCustomError("Cannot cancel a completed booking", 400));
  }

  if (booking.status === "cancelled") {
    return next(createCustomError("Booking is already cancelled", 400));
  }

  booking.status = "cancelled";
  booking.notes.push({
    note: reason || "Booking cancelled",
    createdBy: req.user.userId,
    createdAt: new Date()
  });

  await booking.save();
  await booking.populate("customer vehicle assignedInspector createdBy");

  res.status(200).json({
    success: true,
    message: "Booking cancelled successfully",
    booking,
  });
});

// Assign inspector to booking (cashier only)
const assignInspector = asyncWrapper(async (req, res, next) => {
  const { id: bookingId } = req.params;
  const { inspectorId } = req.body;

  if (!inspectorId) {
    return next(createCustomError("Inspector ID is required", 400));
  }

  // Check if inspector exists and has correct role
  const inspector = await User.findById(inspectorId);
  if (!inspector) {
    return next(createCustomError("Inspector not found", 404));
  }

  if (inspector.role !== "service_advisor") {
    return next(createCustomError("Selected user is not a service advisor/inspector", 400));
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return next(createCustomError(`No booking with id: ${bookingId}`, 404));
  }

  // Check if booking is in correct status
  if (booking.status !== "pending") {
    return next(createCustomError("Can only assign inspector to pending bookings", 400));
  }

  booking.assignedInspector = inspectorId;
  booking.status = "inspecting";
  booking.notes.push({
    note: `Inspector assigned: ${inspector.profile.firstName} ${inspector.profile.lastName}`,
    createdBy: req.user.userId,
    createdAt: new Date()
  });

  await booking.save();
  await booking.populate("customer vehicle assignedInspector createdBy");

  res.status(200).json({
    success: true,
    message: "Inspector assigned successfully",
    booking,
  });
});

// Update booking status (inspector/cashier)
const updateBookingStatus = asyncWrapper(async (req, res, next) => {
  const { id: bookingId } = req.params;
  const { status, note } = req.body;

  if (!status) {
    return next(createCustomError("Status is required", 400));
  }

  const validStatuses = ["pending", "inspecting", "working", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    return next(createCustomError("Invalid status", 400));
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return next(createCustomError(`No booking with id: ${bookingId}`, 404));
  }

  // Status transition validation
  const currentStatus = booking.status;
  const allowedTransitions = {
    pending: ["inspecting", "cancelled"],
    inspecting: ["working", "cancelled"],
    working: ["completed", "cancelled"],
    completed: [],
    cancelled: []
  };

  if (!allowedTransitions[currentStatus].includes(status)) {
    return next(createCustomError(`Cannot change status from ${currentStatus} to ${status}`, 400));
  }

  booking.status = status;

  if (status === "completed") {
    booking.completedAt = new Date();
  }

  booking.notes.push({
    note: note || `Status updated to ${status}`,
    createdBy: req.user.userId,
    createdAt: new Date()
  });

  await booking.save();
  await booking.populate("customer vehicle assignedInspector createdBy");

  res.status(200).json({
    success: true,
    message: "Booking status updated successfully",
    booking,
  });
});

// Add note to booking
const addBookingNote = asyncWrapper(async (req, res, next) => {
  const { id: bookingId } = req.params;
  const { note } = req.body;

  if (!note) {
    return next(createCustomError("Note is required", 400));
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return next(createCustomError(`No booking with id: ${bookingId}`, 404));
  }

  booking.notes.push({
    note,
    createdBy: req.user.userId,
    createdAt: new Date()
  });

  await booking.save();
  await booking.populate("notes.createdBy", "userId profile.firstName profile.lastName");

  res.status(200).json({
    success: true,
    message: "Note added successfully",
    notes: booking.notes,
  });
});

// Get booking statistics (admin/manager only)
const getBookingStats = asyncWrapper(async (req, res) => {
  const statusStats = await Booking.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const serviceTypeStats = await Booking.aggregate([
    {
      $group: {
        _id: "$serviceType",
        count: { $sum: 1 },
      },
    },
  ]);

  const priorityStats = await Booking.aggregate([
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);

  const recentBookings = await Booking.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { "_id": 1 }
    }
  ]);

  const totalBookings = await Booking.countDocuments();
  const pendingBookings = await Booking.countDocuments({ status: "pending" });
  const completedBookings = await Booking.countDocuments({ status: "completed" });
  const cancelledBookings = await Booking.countDocuments({ status: "cancelled" });

  res.status(200).json({
    success: true,
    stats: {
      totalBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      statusStats,
      serviceTypeStats,
      priorityStats,
      recentBookings,
    },
  });
});

// Get available inspectors (service advisors)
const getAvailableInspectors = asyncWrapper(async (req, res) => {
  const inspectors = await User.find({
    role: "service_advisor",
    status: "active"
  })
    .select("userId profile.firstName profile.lastName employeeDetails.department employeeDetails.specializations")
    .sort({ "profile.firstName": 1 });

  res.status(200).json({
    success: true,
    count: inspectors.length,
    inspectors,
  });
});

export {
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
};
