import { Vehicle } from "../models/Vehicle.js";
import User from "../models/User.js";
import asyncWrapper from "../middleware/async.js";
import { createCustomError } from "../errors/custom-error.js";

// Create a new vehicle
const createVehicle = asyncWrapper(async (req, res, next) => {
  const {
    registrationNumber,
    owner,
    make,
    model,
    year,
    engineNumber,
    chassisNumber,
    fuelType,
    transmission,
    mileage,
    color,
  } = req.body;

  // Validate required fields
  if (!registrationNumber || !owner || !make || !model || !year || !fuelType || !transmission) {
    return next(createCustomError("Please provide all required vehicle details", 400));
  }

  // Check if vehicle with same registration number already exists
  const existingVehicle = await Vehicle.findOne({ 
    registrationNumber: registrationNumber.toUpperCase() 
  });
  
  if (existingVehicle) {
    return next(createCustomError("Vehicle with this registration number already exists", 400));
  }

  // Verify that the owner exists and is a customer
  const vehicleOwner = await User.findById(owner);
  if (!vehicleOwner) {
    return next(createCustomError("Vehicle owner not found", 404));
  }

  if (vehicleOwner.role !== "customer") {
    return next(createCustomError("Vehicle owner must be a customer", 400));
  }

  // Create the vehicle
  const vehicle = await Vehicle.create({
    registrationNumber: registrationNumber.toUpperCase(),
    owner,
    make,
    model,
    year,
    engineNumber,
    chassisNumber,
    fuelType,
    transmission,
    mileage: mileage || 0,
    color,
  });

  // Populate owner details for response
  await vehicle.populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email');

  res.status(201).json({
    success: true,
    message: "Vehicle created successfully",
    vehicle,
  });
});

// Get all vehicles with filtering and pagination
const getAllVehicles = asyncWrapper(async (req, res) => {
  const {
    owner,
    make,
    model,
    fuelType,
    transmission,
    status,
    yearFrom,
    yearTo,
    page = 1,
    limit = 10,
    search,
    sortBy = "createdAt",
    sortOrder = "desc"
  } = req.query;

  // Build query object
  let query = {};

  // Filter by owner (customer ID)
  if (owner) {
    query.owner = owner;
  }

  // Filter by vehicle specifications
  if (make) {
    query.make = { $regex: make, $options: "i" };
  }

  if (model) {
    query.model = { $regex: model, $options: "i" };
  }

  if (fuelType) {
    query.fuelType = fuelType;
  }

  if (transmission) {
    query.transmission = transmission;
  }

  if (status) {
    query.status = status;
  }

  // Filter by year range
  if (yearFrom || yearTo) {
    query.year = {};
    if (yearFrom) query.year.$gte = parseInt(yearFrom);
    if (yearTo) query.year.$lte = parseInt(yearTo);
  }

  // Search functionality
  if (search) {
    query.$or = [
      { registrationNumber: { $regex: search, $options: "i" } },
      { vehicleId: { $regex: search, $options: "i" } },
      { make: { $regex: search, $options: "i" } },
      { model: { $regex: search, $options: "i" } },
      { engineNumber: { $regex: search, $options: "i" } },
      { chassisNumber: { $regex: search, $options: "i" } },
    ];
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Execute query with population
  const vehicles = await Vehicle.find(query)
    .populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email customerDetails.membershipTier')
    .sort(sort)
    .limit(limit * 1)
    .skip(skip);

  // Get total count for pagination
  const total = await Vehicle.countDocuments(query);

  res.status(200).json({
    success: true,
    count: vehicles.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    vehicles,
  });
});

// Get vehicle by ID
const getVehicleById = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;

  const vehicle = await Vehicle.findById(id)
    .populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email customerDetails.membershipTier customerDetails.emergencyContact');

  if (!vehicle) {
    return next(createCustomError(`No vehicle found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    vehicle,
  });
});

// Get vehicle by registration number
const getVehicleByRegistration = asyncWrapper(async (req, res, next) => {
  const { registrationNumber } = req.params;

  const vehicle = await Vehicle.findOne({ 
    registrationNumber: registrationNumber.toUpperCase() 
  }).populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email customerDetails.membershipTier');

  if (!vehicle) {
    return next(createCustomError(`No vehicle found with registration number: ${registrationNumber}`, 404));
  }

  res.status(200).json({
    success: true,
    vehicle,
  });
});

// Get vehicles by owner (customer)
const getVehiclesByOwner = asyncWrapper(async (req, res, next) => {
  const { ownerId } = req.params;
  const { status, page = 1, limit = 10 } = req.query;

  // Verify owner exists
  const owner = await User.findById(ownerId);
  if (!owner) {
    return next(createCustomError("Vehicle owner not found", 404));
  }

  if (owner.role !== "customer") {
    return next(createCustomError("Specified user is not a customer", 400));
  }

  // Build query
  let query = { owner: ownerId };
  if (status) {
    query.status = status;
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  const vehicles = await Vehicle.find(query)
    .populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip(skip);

  const total = await Vehicle.countDocuments(query);

  res.status(200).json({
    success: true,
    count: vehicles.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page * 1,
    vehicles,
  });
});

// Update vehicle
const updateVehicle = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // Prevent updating certain fields
  delete updateData.vehicleId;
  delete updateData.owner;

  // Handle registration number case conversion
  if (updateData.registrationNumber) {
    updateData.registrationNumber = updateData.registrationNumber.toUpperCase();
    
    // Check if new registration number already exists (excluding current vehicle)
    const existingVehicle = await Vehicle.findOne({
      registrationNumber: updateData.registrationNumber,
      _id: { $ne: id }
    });
    
    if (existingVehicle) {
      return next(createCustomError("Vehicle with this registration number already exists", 400));
    }
  }

  const vehicle = await Vehicle.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true,
    }
  ).populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email');

  if (!vehicle) {
    return next(createCustomError(`No vehicle found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    message: "Vehicle updated successfully",
    vehicle,
  });
});

