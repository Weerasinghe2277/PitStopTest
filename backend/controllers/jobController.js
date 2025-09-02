import Job from "../models/Job.js";
import User from "../models/User.js";
import { Booking } from "../models/Booking.js";
import { createCustomError } from "../errors/custom-error.js";
import asyncWrapper from "../middleware/async.js";

// Create a new job (Inspector only)
const createJob = asyncWrapper(async (req, res, next) => {
  const { bookingId } = req.params;
  const { userId, role } = req.user;

  // Check if user is inspector or manager
  if (!["service_advisor", "manager", "admin"].includes(role)) {
    return next(createCustomError("Only inspectors can create jobs", 403));
  }

  // Verify booking exists and is in correct status
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return next(createCustomError("Booking not found", 404));
  }

  if (booking.status !== "inspecting") {
    return next(createCustomError("Booking must be in 'inspecting' status to create jobs", 400));
  }

  // Create job with inspector as creator
  const jobData = {
    ...req.body,
    booking: bookingId,
    createdBy: userId,
  };

  const job = await Job.create(jobData);
  await job.populate([
    { path: "booking", select: "bookingId customer vehicle serviceType" },
    { path: "createdBy", select: "userId profile.firstName profile.lastName" },
  ]);

  res.status(201).json({
    success: true,
    message: "Job created successfully",
    job,
  });
});

// Get all jobs with filtering and pagination
const getAllJobs = asyncWrapper(async (req, res) => {
  const {
    status,
    priority,
    category,
    bookingId,
    assignedTo,
    createdBy,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
    search
  } = req.query;

  let query = {};

  // Build query based on filters
  if (status) query.status = { $in: status.split(",") };
  if (priority) query.priority = { $in: priority.split(",") };
  if (category) query.category = { $in: category.split(",") };
  if (bookingId) query.booking = bookingId;
  if (createdBy) query.createdBy = createdBy;
  if (assignedTo) query["assignedLabourers.labourer"] = assignedTo;

  // Add search functionality
  if (search) {
    query.$or = [
      { jobId: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Role-based filtering
  const { role, userId } = req.user;
  if (role === "technician") {
    // Technicians can only see jobs assigned to them
    query["assignedLabourers.labourer"] = userId;
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

  const jobs = await Job.find(query)
    .populate([
      {
        path: "booking",
        select: "bookingId customer vehicle serviceType scheduledDate",
        populate: [
          { path: "customer", select: "userId profile.firstName profile.lastName" },
          { path: "vehicle", select: "registrationNumber make model" }
        ]
      },
      { path: "createdBy", select: "userId profile.firstName profile.lastName" },
      { path: "inspectedBy", select: "userId profile.firstName profile.lastName" },
      { path: "assignedLabourers.labourer", select: "userId profile.firstName profile.lastName employeeDetails.specializations" },
    ])
    .limit(limit * 1)
    .skip(skip)
    .sort(sortOptions);

  const total = await Job.countDocuments(query);

  res.status(200).json({
    success: true,
    count: jobs.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    jobs,
  });
});

// Get job by ID
const getJobById = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { role, userId } = req.user;

  const job = await Job.findById(id).populate([
    {
      path: "booking",
      select: "bookingId customer vehicle serviceType scheduledDate description",
      populate: [
        { path: "customer", select: "userId profile.firstName profile.lastName profile.phoneNumber" },
        { path: "vehicle", select: "registrationNumber make model year color" }
      ]
    },
    { path: "createdBy", select: "userId profile.firstName profile.lastName" },
    { path: "inspectedBy", select: "userId profile.firstName profile.lastName" },
    {
      path: "assignedLabourers.labourer",
      select: "userId profile.firstName profile.lastName employeeDetails.specializations employeeDetails.department"
    },
    { path: "workLog.labourer", select: "userId profile.firstName profile.lastName" },
  ]);

  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  // Role-based access control
  if (role === "technician") {
    const isAssigned = job.assignedLabourers.some(
      assignment => assignment.labourer._id.toString() === userId
    );
    if (!isAssigned) {
      return next(createCustomError("Access denied. Job not assigned to you", 403));
    }
  }

  res.status(200).json({
    success: true,
    job,
  });
});

// Update job status (Labourers and Inspectors)
const updateJobStatus = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const { userId, role } = req.user;

  const job = await Job.findById(id);
  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  // Role-based access control for status updates
  if (role === "technician") {
    // Technicians can only update jobs assigned to them
    const isAssigned = job.assignedLabourers.some(
      assignment => assignment.labourer.toString() === userId
    );
    if (!isAssigned) {
      return next(createCustomError("Access denied. Job not assigned to you", 403));
    }

    // Technicians can only change status from pending to working, or working to completed
    const allowedTransitions = {
      "pending": ["working"],
      "working": ["completed", "on_hold"],
      "on_hold": ["working"]
    };

    if (!allowedTransitions[job.status]?.includes(status)) {
      return next(createCustomError(`Invalid status transition from ${job.status} to ${status}`, 400));
    }
  }

  // Update job
  job.status = status;
  if (notes) job.notes = notes;

  await job.save();
  await job.populate([
    { path: "booking", select: "bookingId" },
    { path: "assignedLabourers.labourer", select: "userId profile.firstName profile.lastName" },
  ]);

  res.status(200).json({
    success: true,
    message: "Job status updated successfully",
    job,
  });
});

