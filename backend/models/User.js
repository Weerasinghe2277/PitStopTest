import mongoose from "mongoose";
import {
  hashPasswordMiddleware,
  comparePassword,
} from "../middleware/password-middleware.js";

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      // Will be auto-generated based on role
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't include password in queries by default
    },
    role: {
      type: String,
      required: [true, "User role is required"],
      enum: {
        values: ["customer", "technician", "service_advisor", "manager", "admin", "cashier"],
        message: "Invalid user role",
      },
    },
    profile: {
      firstName: {
        type: String,
        required: [true, "First name is required"],
        trim: true,
        maxlength: [50, "First name cannot exceed 50 characters"],
      },
      lastName: {
        type: String,
        required: [true, "Last name is required"],
        trim: true,
        maxlength: [50, "Last name cannot exceed 50 characters"],
      },
      phoneNumber: {
        type: String,
        required: [true, "Phone number is required"],
        trim: true,
        match: [
          /^(\+94|0)[0-9]{9}$/,
          "Please enter a valid Sri Lankan phone number",
        ],
      },
      address: {
        street: {
          type: String,
          required: [true, "Street address is required"],
          trim: true,
          maxlength: [200, "Street address cannot exceed 200 characters"],
        },
        city: {
          type: String,
          required: [true, "City is required"],
          trim: true,
          maxlength: [50, "City cannot exceed 50 characters"],
        },
        province: {
          type: String,
          required: [true, "Province is required"],
          enum: [
            "Western",
            "Central",
            "Southern",
            "Eastern",
            "Northern",
            "North Central",
            "North Western",
            "Sabaragamuwa",
            "Uva"
          ],
        },
        postalCode: {
          type: String,
          required: [true, "Postal code is required"],
          trim: true,
          match: [/^[0-9]{5}$/, "Postal code must be 5 digits"],
        },
      },
      nic: {
        type: String,
        required: [true, "NIC number is required"],
        unique: true,
        trim: true,
        match: [
          /^([0-9]{9}[vVxX]|[0-9]{12})$/,
          "Please enter a valid NIC number (9 digits + V/X or 12 digits)",
        ],
      },
      dateOfBirth: {
        type: Date,
        required: [true, "Date of birth is required"],
        validate: {
          validator: function (v) {
            const today = new Date();
            const minAge = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
            return v <= minAge;
          },
          message: "User must be at least 16 years old",
        },
      },
    },
    // Customer specific details
    customerDetails: {
      loyaltyPoints: {
        type: Number,
        default: 0,
        min: [0, "Loyalty points cannot be negative"],
        required: function () {
          return this.role === "customer";
        },
      },
      membershipTier: {
        type: String,
        enum: ["bronze", "silver", "gold", "platinum"],
        default: "bronze",
        required: function () {
          return this.role === "customer";
        },
      },
      emergencyContact: {
        name: {
          type: String,
          trim: true,
          maxlength: [100, "Emergency contact name cannot exceed 100 characters"],
          required: function () {
            return this.role === "customer";
          },
        },
        phoneNumber: {
          type: String,
          trim: true,
          match: [
            /^(\+94|0)[0-9]{9}$/,
            "Please enter a valid phone number",
          ],
          required: function () {
            return this.role === "customer";
          },
        },
        relationship: {
          type: String,
          enum: ["spouse", "parent", "sibling", "child", "friend", "other"],
          required: function () {
            return this.role === "customer";
          },
        },
      },
    },
    // Employee details (technician, service_advisor, manager, cashier)
    employeeDetails: {
      employeeId: {
        type: String,
        trim: true,
        uppercase: true,
        // Auto-generated in pre-save middleware, not required in schema
      },
      department: {
        type: String,
        enum: ["mechanical", "electrical", "bodywork", "detailing", "customer_service", "management", "front_desk"],
        required: function () {
          return ["technician", "service_advisor", "manager", "cashier"].includes(this.role);
        },
      },
      specializations: [{
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
      certifications: [{
        name: {
          type: String,
          required: true,
          trim: true,
        },
        issuedBy: {
          type: String,
          required: true,
          trim: true,
        },
        issueDate: {
          type: Date,
          required: true,
        },
        expiryDate: {
          type: Date,
        },
        certificateNumber: {
          type: String,
          trim: true,
        },
      }],
      joinDate: {
        type: Date,
        required: function () {
          return ["technician", "service_advisor", "manager", "cashier"].includes(this.role);
        },
        validate: {
          validator: function (v) {
            return !v || v <= new Date();
          },
          message: "Join date cannot be in the future",
        },
      },
      baseSalary: {
        type: Number,
        min: [0, "Salary cannot be negative"],
        required: function () {
          return ["technician", "service_advisor", "manager", "cashier"].includes(this.role);
        },
      },
      commissionRate: {
        type: Number,
        min: [0, "Commission rate cannot be negative"],
        max: [100, "Commission rate cannot exceed 100%"],
        default: 0,
      },
    },
    // Preferences and settings
    preferences: {
      language: {
        type: String,
        enum: ["en", "si", "ta"],
        default: "en",
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        sms: {
          type: Boolean,
          default: true,
        },
        push: {
          type: Boolean,
          default: true,
        },
        marketing: {
          type: Boolean,
          default: false,
        },
      },
      timezone: {
        type: String,
        default: "Asia/Colombo",
      },
    },
    // Account status and security
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive", "suspended", "terminated"],
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetExpires: {
      type: Date,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ "employeeDetails.department": 1 });
UserSchema.index({ "customerDetails.membershipTier": 1 });
UserSchema.index({ "employeeDetails.specializations": 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ lastLogin: 1 });

// Hash password before saving
UserSchema.pre("save", hashPasswordMiddleware);

// Password comparison method
UserSchema.methods.comparePassword = comparePassword;

// Auto-generate userId based on role
UserSchema.pre("save", async function (next) {
  if (this.isNew && !this.userId) {
    try {
      const rolePrefix = {
        customer: "C",
        technician: "T",
        service_advisor: "SA",
        manager: "M",
        admin: "A",
        cashier: "CS",
      };

      const prefix = rolePrefix[this.role];
      if (!prefix) {
        return next(new Error("Invalid role for userId generation"));
      }

      // Find the highest existing userId for this role
      const lastUser = await this.constructor
        .findOne({ userId: new RegExp(`^${prefix}`) })
        .sort({ userId: -1 })
        .select("userId");

      let nextNumber = 1;
      if (lastUser && lastUser.userId) {
        const match = lastUser.userId.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      this.userId = `${prefix}${nextNumber.toString().padStart(5, "0")}`;
    } catch (error) {
      return next(error);
    }
  }

  // Normalize phone numbers
  if (this.profile && this.profile.phoneNumber) {
    let phone = this.profile.phoneNumber.replace(/\s+/g, "");
    if (phone.startsWith("0")) {
      phone = "+94" + phone.substring(1);
    } else if (!phone.startsWith("+94")) {
      phone = "+94" + phone;
    }
    this.profile.phoneNumber = phone;
  }

  // Normalize emergency contact phone
  if (this.customerDetails && this.customerDetails.emergencyContact && this.customerDetails.emergencyContact.phoneNumber) {
    let phone = this.customerDetails.emergencyContact.phoneNumber.replace(/\s+/g, "");
    if (phone.startsWith("0")) {
      phone = "+94" + phone.substring(1);
    } else if (!phone.startsWith("+94")) {
      phone = "+94" + phone;
    }
    this.customerDetails.emergencyContact.phoneNumber = phone;
  }

  // Generate employee ID for staff members
  if (["technician", "service_advisor", "manager", "cashier"].includes(this.role)) {
    // Ensure employeeDetails object exists
    if (!this.employeeDetails) {
      this.employeeDetails = {};
    }
    
    // Generate employeeId if not provided
    if (!this.employeeDetails.employeeId && this.employeeDetails.department) {
      const deptPrefix = {
        mechanical: "MEC",
        electrical: "ELE",
        bodywork: "BOD",
        detailing: "DET",
        customer_service: "CS",
        management: "MGT",
        front_desk: "FD"
      };
      
      const prefix = deptPrefix[this.employeeDetails.department];
      if (prefix) {
        const count = await this.constructor.countDocuments({
          role: this.role,
          "employeeDetails.department": this.employeeDetails.department
        });
        this.employeeDetails.employeeId = `${prefix}${(count + 1).toString().padStart(3, "0")}`;
      }
    }
  }

  // Update membership tier based on loyalty points
  if (this.role === "customer" && this.customerDetails) {
    const points = this.customerDetails.loyaltyPoints;
    if (points >= 10000) {
      this.customerDetails.membershipTier = "platinum";
    } else if (points >= 5000) {
      this.customerDetails.membershipTier = "gold";
    } else if (points >= 2000) {
      this.customerDetails.membershipTier = "silver";
    } else {
      this.customerDetails.membershipTier = "bronze";
    }
  }

  next();
});

// Virtual for full name
UserSchema.virtual("fullName").get(function () {
  if (this.profile && this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return "";
});

// Virtual for age
UserSchema.virtual("age").get(function () {
  if (this.profile && this.profile.dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(this.profile.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  }
  return null;
});

// Virtual for account locked status
UserSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual for full address
UserSchema.virtual("fullAddress").get(function () {
  if (this.profile && this.profile.address) {
    const addr = this.profile.address;
    return `${addr.street}, ${addr.city}, ${addr.province} ${addr.postalCode}`;
  }
  return "";
});

// Virtual for years of service (for employees)
UserSchema.virtual("yearsOfService").get(function () {
  if (this.employeeDetails && this.employeeDetails.joinDate) {
    const today = new Date();
    const joinDate = new Date(this.employeeDetails.joinDate);
    return Math.floor((today - joinDate) / (365.25 * 24 * 60 * 60 * 1000));
  }
  return null;
});

// Ensure virtuals are included in JSON output
UserSchema.set("toJSON", { virtuals: true });
UserSchema.set("toObject", { virtuals: true });

const User = mongoose.model("User", UserSchema);
export default User;