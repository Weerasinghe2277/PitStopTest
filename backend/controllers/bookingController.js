import { Booking } from "../models/Booking.js";
import { Vehicle } from "../models/Vehicle.js";
import User from "../models/User.js";
import asyncWrapper from "../middleware/async.js";
import { createCustomError } from "../errors/custom-error.js";

// Create new booking
const createBooking = asyncWrapper(async (req, res, next) => {
  const { customer, vehicle, serviceType, scheduledDate, timeSlot, description } = req.body;

  // Validate required fields
  if (!customer || !vehicle || !serviceType || !scheduledDate || !timeSlot) {
    return next(createCustomError("Customer, vehicle, service type, scheduled date, and time slot are required", 400));
  }

  // Validate service type
  const validServiceTypes = ["inspection", "repair", "maintenance", "bodywork", "detailing"];
  if (!validServiceTypes.includes(serviceType)) {
    return next(createCustomError("Invalid service type", 400));
  }

  // Validate time slot
  const validTimeSlots = ["09:00-11:00", "11:00-13:00", "13:00-15:00", "15:00-17:00"];
  if (!validTimeSlots.includes(timeSlot)) {
    return next(createCustomError("Invalid time slot", 400));
  }

  // Verify customer exists and is a customer
  const customerDoc = await User.findById(customer);
  if (!customerDoc) {
    return next(createCustomError("Customer not found", 404));
  }
  if (customerDoc.role !== "customer") {
    return next(createCustomError("Specified user is not a customer", 400));
  }

  // Verify vehicle exists and belongs to customer
  const vehicleDoc = await Vehicle.findById(vehicle);
  if (!vehicleDoc) {
    return next(createCustomError("Vehicle not found", 404));
  }
  if (vehicleDoc.owner.toString() !== customer) {
    return next(createCustomError("Vehicle must belong to the customer", 400));
  }

  // Check if time slot is available (no other booking at same date/time)
  const existingBooking = await Booking.findOne({
    scheduledDate: new Date(scheduledDate),
    timeSlot,
    status: { $nin: ["cancelled", "completed"] }
  });

  if (existingBooking) {
    return next(createCustomError("Time slot is already booked", 400));
  }

  // Validate scheduled date (cannot be in the past)
  const scheduleDate = new Date(scheduledDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (scheduleDate < today) {
    return next(createCustomError("Scheduled date cannot be in the past", 400));
  }

  // Create booking data
  const bookingData = {
    customer,
    vehicle,
    serviceType,
    scheduledDate: scheduleDate,
    timeSlot,
    description,
    createdBy: req.user.userId,
    status: "pending"
  };

  const booking = await Booking.create(bookingData);

  // Populate the booking for response
  const populatedBooking = await Booking.findById(booking._id)
    .populate('customer', 'userId profile.firstName profile.lastName email profile.phoneNumber')
    .populate('vehicle', 'vehicleId registrationNumber make model year')
    .populate('createdBy', 'userId profile.firstName profile.lastName role');

  res.status(201).json({
    success: true,
    message: "Booking created successfully",
    booking: populatedBooking,
  });
});

// Get all bookings with filtering and pagination
const getAllBookings = asyncWrapper(async (req, res) => {
  const { 
    status, 
    serviceType, 
    customer,
    vehicle,
    assignedInspector,
    priority,
    dateFrom,
    dateTo,
    page = 1, 
    limit = 10, 
    search,
    sortBy = 'scheduledDate',
    sortOrder = 'asc'
  } = req.query;

  let query = {};

  // Build query based on filters
  if (status) query.status = status;
  if (serviceType) query.serviceType = serviceType;
  if (customer) query.customer = customer;
  if (vehicle) query.vehicle = vehicle;
  if (assignedInspector) query.assignedInspector = assignedInspector;
  if (priority) query.priority = priority;

  // Date range filter
  if (dateFrom || dateTo) {
    query.scheduledDate = {};
    if (dateFrom) query.scheduledDate.$gte = new Date(dateFrom);
    if (dateTo) query.scheduledDate.$lte = new Date(dateTo);
  }

  // Add search functionality
  if (search) {
    query.$or = [
      { bookingId: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') }
    ];
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Build sort object
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const bookings = await Booking.find(query)
    .populate('customer', 'userId profile.firstName profile.lastName email profile.phoneNumber')
    .populate('vehicle', 'vehicleId registrationNumber make model year')
    .populate('assignedInspector', 'userId profile.firstName profile.lastName employeeDetails.employeeId')
    .populate('createdBy', 'userId profile.firstName profile.lastName role')
    .limit(parseInt(limit))
    .skip(skip)
    .sort(sortOptions);

  const total = await Booking.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: bookings.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    bookings,
  });
});

// Get booking by ID
const getBookingById = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  
  const booking = await Booking.findById(id)
    .populate('customer', 'userId profile.firstName profile.lastName email profile.phoneNumber profile.address')
    .populate('vehicle', 'vehicleId registrationNumber make model year mileage fuelType transmission')
    .populate('assignedInspector', 'userId profile.firstName profile.lastName employeeDetails.employeeId employeeDetails.specializations')
    .populate('createdBy', 'userId profile.firstName profile.lastName role')
    .populate('notes.createdBy', 'userId profile.firstName profile.lastName');
  
  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    booking,
  });
});