// Assign labourers to job (Inspector only)
const assignLabourers = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { labourerIds } = req.body;
  const { role } = req.user;

  // Check if user is inspector or manager
  if (!["service_advisor", "manager", "admin"].includes(role)) {
    return next(createCustomError("Only inspectors can assign labourers", 403));
  }

  const job = await Job.findById(id);
  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  if (job.status !== "pending") {
    return next(createCustomError("Can only assign labourers to pending jobs", 400));
  }

  // Verify all labourers exist and are technicians
  const labourers = await User.find({
    _id: { $in: labourerIds },
    role: "technician",
    status: "active"
  });

  if (labourers.length !== labourerIds.length) {
    return next(createCustomError("Some labourers not found or not active technicians", 400));
  }

  // Check if labourers have required skills
  const requiredSkills = job.requirements?.skills || [];
  if (requiredSkills.length > 0) {
    const skilledLabourers = labourers.filter(labourer =>
      labourer.employeeDetails?.specializations?.some(skill =>
        requiredSkills.includes(skill)
      )
    );

    if (skilledLabourers.length === 0) {
      return next(createCustomError("None of the selected labourers have the required skills", 400));
    }
  }

  // Assign labourers
  job.assignedLabourers = labourerIds.map(labourerId => ({
    labourer: labourerId,
    assignedAt: new Date(),
    hoursWorked: 0,
  }));

  await job.save();
  await job.populate([
    { path: "booking", select: "bookingId" },
    { path: "assignedLabourers.labourer", select: "userId profile.firstName profile.lastName employeeDetails.specializations" },
  ]);

  res.status(200).json({
    success: true,
    message: "Labourers assigned successfully",
    job,
  });
});

// Add work log entry (Labourers only)
const addWorkLog = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { startTime, endTime, description } = req.body;
  const { userId, role } = req.user;

  if (role !== "technician") {
    return next(createCustomError("Only technicians can add work logs", 403));
  }

  const job = await Job.findById(id);
  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  // Check if user is assigned to this job
  const isAssigned = job.assignedLabourers.some(
    assignment => assignment.labourer.toString() === userId
  );
  if (!isAssigned) {
    return next(createCustomError("Access denied. Job not assigned to you", 403));
  }

  // Validate times
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (start >= end) {
    return next(createCustomError("End time must be after start time", 400));
  }

  // Add work log entry
  job.addWorkLog(userId, start, end, description);
  await job.save();

  await job.populate([
    { path: "workLog.labourer", select: "userId profile.firstName profile.lastName" },
  ]);

  res.status(200).json({
    success: true,
    message: "Work log added successfully",
    job,
  });
});

// Add inspection report (Inspector only)
const addInspectionReport = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { type, condition, issues, photos, qualityRating, approved } = req.body;
  const { userId, role } = req.user;

  // Check if user is inspector or manager
  if (!["service_advisor", "manager", "admin"].includes(role)) {
    return next(createCustomError("Only inspectors can add inspection reports", 403));
  }

  const job = await Job.findById(id);
  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  if (type === "pre" || type === "preWork") {
    job.inspectionReport.preWorkInspection = {
      condition,
      issues: issues || [],
      photos: photos || [],
      inspector: userId,
      inspectedAt: new Date(),
    };
  } else if (type === "post" || type === "postWork") {
    if (job.status !== "completed") {
      return next(createCustomError("Job must be completed before post-work inspection", 400));
    }

    job.inspectionReport.postWorkInspection = {
      condition,
      issues: issues || [],
      photos: photos || [],
      qualityRating,
      inspector: userId,
      inspectedAt: new Date(),
      approved: approved || false,
    };

    if (approved) {
      job.approvedAt = new Date();
      job.inspectedBy = userId;
    }
  } else {
    return next(createCustomError("Invalid inspection type. Use 'pre' or 'post'", 400));
  }

  await job.save();
  await job.populate([
    { path: "inspectionReport.preWorkInspection.inspector", select: "userId profile.firstName profile.lastName" },
    { path: "inspectionReport.postWorkInspection.inspector", select: "userId profile.firstName profile.lastName" },
  ]);

  res.status(200).json({
    success: true,
    message: "Inspection report added successfully",
    job,
  });
});