// Update vehicle mileage
const updateVehicleMileage = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { mileage } = req.body;

  if (!mileage || mileage < 0) {
    return next(createCustomError("Please provide a valid mileage value", 400));
  }

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    return next(createCustomError(`No vehicle found with id: ${id}`, 404));
  }

  // Ensure new mileage is not less than current mileage
  if (mileage < vehicle.mileage) {
    return next(createCustomError("New mileage cannot be less than current mileage", 400));
  }

  vehicle.mileage = mileage;
  await vehicle.save();

  res.status(200).json({
    success: true,
    message: "Vehicle mileage updated successfully",
    vehicle: {
      vehicleId: vehicle.vehicleId,
      registrationNumber: vehicle.registrationNumber,
      mileage: vehicle.mileage,
    },
  });
});

// Update vehicle status
const updateVehicleStatus = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !["active", "inactive", "scrapped"].includes(status)) {
    return next(createCustomError("Please provide a valid status (active, inactive, scrapped)", 400));
  }

  const vehicle = await Vehicle.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  ).populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email');

  if (!vehicle) {
    return next(createCustomError(`No vehicle found with id: ${id}`, 404));
  }

  res.status(200).json({
    success: true,
    message: "Vehicle status updated successfully",
    vehicle,
  });
});

// Delete vehicle (soft delete by changing status)
const deleteVehicle = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { permanent = false } = req.query;

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    return next(createCustomError(`No vehicle found with id: ${id}`, 404));
  }

  if (permanent === "true") {
    // Permanent deletion (admin only)
    await Vehicle.findByIdAndDelete(id);
    res.status(200).json({
      success: true,
      message: "Vehicle permanently deleted",
      vehicle: {
        vehicleId: vehicle.vehicleId,
        registrationNumber: vehicle.registrationNumber,
      },
    });
  } else {
    // Soft delete - change status to inactive
    vehicle.status = "inactive";
    await vehicle.save();
    
    res.status(200).json({
      success: true,
      message: "Vehicle deactivated successfully",
      vehicle: {
        vehicleId: vehicle.vehicleId,
        registrationNumber: vehicle.registrationNumber,
        status: vehicle.status,
      },
    });
  }
});