// Get booking by bookingId
const getBookingByBookingId = asyncWrapper(async (req, res, next) => {
  const { bookingId } = req.params;
  
  const booking = await Booking.findOne({ bookingId: bookingId.toUpperCase() })
    .populate('customer', 'userId profile.firstName profile.lastName email profile.phoneNumber profile.address')
    .populate('vehicle', 'vehicleId registrationNumber make model year mileage fuelType transmission')
    .populate('assignedInspector', 'userId profile.firstName profile.lastName employeeDetails.employeeId employeeDetails.specializations')
    .populate('createdBy', 'userId profile.firstName profile.lastName role')
    .populate('notes.createdBy', 'userId profile.firstName profile.lastName');
  
  if (!booking) {
    return next(createCustomError(`No booking found with bookingId: ${bookingId}`, 404));
  }

  res.status(200).json({
    success: true,
    booking,
  });
});

// Update booking
const updateBooking = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;

  // Prevent updating auto-generated fields
  const restrictedFields = ["bookingId", "customer", "createdBy", "createdAt"];
  restrictedFields.forEach(field => delete req.body[field]);

  // Validate status if provided
  if (req.body.status) {
    const validStatuses = ["pending", "inspecting", "working", "completed", "cancelled"];
    if (!validStatuses.includes(req.body.status)) {
      return next(createCustomError("Invalid status", 400));
    }
  }

  // Validate service type if provided
  if (req.body.serviceType) {
    const validServiceTypes = ["inspection", "repair", "maintenance", "bodywork", "detailing"];
    if (!validServiceTypes.includes(req.body.serviceType)) {
      return next(createCustomError("Invalid service type", 400));
    }
  }

  // Validate time slot if provided
  if (req.body.timeSlot) {
    const validTimeSlots = ["09:00-11:00", "11:00-13:00", "13:00-15:00", "15:00-17:00"];
    if (!validTimeSlots.includes(req.body.timeSlot)) {
      return next(createCustomError("Invalid time slot", 400));
    }
  }

  // Validate priority if provided
  if (req.body.priority) {
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (!validPriorities.includes(req.body.priority)) {
      return next(createCustomError("Invalid priority", 400));
    }
  }

  // If updating scheduled date or time slot, check availability
  if (req.body.scheduledDate || req.body.timeSlot) {
    const currentBooking = await Booking.findById(id);
    if (!currentBooking) {
      return next(createCustomError(`No booking found with id: ${id}`, 404));
    }

    const checkDate = req.body.scheduledDate ? new Date(req.body.scheduledDate) : currentBooking.scheduledDate;
    const checkTimeSlot = req.body.timeSlot || currentBooking.timeSlot;

    const conflictBooking = await Booking.findOne({
      _id: { $ne: id },
      scheduledDate: checkDate,
      timeSlot: checkTimeSlot,
      status: { $nin: ["cancelled", "completed"] }
    });

    if (conflictBooking) {
      return next(createCustomError("Time slot is already booked", 400));
    }
  }

  // Set completed date if status is being set to completed
  if (req.body.status === "completed" && !req.body.completedAt) {
    req.body.completedAt = new Date();
  }

  const booking = await Booking.findByIdAndUpdate(
    id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  ).populate('customer', 'userId profile.firstName profile.lastName email')
   .populate('vehicle', 'vehicleId registrationNumber make model')
   .populate('assignedInspector', 'userId profile.firstName profile.lastName');

  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    message: "Booking updated successfully",
    booking,
  });
});

// Assign inspector to booking
const assignInspector = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { inspectorId } = req.body;

  if (!inspectorId) {
    return next(createCustomError("Inspector ID is required", 400));
  }

  // Verify inspector exists and has correct role
  const inspector = await User.findById(inspectorId);
  if (!inspector) {
    return next(createCustomError("Inspector not found", 404));
  }

  if (!["service_advisor", "manager", "admin"].includes(inspector.role)) {
    return next(createCustomError("User is not authorized to be an inspector", 400));
  }

  const booking = await Booking.findByIdAndUpdate(
    id,
    { 
      assignedInspector: inspectorId,
      status: "inspecting"
    },
    { new: true, runValidators: true }
  ).populate('assignedInspector', 'userId profile.firstName profile.lastName employeeDetails.employeeId');

  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    message: "Inspector assigned successfully",
    booking: {
      bookingId: booking.bookingId,
      status: booking.status,
      assignedInspector: booking.assignedInspector
    }
  });
});

// Update booking status
const updateBookingStatus = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!status) {
    return next(createCustomError("Status is required", 400));
  }

  const validStatuses = ["pending", "inspecting", "working", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    return next(createCustomError("Invalid status", 400));
  }

  const updateData = { status };

  // Set completion date if status is completed
  if (status === "completed") {
    updateData.completedAt = new Date();
  }

  const booking = await Booking.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  );

  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  // Add note if provided
  if (notes) {
    booking.notes.push({
      note: notes,
      createdBy: req.user.userId,
      createdAt: new Date()
    });
    await booking.save();
  }

  res.status(200).json({
    success: true,
    message: "Booking status updated successfully",
    booking: {
      bookingId: booking.bookingId,
      status: booking.status,
      completedAt: booking.completedAt
    }
  });
});

