import mongoose from "mongoose";

// 2. BOOKING MODEL
const BookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: BK00001
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Customer is required"],
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    required: [true, "Vehicle is required"],
  },
  serviceType: {
    type: String,
    enum: ["inspection", "repair", "maintenance", "bodywork", "detailing"],
    required: [true, "Service type is required"],
  },
  scheduledDate: {
    type: Date,
    required: [true, "Scheduled date is required"],
  },
  timeSlot: {
    type: String,
    required: [true, "Time slot is required"],
    enum: ["09:00-11:00", "11:00-13:00", "13:00-15:00", "15:00-17:00"],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"],
  },
  status: {
    type: String,
    enum: ["pending", "inspecting", "working", "completed", "cancelled"],
    default: "pending",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  assignedInspector: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  estimatedCost: {
    type: Number,
    min: 0,
    default: 0,
  },
  actualCost: {
    type: Number,
    min: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Created by is required"],
  },
  completedAt: Date,
  notes: [{
    note: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

// Auto-generate bookingId
BookingSchema.pre("save", async function (next) {
  if (this.isNew && !this.bookingId) {
    const lastBooking = await this.constructor
      .findOne({ bookingId: /^BK/ })
      .sort({ bookingId: -1 })
      .select("bookingId");

    let nextNumber = 1;
    if (lastBooking?.bookingId) {
      const match = lastBooking.bookingId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.bookingId = `BK${nextNumber.toString().padStart(5, "0")}`;
  }
  next();
});

BookingSchema.index({ customer: 1 });
BookingSchema.index({ vehicle: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ scheduledDate: 1 });

export const Booking = mongoose.model("Booking", BookingSchema);
