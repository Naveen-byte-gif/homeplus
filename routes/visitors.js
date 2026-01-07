const express = require("express");
const router = express.Router();
const {
  getAllVisitors,
  getVisitorById,
  createVisitor,
  checkInVisitor,
  checkOutVisitor,
  updateVisitorStatus,
  setExactTime,
  getOverdueVisitors,
  getVisitorStats,
} = require("../controllers/visitorController");
const { protect } = require("../middleware/auth");
const { requireStaffOrAdmin } = require("../middleware/roleCheck");

// All routes require authentication
router.use(protect);

// Dashboard stats - accessible to all authenticated users (role-based filtering applied)
router.get("/dashboard/stats", getVisitorStats);

// Get all visitors - role-based access:
//   - Admin: All visitors
//   - Staff: Visitors in assigned apartment
//   - Resident: Only visitors for their own flat (view-only)
router.get("/", getAllVisitors);

// Get overdue visitors - admin/staff only
router.get("/overdue", requireStaffOrAdmin, getOverdueVisitors);

// Create visitor - Admin/Staff only
// Residents are view-only and cannot create visitor entries
router.post("/", createVisitor);

// Check-in visitor - admin/staff only
router.post("/:id/check-in", requireStaffOrAdmin, checkInVisitor);

// Check-out visitor - admin/staff only
router.post("/:id/check-out", requireStaffOrAdmin, checkOutVisitor);

// Set exact time for visitor - admin/staff only (MUST be before /:id route)
router.put("/:id/exact-time", requireStaffOrAdmin, setExactTime);

// Update visitor status (Approve/Reject/Cancel) - admin/staff only
router.put("/:id/status", requireStaffOrAdmin, updateVisitorStatus);

// Get visitor by ID - role-based access (MUST be last to avoid conflicts):
//   - Admin: Any visitor
//   - Staff: Visitors in assigned apartment
//   - Resident: Only visitors for their own flat (view-only)
router.get("/:id", getVisitorById);

module.exports = router;
