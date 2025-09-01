import mongoose from "mongoose";

// 7. LEAVE REQUEST MODEL
const LeaveRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: LR00001
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Employee is required"],
  },
  leaveType: {
    type: String,
    enum: ["annual", "sick", "emergency", "maternity", "paternity", "unpaid"],
    required: [true, "Leave type is required"],
  },
  startDate: {
    type: Date,
    required: [true, "Start date is required"],
  },
  endDate: {
    type: Date,
    required: [true, "End date is required"],
  },
  reason: {
    type: String,
    required: [true, "Reason is required"],
    trim: true,
    maxlength: [500, "Reason cannot exceed 500 characters"],
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  approvedAt: Date,
  rejectionReason: String,
  totalDays: {
    type: Number,
    min: 0,
  },
}, {
  timestamps: true,
});

// Auto-generate requestId and calculate total days
LeaveRequestSchema.pre("save", async function (next) {
  if (this.isNew && !this.requestId) {
    const lastRequest = await this.constructor
      .findOne({ requestId: /^LR/ })
      .sort({ requestId: -1 })
      .select("requestId");

    let nextNumber = 1;
    if (lastRequest?.requestId) {
      const match = lastRequest.requestId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.requestId = `LR${nextNumber.toString().padStart(5, "0")}`;
  }

  // Calculate total days
  if (this.startDate && this.endDate) {
    const timeDiff = this.endDate.getTime() - this.startDate.getTime();
    this.totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  }

  next();
});

LeaveRequestSchema.index({ employee: 1 });
LeaveRequestSchema.index({ status: 1 });
LeaveRequestSchema.index({ startDate: 1, endDate: 1 });

export const LeaveRequest = mongoose.model("LeaveRequest", LeaveRequestSchema);