import { GoodsRequest } from "../models/GoodsRequest.js";
import User from "../models/User.js";
import asyncWrapper from "../middleware/async.js";
import { StatusCodes } from "http-status-codes";
import { createCustomError } from "../errors/custom-error.js";

// Create goods request (Inspector)
const createGoodsRequest = asyncWrapper(async (req, res, next) => {
  const { job, items, notes } = req.body;
  const requestedBy = req.user.userId;

  // Validate required fields
  if (!job || !items || !Array.isArray(items) || items.length === 0) {
    return next(createCustomError("Job and items are required", 400));
  }

  // Validate each item
  for (const item of items) {
    if (!item.item || !item.quantity || item.quantity < 1) {
      return next(createCustomError("Each item must have valid item ID and quantity", 400));
    }
  }

  // Check if user is authorized to create goods requests (inspector, service_advisor, manager)
  const user = await User.findById(requestedBy);
  if (!user) {
    return next(createCustomError("User not found", 404));
  }

  if (!["service_advisor", "manager", "admin"].includes(user.role)) {
    return next(createCustomError("Only inspectors, managers, and admins can create goods requests", 403));
  }

  const goodsRequest = await GoodsRequest.create({
    job,
    requestedBy,
    items,
    notes,
  });

  // Populate related data
  await goodsRequest.populate([
    { path: "job", select: "jobId description priority status" },
    { path: "requestedBy", select: "userId profile.firstName profile.lastName email role" },
    { path: "items.item", select: "itemId name category currentStock unitPrice" }
  ]);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Goods request created successfully",
    goodsRequest,
  });
});

// Get all goods requests (Inventory Manager, Admin, Manager)
const getAllGoodsRequests = asyncWrapper(async (req, res, next) => {
  const { status, requestedBy, job, page = 1, limit = 10, startDate, endDate } = req.query;
  const { role } = req.user;

  // Check authorization
  if (!["admin", "manager"].includes(role)) {
    // Check if user is inventory manager
    const user = await User.findById(req.user.userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("Access denied. Only inventory managers, admins, and managers can view all goods requests", 403));
    }
  }

  let query = {};

  // Build query based on filters
  if (status) {
    query.status = status;
  }

  if (requestedBy) {
    query.requestedBy = requestedBy;
  }

  if (job) {
    query.job = job;
  }

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  const goodsRequests = await GoodsRequest.find(query)
    .populate([
      { path: "job", select: "jobId description priority status booking" },
      { path: "requestedBy", select: "userId profile.firstName profile.lastName email role employeeDetails.department" },
      { path: "approvedBy", select: "userId profile.firstName profile.lastName" },
      { path: "items.item", select: "itemId name category currentStock unitPrice" }
    ])
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: -1 });

  const total = await GoodsRequest.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    count: goodsRequests.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    goodsRequests,
  });
});

// Get goods requests by requester (Inspector's own requests)
const getMyGoodsRequests = asyncWrapper(async (req, res) => {
  const requestedBy = req.user.userId;
  const { status, page = 1, limit = 10 } = req.query;

  let query = { requestedBy };

  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const goodsRequests = await GoodsRequest.find(query)
    .populate([
      { path: "job", select: "jobId description priority status" },
      { path: "approvedBy", select: "userId profile.firstName profile.lastName" },
      { path: "items.item", select: "itemId name category currentStock unitPrice" }
    ])
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: -1 });

  const total = await GoodsRequest.countDocuments(query);

  res.status(StatusCodes.OK).json({
    success: true,
    count: goodsRequests.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    goodsRequests,
  });
});

// Get goods request by ID
const getGoodsRequestById = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId, role } = req.user;

  const goodsRequest = await GoodsRequest.findById(id)
    .populate([
      { path: "job", select: "jobId description priority status booking" },
      { path: "requestedBy", select: "userId profile.firstName profile.lastName email role employeeDetails.department" },
      { path: "approvedBy", select: "userId profile.firstName profile.lastName" },
      { path: "items.item", select: "itemId name category currentStock unitPrice stockLocation" }
    ]);

  if (!goodsRequest) {
    return next(createCustomError("Goods request not found", 404));
  }

  // Check authorization - user can view their own requests or if they're admin/manager/inventory manager
  if (!["admin", "manager"].includes(role) && goodsRequest.requestedBy._id.toString() !== userId) {
    // Check if user is inventory manager
    const user = await User.findById(userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("You can only view your own goods requests", 403));
    }
  }

  res.status(StatusCodes.OK).json({
    success: true,
    goodsRequest,
  });
});

