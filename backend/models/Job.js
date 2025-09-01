import mongoose from "mongoose";

// 3. JOB MODEL
const JobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: JOB00001
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: [true, "Booking is required"],
  },
  title: {
    type: String,
    required: [true, "Job title is required"],
    trim: true,
    maxlength: [100, "Title cannot exceed 100 characters"],
  },
  description: {
    type: String,
    required: [true, "Job description is required"],
    trim: true,
    maxlength: [1000, "Description cannot exceed 1000 characters"],
  },
  category: {
    type: String,
    enum: ["mechanical", "electrical", "bodywork", "detailing", "inspection"],
    required: [true, "Job category is required"],
  },
  status: {
    type: String,
    enum: ["pending", "working", "completed", "cancelled"],
    default: "pending",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  estimatedHours: {
    type: Number,
    min: 0,
    required: [true, "Estimated hours is required"],
  },
  actualHours: {
    type: Number,
    min: 0,
  },
  assignedLabourers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Created by is required"],
  },
  startedAt: Date,
  completedAt: Date,
  notes: String,
}, {
  timestamps: true,
});

// Auto-generate jobId
JobSchema.pre("save", async function (next) {
  if (this.isNew && !this.jobId) {
    const lastJob = await this.constructor
      .findOne({ jobId: /^JOB/ })
      .sort({ jobId: -1 })
      .select("jobId");

    let nextNumber = 1;
    if (lastJob?.jobId) {
      const match = lastJob.jobId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.jobId = `JOB${nextNumber.toString().padStart(5, "0")}`;
  }
  next();
});

JobSchema.index({ booking: 1 });
JobSchema.index({ status: 1 });
JobSchema.index({ assignedLabourers: 1 });

export const Job = mongoose.model("Job", JobSchema);