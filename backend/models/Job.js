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
    enum: ["mechanical", "electrical", "bodywork", "detailing", "inspection", "repair", "maintenance"],
    required: [true, "Job category is required"],
  },
  status: {
    type: String,
    enum: ["pending", "working", "completed", "cancelled", "on_hold"],
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
    default: 0,
  },
  assignedLabourers: [{
    labourer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    hoursWorked: {
      type: Number,
      default: 0,
      min: 0,
    },
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Created by is required"],
  },
  inspectedBy: {
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
    default: 0,
  },
  partsCost: {
    type: Number,
    min: 0,
    default: 0,
  },
  labourCost: {
    type: Number,
    min: 0,
    default: 0,
  },
  requirements: {
    tools: [{
      name: String,
      description: String,
    }],
    materials: [{
      name: String,
      quantity: Number,
      unit: String,
    }],
    skills: [{
      type: String,
      enum: [
        "engine_repair",
        "brake_systems",
        "electrical_systems",
        "air_conditioning",
        "transmission",
        "suspension",
        "bodywork",
        "painting",
        "detailing",
        "diagnostics",
        "hybrid_electric"
      ],
    }],
  },
  workLog: [{
    labourer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    startTime: Date,
    endTime: Date,
    description: String,
    hoursLogged: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  inspectionReport: {
    preWorkInspection: {
      condition: String,
      issues: [String],
      photos: [String], // URLs to photos
      inspector: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      inspectedAt: Date,
    },
    postWorkInspection: {
      condition: String,
      qualityRating: {
        type: Number,
        min: 1,
        max: 5,
      },
      issues: [String],
      photos: [String], // URLs to photos
      inspector: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      inspectedAt: Date,
      approved: {
        type: Boolean,
        default: false,
      },
    },
  },
  startedAt: Date,
  completedAt: Date,
  approvedAt: Date,
  notes: String,
  internalNotes: String, // For staff use only
  customerNotes: String, // Notes visible to customer
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

  // Auto-update status timestamps
  if (this.isModified('status')) {
    const now = new Date();

    if (this.status === 'working' && !this.startedAt) {
      this.startedAt = now;
    } else if (this.status === 'completed' && !this.completedAt) {
      this.completedAt = now;
    }
  }

  // Calculate actual hours from work log
  if (this.workLog && this.workLog.length > 0) {
    this.actualHours = this.workLog.reduce((total, log) => {
      return total + (log.hoursLogged || 0);
    }, 0);
  }

  // Calculate labour cost based on actual hours and assigned labourers
  if (this.actualHours > 0 && this.assignedLabourers.length > 0) {
    // This would typically use rates from user profiles or a rate table
    const hourlyRate = 50; // Default rate - should be configurable
    this.labourCost = this.actualHours * hourlyRate;
  }

  next();
});

// Virtual for completion percentage
JobSchema.virtual('completionPercentage').get(function () {
  if (this.status === 'completed') return 100;
  if (this.status === 'cancelled') return 0;
  if (this.estimatedHours === 0) return 0;

  return Math.min(Math.round((this.actualHours / this.estimatedHours) * 100), 100);
});

// Virtual for total cost
JobSchema.virtual('totalCost').get(function () {
  return (this.labourCost || 0) + (this.partsCost || 0);
});

// Virtual for overdue status
JobSchema.virtual('isOverdue').get(function () {
  if (this.status === 'completed' || this.status === 'cancelled') return false;

  const now = new Date();
  const estimatedCompletion = new Date(this.createdAt.getTime() + (this.estimatedHours * 60 * 60 * 1000));

  return now > estimatedCompletion;
});

// Method to add work log entry
JobSchema.methods.addWorkLog = function (labourerId, startTime, endTime, description) {
  const hoursLogged = Math.abs(endTime - startTime) / (1000 * 60 * 60); // Convert to hours

  this.workLog.push({
    labourer: labourerId,
    startTime,
    endTime,
    description,
    hoursLogged,
  });

  // Update labourer's hours worked
  const labourerAssignment = this.assignedLabourers.find(
    assignment => assignment.labourer.toString() === labourerId.toString()
  );

  if (labourerAssignment) {
    labourerAssignment.hoursWorked = (labourerAssignment.hoursWorked || 0) + hoursLogged;
  }
};

// Method to assign labourer to job
JobSchema.methods.assignLabourer = function (labourerId) {
  const existingAssignment = this.assignedLabourers.find(
    assignment => assignment.labourer.toString() === labourerId.toString()
  );

  if (!existingAssignment) {
    this.assignedLabourers.push({
      labourer: labourerId,
      assignedAt: new Date(),
      hoursWorked: 0,
    });
  }
};

// Method to remove labourer from job
JobSchema.methods.removeLabourer = function (labourerId) {
  this.assignedLabourers = this.assignedLabourers.filter(
    assignment => assignment.labourer.toString() !== labourerId.toString()
  );
};

// Indexes for better performance
JobSchema.index({ booking: 1 });
JobSchema.index({ status: 1 });
JobSchema.index({ priority: 1 });
JobSchema.index({ category: 1 });
JobSchema.index({ "assignedLabourers.labourer": 1 });
JobSchema.index({ createdBy: 1 });
JobSchema.index({ inspectedBy: 1 });
JobSchema.index({ createdAt: 1 });
JobSchema.index({ startedAt: 1 });
JobSchema.index({ completedAt: 1 });

// Ensure virtuals are included in JSON output
JobSchema.set("toJSON", { virtuals: true });
JobSchema.set("toObject", { virtuals: true });

const Job = mongoose.model("Job", JobSchema);
export default Job;