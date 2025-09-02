import { LeaveRequest } from "../models/LeaveRequest .js";
import User from "../models/User.js";
import asyncWrapper from "../middleware/async.js";
import { StatusCodes } from "http-status-codes";
import { createCustomError } from "../errors/custom-error.js";

// Create leave request (Employee)
const createLeaveRequest = asyncWrapper(async (req, res, next) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  const employeeId = req.user.userId;

  // Validate required fields
  if (!leaveType || !startDate || !endDate || !reason) {
    return next(createCustomError("All fields are required", 400));
  }

  // Validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();

  if (start < today) {
    return next(createCustomError("Start date cannot be in the past", 400));
  }

  if (end < start) {
    return next(createCustomError("End date cannot be before start date", 400));
  }

  // Check if employee exists and is actually an employee
  const employee = await User.findById(employeeId);
  if (!employee) {
    return next(createCustomError("Employee not found", 404));
  }

  if (!["technician", "service_advisor", "manager", "admin", "cashier"].includes(employee.role)) {
    return next(createCustomError("Only employees can submit leave requests", 400));
  }

  // Check for overlapping leave requests
  const overlappingLeave = await LeaveRequest.findOne({
    employee: employeeId,
    status: { $in: ["pending", "approved"] },
    $or: [
      {
        startDate: { $lte: end },
        endDate: { $gte: start }
      }
    ]
  });

  if (overlappingLeave) {
    return next(createCustomError("You already have a leave request for overlapping dates", 400));
  }

  const leaveRequest = await LeaveRequest.create({
    employee: employeeId,
    leaveType,
    startDate: start,
    endDate: end,
    reason,
  });

  // Populate employee details
  await leaveRequest.populate('employee', 'userId profile.firstName profile.lastName email role employeeDetails.department');

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Leave request submitted successfully",
    leaveRequest,
  });
});

// Get all leave requests (Admin/Manager)
const getAllLeaveRequests = asyncWrapper(async (req, res) => {
  const { status, leaveType, department, startDate, endDate, page = 1, limit = 10 } = req.query;

  let query = {};

  // Build query based on filters
  if (status) {
    query.status = status;
  }

  if (leaveType) {
    query.leaveType = leaveType;
  }

  if (startDate || endDate) {
    query.startDate = {};
    if (startDate) query.startDate.$gte = new Date(startDate);
    if (endDate) query.startDate.$lte = new Date(endDate);
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  let leaveRequests = await LeaveRequest.find(query)
    .populate('employee', 'userId profile.firstName profile.lastName email role employeeDetails.department')
    .populate('approvedBy', 'userId profile.firstName profile.lastName')
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: -1 });

  // Filter by department if specified
  if (department) {
    leaveRequests = leaveRequests.filter(request =>
      request.employee.employeeDetails &&
      request.employee.employeeDetails.department === department
    );
  }

  const total = await LeaveRequest.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    count: leaveRequests.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    leaveRequests,
  });
});

// Get leave requests for logged-in employee
const getMyLeaveRequests = asyncWrapper(async (req, res) => {
  const employeeId = req.user.userId;
  const { status, page = 1, limit = 10 } = req.query;

  let query = { employee: employeeId };

  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const leaveRequests = await LeaveRequest.find(query)
    .populate('employee', 'userId profile.firstName profile.lastName')
    .populate('approvedBy', 'userId profile.firstName profile.lastName')
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: -1 });

  const total = await LeaveRequest.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    count: leaveRequests.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    leaveRequests,
  });
});

// Get leave request by ID
const getLeaveRequestById = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId, role } = req.user;

  const leaveRequest = await LeaveRequest.findById(id)
    .populate('employee', 'userId profile.firstName profile.lastName email role employeeDetails.department')
    .populate('approvedBy', 'userId profile.firstName profile.lastName');

  if (!leaveRequest) {
    return next(createCustomError("Leave request not found", 404));
  }

  // Check authorization - employee can only view their own requests
  if (!["admin", "manager"].includes(role) && leaveRequest.employee._id.toString() !== userId) {
    return next(createCustomError("You can only view your own leave requests", 403));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    leaveRequest,
  });
});

// Update leave request (Employee - only pending requests)
const updateLeaveRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId } = req.user;
  const { leaveType, startDate, endDate, reason } = req.body;

  const leaveRequest = await LeaveRequest.findById(id);

  if (!leaveRequest) {
    return next(createCustomError("Leave request not found", 404));
  }

  // Check if employee owns this request
  if (leaveRequest.employee.toString() !== userId) {
    return next(createCustomError("You can only update your own leave requests", 403));
  }

  // Can only update pending requests
  if (leaveRequest.status !== "pending") {
    return next(createCustomError("Cannot update leave request that has been processed", 400));
  }

  // Validate dates if provided
  if (startDate || endDate) {
    const start = new Date(startDate || leaveRequest.startDate);
    const end = new Date(endDate || leaveRequest.endDate);
    const today = new Date();

    if (start < today) {
      return next(createCustomError("Start date cannot be in the past", 400));
    }

    if (end < start) {
      return next(createCustomError("End date cannot be before start date", 400));
    }

    // Check for overlapping leave requests (excluding current request)
    const overlappingLeave = await LeaveRequest.findOne({
      _id: { $ne: id },
      employee: userId,
      status: { $in: ["pending", "approved"] },
      $or: [
        {
          startDate: { $lte: end },
          endDate: { $gte: start }
        }
      ]
    });

    if (overlappingLeave) {
      return next(createCustomError("You already have a leave request for overlapping dates", 400));
    }
  }

  // Update fields
  const updateData = {};
  if (leaveType) updateData.leaveType = leaveType;
  if (startDate) updateData.startDate = new Date(startDate);
  if (endDate) updateData.endDate = new Date(endDate);
  if (reason) updateData.reason = reason;

  const updatedLeaveRequest = await LeaveRequest.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  ).populate('employee', 'userId profile.firstName profile.lastName');

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Leave request updated successfully",
    leaveRequest: updatedLeaveRequest,
  });
});

