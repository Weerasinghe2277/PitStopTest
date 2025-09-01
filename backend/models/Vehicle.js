import mongoose from "mongoose";

// 1. VEHICLE MODEL
const VehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: VEH00001
  },
  registrationNumber: {
    type: String,
    required: [true, "Registration number is required"],
    unique: true,
    uppercase: true,
    trim: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Vehicle owner is required"],
  },
  make: {
    type: String,
    required: [true, "Vehicle make is required"],
    trim: true,
  },
  model: {
    type: String,
    required: [true, "Vehicle model is required"],
    trim: true,
  },
  year: {
    type: Number,
    required: [true, "Manufacturing year is required"],
    min: 1900,
    max: new Date().getFullYear() + 1,
  },
  engineNumber: {
    type: String,
    trim: true,
  },
  chassisNumber: {
    type: String,
    trim: true,
  },
  fuelType: {
    type: String,
    enum: ["petrol", "diesel", "hybrid", "electric"],
    required: [true, "Fuel type is required"],
  },
  transmission: {
    type: String,
    enum: ["manual", "automatic", "cvt"],
    required: [true, "Transmission type is required"],
  },
  mileage: {
    type: Number,
    min: 0,
    default: 0,
  },
  color: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "scrapped"],
    default: "active",
  },
}, {
  timestamps: true,
});

// Auto-generate vehicleId
VehicleSchema.pre("save", async function (next) {
  if (this.isNew && !this.vehicleId) {
    const lastVehicle = await this.constructor
      .findOne({ vehicleId: /^VEH/ })
      .sort({ vehicleId: -1 })
      .select("vehicleId");

    let nextNumber = 1;
    if (lastVehicle?.vehicleId) {
      const match = lastVehicle.vehicleId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.vehicleId = `VEH${nextNumber.toString().padStart(5, "0")}`;
  }
  next();
});

VehicleSchema.index({ owner: 1 });
VehicleSchema.index({ registrationNumber: 1 });


export const Vehicle = mongoose.model("Vehicle", VehicleSchema);