// Get vehicle statistics
const getVehicleStats = asyncWrapper(async (req, res) => {
  // Vehicle count by status
  const statusStats = await Vehicle.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Vehicle count by fuel type
  const fuelTypeStats = await Vehicle.aggregate([
    {
      $group: {
        _id: "$fuelType",
        count: { $sum: 1 },
      },
    },
  ]);

  // Vehicle count by transmission
  const transmissionStats = await Vehicle.aggregate([
    {
      $group: {
        _id: "$transmission",
        count: { $sum: 1 },
      },
    },
  ]);

  // Vehicle count by make
  const makeStats = await Vehicle.aggregate([
    {
      $group: {
        _id: "$make",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 10
    }
  ]);

  // Vehicle registrations by month (last 12 months)
  const registrationStats = await Vehicle.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        }
      }
    },
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

  // Total counts
  const totalVehicles = await Vehicle.countDocuments();
  const activeVehicles = await Vehicle.countDocuments({ status: "active" });
  const inactiveVehicles = await Vehicle.countDocuments({ status: "inactive" });
  const scrappedVehicles = await Vehicle.countDocuments({ status: "scrapped" });

  // Average vehicle age
  const currentYear = new Date().getFullYear();
  const avgAgeResult = await Vehicle.aggregate([
    {
      $group: {
        _id: null,
        avgAge: { $avg: { $subtract: [currentYear, "$year"] } }
      }
    }
  ]);

  const averageAge = avgAgeResult.length > 0 ? Math.round(avgAgeResult[0].avgAge) : 0;

  res.status(200).json({
    success: true,
    stats: {
      totalVehicles,
      activeVehicles,
      inactiveVehicles,
      scrappedVehicles,
      averageAge,
      statusStats,
      fuelTypeStats,
      transmissionStats,
      makeStats,
      registrationStats,
    },
  });
});

// Search vehicles (for quick lookups during booking)
const searchVehicles = asyncWrapper(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({
      success: true,
      vehicles: [],
      message: "Please provide at least 2 characters for search",
    });
  }

  const searchQuery = {
    status: "active",
    $or: [
      { registrationNumber: { $regex: q, $options: "i" } },
      { vehicleId: { $regex: q, $options: "i" } },
      { make: { $regex: q, $options: "i" } },
      { model: { $regex: q, $options: "i" } },
    ],
  };

  const vehicles = await Vehicle.find(searchQuery)
    .populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email')
    .select('vehicleId registrationNumber make model year owner')
    .limit(limit * 1)
    .sort({ registrationNumber: 1 });

  res.status(200).json({
    success: true,
    count: vehicles.length,
    vehicles,
  });
});

// Transfer vehicle ownership
const transferOwnership = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { newOwnerId } = req.body;

  if (!newOwnerId) {
    return next(createCustomError("New owner ID is required", 400));
  }

  // Check if vehicle exists
  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    return next(createCustomError(`No vehicle found with id: ${id}`, 404));
  }

  // Check if new owner exists and is a customer
  const newOwner = await User.findById(newOwnerId);
  if (!newOwner) {
    return next(createCustomError("New owner not found", 404));
  }

  if (newOwner.role !== "customer") {
    return next(createCustomError("New owner must be a customer", 400));
  }

  // Check if transferring to the same owner
  if (vehicle.owner.toString() === newOwnerId) {
    return next(createCustomError("Vehicle is already owned by this customer", 400));
  }

  // Update ownership
  const oldOwnerId = vehicle.owner;
  vehicle.owner = newOwnerId;
  await vehicle.save();

  // Populate both old and new owner details
  await vehicle.populate('owner', 'userId profile.firstName profile.lastName profile.phoneNumber email');
  const oldOwner = await User.findById(oldOwnerId).select('userId profile.firstName profile.lastName profile.phoneNumber email');

  res.status(200).json({
    success: true,
    message: "Vehicle ownership transferred successfully",
    vehicle,
    transferDetails: {
      previousOwner: oldOwner,
      newOwner: vehicle.owner,
      transferDate: new Date(),
    },
  });
});

export {
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
};