// Update goods request (Inspector - only pending requests)
const updateGoodsRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId } = req.user;
  const { items, notes } = req.body;

  const goodsRequest = await GoodsRequest.findById(id);

  if (!goodsRequest) {
    return next(createCustomError("Goods request not found", 404));
  }

  // Check if user owns this request
  if (goodsRequest.requestedBy.toString() !== userId) {
    return next(createCustomError("You can only update your own goods requests", 403));
  }

  // Can only update pending requests
  if (goodsRequest.status !== "pending") {
    return next(createCustomError("Cannot update goods request that has been processed", 400));
  }

  // Update fields
  const updateData = {};
  if (items && Array.isArray(items) && items.length > 0) {
    // Validate items
    for (const item of items) {
      if (!item.item || !item.quantity || item.quantity < 1) {
        return next(createCustomError("Each item must have valid item ID and quantity", 400));
      }
    }
    updateData.items = items;
  }
  if (notes !== undefined) updateData.notes = notes;

  const updatedGoodsRequest = await GoodsRequest.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  ).populate([
    { path: "job", select: "jobId description priority status" },
    { path: "requestedBy", select: "userId profile.firstName profile.lastName" },
    { path: "items.item", select: "itemId name category currentStock unitPrice" }
  ]);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Goods request updated successfully",
    goodsRequest: updatedGoodsRequest,
  });
});

// Delete goods request (Inspector - only pending requests)
const deleteGoodsRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId } = req.user;

  const goodsRequest = await GoodsRequest.findById(id);

  if (!goodsRequest) {
    return next(createCustomError("Goods request not found", 404));
  }

  // Check if user owns this request
  if (goodsRequest.requestedBy.toString() !== userId) {
    return next(createCustomError("You can only delete your own goods requests", 403));
  }

  // Can only delete pending requests
  if (goodsRequest.status !== "pending") {
    return next(createCustomError("Cannot delete goods request that has been processed", 400));
  }

  await GoodsRequest.findByIdAndDelete(id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Goods request deleted successfully",
  });
});

// Approve goods request (Inventory Manager, Admin, Manager)
const approveGoodsRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId, role } = req.user;

  // Check authorization
  if (!["admin", "manager"].includes(role)) {
    const user = await User.findById(userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("Only inventory managers, admins, and managers can approve goods requests", 403));
    }
  }

  const goodsRequest = await GoodsRequest.findById(id)
    .populate([
      { path: "job", select: "jobId description" },
      { path: "requestedBy", select: "userId profile.firstName profile.lastName email" },
      { path: "items.item", select: "itemId name currentStock" }
    ]);

  if (!goodsRequest) {
    return next(createCustomError("Goods request not found", 404));
  }

  if (goodsRequest.status !== "pending") {
    return next(createCustomError("Goods request has already been processed", 400));
  }

  // Check stock availability for all items
  for (const requestItem of goodsRequest.items) {
    if (requestItem.item.currentStock < requestItem.quantity) {
      return next(createCustomError(`Insufficient stock for ${requestItem.item.name}. Available: ${requestItem.item.currentStock}, Requested: ${requestItem.quantity}`, 400));
    }
  }

  goodsRequest.status = "approved";
  goodsRequest.approvedBy = userId;
  goodsRequest.approvedAt = new Date();

  await goodsRequest.save();

  // Populate approver details
  await goodsRequest.populate("approvedBy", "userId profile.firstName profile.lastName");

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Goods request approved successfully",
    goodsRequest,
  });
});

// Reject goods request (Inventory Manager, Admin, Manager)
const rejectGoodsRequest = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const { userId, role } = req.user;

  if (!rejectionReason) {
    return next(createCustomError("Rejection reason is required", 400));
  }

  // Check authorization
  if (!["admin", "manager"].includes(role)) {
    const user = await User.findById(userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("Only inventory managers, admins, and managers can reject goods requests", 403));
    }
  }

  const goodsRequest = await GoodsRequest.findById(id)
    .populate([
      { path: "job", select: "jobId description" },
      { path: "requestedBy", select: "userId profile.firstName profile.lastName email" }
    ]);

  if (!goodsRequest) {
    return next(createCustomError("Goods request not found", 404));
  }

  if (goodsRequest.status !== "pending") {
    return next(createCustomError("Goods request has already been processed", 400));
  }

  goodsRequest.status = "rejected";
  goodsRequest.approvedBy = userId;
  goodsRequest.approvedAt = new Date();
  goodsRequest.rejectionReason = rejectionReason;

  await goodsRequest.save();

  // Populate approver details
  await goodsRequest.populate("approvedBy", "userId profile.firstName profile.lastName");

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Goods request rejected successfully",
    goodsRequest,
  });
});

