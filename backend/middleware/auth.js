import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { createCustomError } from "../errors/custom-error.js";
import asyncWrapper from "./async.js";

// Verify JWT token and authenticate user
export const authenticate = asyncWrapper(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(createCustomError("No token provided, access denied", 401));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId)
      .select("-password -emailVerificationToken -passwordResetToken");

    if (!user) {
      return next(createCustomError("User not found, invalid token", 401));
    }

    if (user.status !== "active") {
      return next(createCustomError("Account is not active", 403));
    }

    // Check if account is locked
    if (user.isLocked) {
      return next(createCustomError("Account is temporarily locked", 423));
    }

    // Add user info to request object
    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      profile: user.profile,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(createCustomError("Invalid token", 401));
    }
    if (error.name === "TokenExpiredError") {
      return next(createCustomError("Token expired, please login again", 401));
    }
    return next(createCustomError("Token verification failed", 401));
  }
});

// Authorize based on user roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(createCustomError("Access denied, authentication required", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(createCustomError("Access denied, insufficient permissions", 403));
    }

    next();
  };
};

// Check if user owns the resource or has admin/manager privileges
export const authorizeOwnerOrAdmin = asyncWrapper(async (req, res, next) => {
  const { id } = req.params;
  const { userId, role } = req.user;

  // Admins and managers can access any user's data
  if (role === "admin" || role === "manager") {
    return next();
  }

  // Users can only access their own data
  if (id === userId.toString()) {
    return next();
  }

  return next(createCustomError("Access denied, can only access your own data", 403));
});

// Flexible authorization for different resource ownership patterns
export const authorizeOwnerOrRole = (...allowedRoles) => {
  return asyncWrapper(async (req, res, next) => {
    const { role, userId } = req.user;
    
    // Check if user has required role
    if (allowedRoles.includes(role)) {
      return next();
    }
    
    // For customers, they should only access their own resources
    if (role === "customer") {
      // This middleware assumes the resource belongs to the authenticated user
      // Individual route handlers should implement specific ownership checks
      return next();
    }
    
    return next(createCustomError("Access denied, insufficient permissions", 403));
  });
};

// Check if user is verified (email verification required)
export const requireVerification = (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  if (!req.user.emailVerified) {
    return next(createCustomError("Email verification required to access this resource", 403));
  }

  next();
};

// Check if user is a customer
export const requireCustomer = (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  if (req.user.role !== "customer") {
    return next(createCustomError("This resource is only available to customers", 403));
  }

  next();
};

// Check if user is an employee (technician, service_advisor, manager, cashier)
export const requireEmployee = (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  const employeeRoles = ["technician", "service_advisor", "manager", "cashier"];
  if (!employeeRoles.includes(req.user.role)) {
    return next(createCustomError("This resource is only available to employees", 403));
  }

  next();
};

// Check if user is a technician
export const requireTechnician = (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  if (req.user.role !== "technician") {
    return next(createCustomError("This resource is only available to technicians", 403));
  }

  next();
};

// Check if user is a service advisor
export const requireServiceAdvisor = (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  if (req.user.role !== "service_advisor") {
    return next(createCustomError("This resource is only available to service advisors", 403));
  }

  next();
};

// Check if user is a cashier
export const requireCashier = (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  if (req.user.role !== "cashier") {
    return next(createCustomError("This resource is only available to cashiers", 403));
  }

  next();
};

// Rate limiting middleware for login attempts
export const loginRateLimit = (req, res, next) => {
  // This could be enhanced with Redis or similar for distributed systems
  // For now, just pass through - actual rate limiting handled in login controller
  next();
};

// Optional: Two-factor authentication middleware
export const requireTwoFactor = asyncWrapper(async (req, res, next) => {
  if (!req.user) {
    return next(createCustomError("Authentication required", 401));
  }

  const user = await User.findById(req.user.userId);
  
  if (user.twoFactorEnabled) {
    // Check if 2FA token is provided and valid
    const twoFactorToken = req.headers['x-2fa-token'];
    
    if (!twoFactorToken) {
      return next(createCustomError("Two-factor authentication token required", 403));
    }
    
    // TODO: Implement 2FA token verification logic
    // This would typically involve verifying TOTP codes or similar
    
    // For now, just pass through
  }

  next();
});

// Middleware to check if user has specific specialization (for technicians)
export const requireSpecialization = (specialization) => {
  return asyncWrapper(async (req, res, next) => {
    if (!req.user) {
      return next(createCustomError("Authentication required", 401));
    }

    if (req.user.role !== "technician") {
      return next(createCustomError("This resource requires technician role", 403));
    }

    const user = await User.findById(req.user.userId);
    
    if (!user.employeeDetails?.specializations?.includes(specialization)) {
      return next(createCustomError(`This resource requires ${specialization} specialization`, 403));
    }

    next();
  });
};

// Department-based authorization
export const requireDepartment = (...departments) => {
  return asyncWrapper(async (req, res, next) => {
    if (!req.user) {
      return next(createCustomError("Authentication required", 401));
    }

    const employeeRoles = ["technician", "service_advisor", "manager", "cashier"];
    if (!employeeRoles.includes(req.user.role)) {
      return next(createCustomError("This resource is only available to employees", 403));
    }

    const user = await User.findById(req.user.userId);
    
    if (!departments.includes(user.employeeDetails?.department)) {
      return next(createCustomError(`Access denied, requires department: ${departments.join(', ')}`, 403));
    }

    next();
  });
};

// Combined authorization middleware for complex scenarios
export const requireRoleOrOwnership = (allowedRoles, ownershipField = 'customerId') => {
  return asyncWrapper(async (req, res, next) => {
    const { role, userId } = req.user;
    
    // Check if user has required role
    if (allowedRoles.includes(role)) {
      return next();
    }
    
    // Check ownership - this requires the route to have access to the resource
    // The specific implementation would depend on the resource type
    if (role === "customer") {
      // This middleware assumes ownership check will be done in the route handler
      // since we don't have access to the specific resource here
      req.requireOwnershipCheck = ownershipField;
      return next();
    }
    
    return next(createCustomError("Access denied, insufficient permissions", 403));
  });
};

export default {
  authenticate,
  authorize,
  authorizeOwnerOrAdmin,
  authorizeOwnerOrRole,
  requireVerification,
  requireCustomer,
  requireEmployee,
  requireTechnician,
  requireServiceAdvisor,
  requireCashier,
  loginRateLimit,
  requireTwoFactor,
  requireSpecialization,
  requireDepartment,
  requireRoleOrOwnership,
};