import mongoose from "mongoose";

// 4. INVENTORY ITEM MODEL
const InventoryItemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    unique: true,
    uppercase: true,
    // Auto-generated: ITM00001
  },
  name: {
    type: String,
    required: [true, "Item name is required"],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    enum: ["parts", "tools", "fluids", "consumables"],
    required: [true, "Category is required"],
  },
  brand: {
    type: String,
    trim: true,
  },
  partNumber: {
    type: String,
    trim: true,
  },
  unitPrice: {
    type: Number,
    min: 0,
    required: [true, "Unit price is required"],
  },
  currentStock: {
    type: Number,
    min: 0,
    default: 0,
  },
  minimumStock: {
    type: Number,
    min: 0,
    default: 0,
  },
  unit: {
    type: String,
    enum: ["piece", "liter", "kg", "meter", "set"],
    required: [true, "Unit is required"],
  },
  supplier: {
    name: {
      type: String,
      trim: true,
    },
    contact: {
      type: String,
      trim: true,
    },
  },
  status: {
    type: String,
    enum: ["active", "inactive", "discontinued"],
    default: "active",
  },
}, {
  timestamps: true,
});

// Auto-generate itemId
InventoryItemSchema.pre("save", async function (next) {
  if (this.isNew && !this.itemId) {
    const lastItem = await this.constructor
      .findOne({ itemId: /^ITM/ })
      .sort({ itemId: -1 })
      .select("itemId");

    let nextNumber = 1;
    if (lastItem?.itemId) {
      const match = lastItem.itemId.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    this.itemId = `ITM${nextNumber.toString().padStart(5, "0")}`;
  }
  next();
});

InventoryItemSchema.index({ category: 1 });
InventoryItemSchema.index({ status: 1 });

export const InventoryItem = mongoose.model("InventoryItem", InventoryItemSchema);
