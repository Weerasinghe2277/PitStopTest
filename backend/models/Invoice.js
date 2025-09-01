import mongoose from "mongoose";

// 6. INVOICE MODEL
const InvoiceSchema = new mongoose.Schema({
  invoiceId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: INV00001
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: [true, "Booking is required"],
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Customer is required"],
  },
  items: [{
    description: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  }],
  laborCharges: {
    type: Number,
    default: 0,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: [true, "Subtotal is required"],
    min: 0,
  },
  tax: {
    type: Number,
    default: 0,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  total: {
    type: Number,
    required: [true, "Total is required"],
    min: 0,
  },
  status: {
    type: String,
    enum: ["draft", "pending", "paid", "cancelled"],
    default: "draft",
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "card", "bank_transfer", "online"],
  },
  paidAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Created by is required"],
  },
  notes: String,
}, {
  timestamps: true,
});

// Auto-generate invoiceId
InvoiceSchema.pre("save", async function (next) {
  if (this.isNew && !this.invoiceId) {
    const lastInvoice = await this.constructor
      .findOne({ invoiceId: /^INV/ })
      .sort({ invoiceId: -1 })
      .select("invoiceId");

    let nextNumber = 1;
    if (lastInvoice?.invoiceId) {
      const match = lastInvoice.invoiceId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.invoiceId = `INV${nextNumber.toString().padStart(5, "0")}`;
  }
  next();
});

InvoiceSchema.index({ booking: 1 });
InvoiceSchema.index({ customer: 1 });
InvoiceSchema.index({ status: 1 });

export const Invoice = mongoose.model("Invoice", InvoiceSchema);