// Add note to booking
const addBookingNote = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || note.trim().length === 0) {
    return next(createCustomError("Note content is required", 400));
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  booking.notes.push({
    note: note.trim(),
    createdBy: req.user.userId,
    createdAt: new Date()
  });

  await booking.save();

  // Populate the newly added note
  await booking.populate('notes.createdBy', 'userId profile.firstName profile.lastName');

  res.status(200).json({
    success: true,
    message: "Note added successfully",
    note: booking.notes[booking.notes.length - 1]
  });
});

// Cancel booking
const cancelBooking = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const booking = await Booking.findById(id);
  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  if (booking.status === "completed") {
    return next(createCustomError("Cannot cancel a completed booking", 400));
  }

  if (booking.status === "cancelled") {
    return next(createCustomError("Booking is already cancelled", 400));
  }

  booking.status = "cancelled";
  
  // Add cancellation note
  if (reason) {
    booking.notes.push({
      note: `Booking cancelled: ${reason}`,
      createdBy: req.user.userId,
      createdAt: new Date()
    });
  }

  await booking.save();

  res.status(200).json({
    success: true,
    message: "Booking cancelled successfully",
    booking: {
      bookingId: booking.bookingId,
      status: booking.status
    }
  });
});

// Delete booking
const deleteBooking = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  
  const booking = await Booking.findById(id);
  if (!booking) {
    return next(createCustomError(`No booking found with id: ${id}`, 404));
  }

  // Prevent deletion of bookings that are in progress or completed
  if (["working", "completed"].includes(booking.status)) {
    return next(createCustomError("Cannot delete bookings that are in progress or completed", 400));
  }

  await Booking.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Booking deleted successfully",
    booking: {
      id: booking._id,
      bookingId: booking.bookingId
    },
  });
});

// Get booking statistics
const getBookingStats = asyncWrapper(async (req, res) => {
  // Status-wise stats
  const statusStats = await Booking.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Service type stats
  const serviceTypeStats = await Booking.aggregate([
    {
      $group: {
        _id: '$serviceType',
        count: { $sum: 1 },
        avgCost: { $avg: '$actualCost' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Priority stats
  const priorityStats = await Booking.aggregate([
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);

  // Monthly booking trends (last 12 months)
  const monthlyStats = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 },
        totalRevenue: { $sum: '$actualCost' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  // Today's bookings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayBookings = await Booking.countDocuments({
    scheduledDate: { $gte: today, $lt: tomorrow }
  });

  // Overdue bookings (scheduled but not completed)
  const overdueBookings = await Booking.countDocuments({
    scheduledDate: { $lt: today },
    status: { $nin: ['completed', 'cancelled'] }
  });

  res.status(200).json({
    success: true,
    stats: {
      statusBreakdown: statusStats,
      serviceTypeBreakdown: serviceTypeStats,
      priorityBreakdown: priorityStats,
      monthlyTrends: monthlyStats,
      todayBookings,
      overdueBookings,
      totalBookings: await Booking.countDocuments()
    }
  });
});

// Search bookings
const searchBookings = asyncWrapper(async (req, res, next) => {
  const { q, status, serviceType, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) {
    return next(createCustomError("Search query must be at least 2 characters long", 400));
  }

  let query = {
    $or: [
      { bookingId: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') }
    ]
  };

  if (status) {
    query.status = status;
  }

  if (serviceType) {
    query.serviceType = serviceType;
  }

  const bookings = await Booking.find(query)
    .populate('customer', 'userId profile.firstName profile.lastName')
    .populate('vehicle', 'vehicleId registrationNumber make model')
    .limit(parseInt(limit))
    .sort({ scheduledDate: -1 })
    .select('bookingId customer vehicle serviceType scheduledDate status priority');

  res.status(200).json({
    success: true,
    query: q,
    count: bookings.length,
    bookings
  });
});

// Get bookings by customer
const getBookingsByCustomer = asyncWrapper(async (req, res, next) => {
  const { customerId } = req.params;
  const { status, page = 1, limit = 10 } = req.query;

  // Verify customer exists
  const customer = await User.findById(customerId);
  if (!customer) {
    return next(createCustomError("Customer not found", 404));
  }

  if (customer.role !== "customer") {
    return next(createCustomError("Specified user is not a customer", 400));
  }

  let query = { customer: customerId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const bookings = await Booking.find(query)
    .populate('vehicle', 'vehicleId registrationNumber make model year')
    .populate('assignedInspector', 'userId profile.firstName profile.lastName')
    .limit(parseInt(limit))
    .skip(skip)
    .sort({ scheduledDate: -1 });

  const total = await Booking.countDocuments(query);

  res.status(200).json({
    success: true,
    customer: {
      id: customer._id,
      userId: customer.userId,
      name: customer.fullName
    },
    count: bookings.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    bookings
  });
});

export {
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
};