// Get jobs by booking ID
const getJobsByBooking = asyncWrapper(async (req, res, next) => {
  const { bookingId } = req.params;
  const { role, userId } = req.user;

  let query = { booking: bookingId };

  // Role-based filtering
  if (role === "technician") {
    query["assignedLabourers.labourer"] = userId;
  }

  const jobs = await Job.find(query).populate([
    { path: "createdBy", select: "userId profile.firstName profile.lastName" },
    { path: "assignedLabourers.labourer", select: "userId profile.firstName profile.lastName" },
  ]);

  res.status(200).json({
    success: true,
    count: jobs.length,
    jobs,
  });
});

// Get jobs assigned to current user (Technicians)
const getMyJobs = asyncWrapper(async (req, res) => {
  const { userId } = req.user;
  const { status, page = 1, limit = 10 } = req.query;

  let query = { "assignedLabourers.labourer": userId };
  if (status) {
    query.status = { $in: status.split(",") };
  }

  const skip = (page - 1) * limit;

  const jobs = await Job.find(query)
    .populate([
      {
        path: "booking",
        select: "bookingId customer vehicle serviceType scheduledDate",
        populate: [
          { path: "customer", select: "profile.firstName profile.lastName" },
          { path: "vehicle", select: "registrationNumber make model" }
        ]
      },
      { path: "createdBy", select: "userId profile.firstName profile.lastName" },
    ])
    .limit(limit * 1)
    .skip(skip)
    .sort({ createdAt: -1 });

  const total = await Job.countDocuments(query);

  res.status(200).json({
    success: true,
    count: jobs.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    jobs,
  });
});

// Update job details (Inspector only)
const updateJob = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.user;

  // Check if user is inspector or manager
  if (!["service_advisor", "manager", "admin"].includes(role)) {
    return next(createCustomError("Only inspectors can update job details", 403));
  }

  // Prevent updating sensitive fields
  const restrictedFields = ["jobId", "booking", "createdBy", "workLog", "inspectionReport"];
  restrictedFields.forEach(field => delete req.body[field]);

  const job = await Job.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  }).populate([
    { path: "booking", select: "bookingId" },
    { path: "assignedLabourers.labourer", select: "userId profile.firstName profile.lastName" },
  ]);

  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "Job updated successfully",
    job,
  });
});

// Delete job (Admin/Manager only)
const deleteJob = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.user;

  if (!["admin", "manager"].includes(role)) {
    return next(createCustomError("Only admin or manager can delete jobs", 403));
  }

  const job = await Job.findById(id);
  if (!job) {
    return next(createCustomError("Job not found", 404));
  }

  // Prevent deletion of jobs that are in progress or completed
  if (["working", "completed"].includes(job.status)) {
    return next(createCustomError("Cannot delete jobs that are in progress or completed", 400));
  }

  await Job.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Job deleted successfully",
    job: {
      id: job._id,
      jobId: job.jobId,
      title: job.title,
    },
  });
});

// Get job statistics (Manager/Admin only)
const getJobStats = asyncWrapper(async (req, res) => {
  const { role } = req.user;

  if (!["admin", "manager", "service_advisor"].includes(role)) {
    return next(createCustomError("Access denied", 403));
  }

  const statusStats = await Job.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const categoryStats = await Job.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        avgHours: { $avg: "$actualHours" },
        avgCost: { $avg: "$totalCost" },
      },
    },
  ]);

  const priorityStats = await Job.aggregate([
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);

  const completionStats = await Job.aggregate([
    {
      $match: { status: "completed" }
    },
    {
      $group: {
        _id: null,
        totalJobs: { $sum: 1 },
        avgActualHours: { $avg: "$actualHours" },
        avgEstimatedHours: { $avg: "$estimatedHours" },
        totalRevenue: { $sum: "$totalCost" },
      },
    },
  ]);

  const overdueJobs = await Job.countDocuments({
    status: { $nin: ["completed", "cancelled"] },
    $expr: {
      $gt: [
        new Date(),
        {
          $add: [
            "$createdAt",
            { $multiply: ["$estimatedHours", 60 * 60 * 1000] }
          ]
        }
      ]
    }
  });

  const totalJobs = await Job.countDocuments();

  res.status(200).json({
    success: true,
    stats: {
      total: totalJobs,
      overdue: overdueJobs,
      statusBreakdown: statusStats,
      categoryBreakdown: categoryStats,
      priorityBreakdown: priorityStats,
      completion: completionStats[0] || {},
    },
  });
});

export {
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
};
