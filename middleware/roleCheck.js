// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Check if user is staff or admin
const requireStaffOrAdmin = (req, res, next) => {
  if (!['staff', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Staff or admin access required'
    });
  }
  next();
};

// Check if user can access their own data or is admin
const canAccessUserData = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied to user data'
    });
  }
  next();
};

module.exports = {
  authorize,
  requireAdmin,
  requireStaffOrAdmin,
  canAccessUserData
};