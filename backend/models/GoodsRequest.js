import mongoose from "mongoose";

// 5. GOODS REQUEST MODEL
const GoodsRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: GR00001
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: [true, "Job is required"],
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Requested by is required"],
  },
  items: [{
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    quantity: {
      type: Number,
      min: 1,
      required: true,
    },
    purpose: {
      type: String,
      trim: true,
    },
  }],
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "released"],
    default: "pending",
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  approvedAt: Date,
  rejectionReason: String,
  notes: String,
}, {
  timestamps: true,
});

// Auto-generate requestId
GoodsRequestSchema.pre("save", async function (next) {
  if (this.isNew && !this.requestId) {
    const lastRequest = await this.constructor
      .findOne({ requestId: /^GR/ })
      .sort({ requestId: -1 })
      .select("requestId");

    let nextNumber = 1;
    if (lastRequest?.requestId) {
      const match = lastRequest.requestId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.requestId = `GR${nextNumber.toString().padStart(5, "0")}`;
  }
  next();
});

GoodsRequestSchema.index({ job: 1 });
GoodsRequestSchema.index({ status: 1 });
GoodsRequestSchema.index({ requestedBy: 1 });

export const GoodsRequest = mongoose.model("GoodsRequest", GoodsRequestSchema);