// Release goods (Inventory Manager - mark as released and update inventory)
const releaseGoods = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId, role } = req.user;

  // Check authorization - only inventory managers
  if (!["admin", "manager"].includes(role)) {
    const user = await User.findById(userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("Only inventory managers, admins, and managers can release goods", 403));
    }
  }

  const goodsRequest = await GoodsRequest.findById(id)
    .populate("items.item", "itemId name currentStock");

  if (!goodsRequest) {
    return next(createCustomError("Goods request not found", 404));
  }

  if (goodsRequest.status !== "approved") {
    return next(createCustomError("Only approved goods requests can be released", 400));
  }

  // Update inventory levels (this would typically be done through inventory service)
  // For now, we'll just mark as released
  // TODO: Implement inventory stock reduction

  goodsRequest.status = "released";
  await goodsRequest.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Goods released successfully",
    goodsRequest,
  });
});

// Get goods request statistics (Admin, Manager, Inventory Manager)
const getGoodsRequestStats = asyncWrapper(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const { role, userId } = req.user;

  // Check authorization
  if (!["admin", "manager"].includes(role)) {
    const user = await User.findById(userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("Access denied", 403));
    }
  }

  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Goods requests by status
  const statusStats = await GoodsRequest.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  // Goods requests by requester
  const requesterStats = await GoodsRequest.aggregate([
    { $match: dateFilter },
    {
      $lookup: {
        from: "users",
        localField: "requestedBy",
        foreignField: "_id",
        as: "requesterInfo"
      }
    },
    { $unwind: "$requesterInfo" },
    {
      $group: {
        _id: {
          userId: "$requesterInfo.userId",
          name: { $concat: ["$requesterInfo.profile.firstName", " ", "$requesterInfo.profile.lastName"] }
        },
        count: { $sum: 1 }
      }
    }
  ]);

  // Monthly trends
  const monthlyTrends = await GoodsRequest.aggregate([
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

  const totalRequests = await GoodsRequest.countDocuments(dateFilter);
  const pendingRequests = await GoodsRequest.countDocuments({ ...dateFilter, status: "pending" });
  const approvedRequests = await GoodsRequest.countDocuments({ ...dateFilter, status: "approved" });
  const rejectedRequests = await GoodsRequest.countDocuments({ ...dateFilter, status: "rejected" });
  const releasedRequests = await GoodsRequest.countDocuments({ ...dateFilter, status: "released" });

  res.status(StatusCodes.OK).json({
    success: true,
    stats: {
      total: totalRequests,
      pending: pendingRequests,
      approved: approvedRequests,
      rejected: rejectedRequests,
      released: releasedRequests,
      byStatus: statusStats,
      byRequester: requesterStats,
      monthlyTrends,
    },
  });
});

// Get pending goods requests for approval (Inventory Manager)
const getPendingGoodsRequests = asyncWrapper(async (req, res, next) => {
  const { userId, role } = req.user;
  const { page = 1, limit = 10 } = req.query;

  // Check authorization
  if (!["admin", "manager"].includes(role)) {
    const user = await User.findById(userId);
    if (!user || !user.employeeDetails || user.employeeDetails.department !== "management") {
      return next(createCustomError("Access denied", 403));
    }
  }

  const skip = (page - 1) * limit;

  const pendingRequests = await GoodsRequest.find({ status: "pending" })
    .populate([
      { path: "job", select: "jobId description priority status booking" },
      { path: "requestedBy", select: "userId profile.firstName profile.lastName email role" },
      { path: "items.item", select: "itemId name category currentStock unitPrice" }
    ])
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: 1 }); // Oldest first for processing

  const total = await GoodsRequest.countDocuments({ status: "pending" });

  res.status(StatusCodes.OK).json({
    success: true,
    count: pendingRequests.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    pendingRequests,
  });
});

export {
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
};