// Delete leave request (Employee - only pending requests)
const deleteLeaveRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId } = req.user;

  const leaveRequest = await LeaveRequest.findById(id);

  if (!leaveRequest) {
    return next(createCustomError("Leave request not found", 404));
  }

  // Check if employee owns this request
  if (leaveRequest.employee.toString() !== userId) {
    return next(createCustomError("You can only delete your own leave requests", 403));
  }

  // Can only delete pending requests
  if (leaveRequest.status !== "pending") {
    return next(createCustomError("Cannot delete leave request that has been processed", 400));
  }

  await LeaveRequest.findByIdAndDelete(id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Leave request deleted successfully",
  });
});

// Approve leave request (Admin/Manager)
const approveLeaveRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId } = req.user;

  const leaveRequest = await LeaveRequest.findById(id)
    .populate('employee', 'userId profile.firstName profile.lastName email');

  if (!leaveRequest) {
    return next(createCustomError("Leave request not found", 404));
  }

  if (leaveRequest.status !== "pending") {
    return next(createCustomError("Leave request has already been processed", 400));
  }

  leaveRequest.status = "approved";
  leaveRequest.approvedBy = userId;
  leaveRequest.approvedAt = new Date();

  await leaveRequest.save();

  // Populate approver details
  await leaveRequest.populate('approvedBy', 'userId profile.firstName profile.lastName');

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Leave request approved successfully",
    leaveRequest,
  });
});

// Reject leave request (Admin/Manager)
const rejectLeaveRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const { userId } = req.user;

  if (!rejectionReason) {
    return next(createCustomError("Rejection reason is required", 400));
  }

  const leaveRequest = await LeaveRequest.findById(id)
    .populate('employee', 'userId profile.firstName profile.lastName email');

  if (!leaveRequest) {
    return next(createCustomError("Leave request not found", 404));
  }

  if (leaveRequest.status !== "pending") {
    return next(createCustomError("Leave request has already been processed", 400));
  }

  leaveRequest.status = "rejected";
  leaveRequest.approvedBy = userId;
  leaveRequest.approvedAt = new Date();
  leaveRequest.rejectionReason = rejectionReason;

  await leaveRequest.save();

  // Populate approver details
  await leaveRequest.populate('approvedBy', 'userId profile.firstName profile.lastName');

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Leave request rejected successfully",
    leaveRequest,
  });
});

// Get leave request statistics (Admin/Manager)
const getLeaveStats = asyncWrapper(async (req, res) => {
  const { startDate, endDate } = req.query;

  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Leave requests by status
  const statusStats = await LeaveRequest.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  // Leave requests by type
  const typeStats = await LeaveRequest.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: "$leaveType",
        count: { $sum: 1 }
      }
    }
  ]);

  // Leave requests by department
  const departmentStats = await LeaveRequest.aggregate([
    { $match: dateFilter },
    {
      $lookup: {
        from: "users",
        localField: "employee",
        foreignField: "_id",
        as: "employeeDetails"
      }
    },
    { $unwind: "$employeeDetails" },
    {
      $group: {
        _id: "$employeeDetails.employeeDetails.department",
        count: { $sum: 1 }
      }
    }
  ]);

  // Monthly leave trends
  const monthlyTrends = await LeaveRequest.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 }
    }
  ]);

  const totalRequests = await LeaveRequest.countDocuments(dateFilter);
  const pendingRequests = await LeaveRequest.countDocuments({ ...dateFilter, status: "pending" });
  const approvedRequests = await LeaveRequest.countDocuments({ ...dateFilter, status: "approved" });
  const rejectedRequests = await LeaveRequest.countDocuments({ ...dateFilter, status: "rejected" });

  res.status(StatusCodes.OK).json({
    success: true,
    stats: {
      total: totalRequests,
      pending: pendingRequests,
      approved: approvedRequests,
      rejected: rejectedRequests,
      byStatus: statusStats,
      byType: typeStats,
      byDepartment: departmentStats,
      monthlyTrends,
    },
  });
});

// Get upcoming leaves (Admin/Manager)
const getUpcomingLeaves = asyncWrapper(async (req, res) => {
  const { days = 30 } = req.query;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + parseInt(days));

  const upcomingLeaves = await LeaveRequest.find({
    status: "approved",
    startDate: {
      $gte: startDate,
      $lte: endDate
    }
  })
    .populate('employee', 'userId profile.firstName profile.lastName employeeDetails.department')
    .sort({ startDate: 1 });

  res.status(StatusCodes.OK).json({
    success: true,
    count: upcomingLeaves.length,
    upcomingLeaves,
  });
});

export {
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
};
