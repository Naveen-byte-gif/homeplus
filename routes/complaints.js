const express = require("express");
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getComplaint,
  getAllTickets,
  addWorkUpdate,
  updateComplaintStatus,
  rateComplaint,
  assignTicket,
  addComment,
  reopenTicket,
  closeTicket,
  cancelTicket,
  addAdminMedia,
  addInternalNote,
  updatePriority,
  uploadAdminMedia,
} = require("../controllers/complaintController");
const { protect } = require("../middleware/auth");
const { authorize, requireStaffOrAdmin } = require("../middleware/roleCheck");
const { validateComplaintCreation } = require("../middleware/validation");
const { uploadConfigs } = require("../config/cloudinary");

// All routes are protected
router.use(protect);

// ==========================================
// RESIDENT ONLY ROUTES
// ==========================================

// Create complaint - ONLY residents can create
router.post(
  "/",
  authorize("resident"),
  validateComplaintCreation,
  createComplaint
);

// Get my complaints - ONLY residents
router.get("/my-complaints", authorize("resident"), getMyComplaints);

// Rate complaint - ONLY residents
router.post("/:id/rate", authorize("resident"), rateComplaint);

// Resident-specific reopen (with validation)
router.post("/:id/reopen", authorize("resident"), reopenTicket);

// Resident-specific close (with validation)
router.post("/:id/close", authorize("resident"), closeTicket);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Assign ticket - ONLY admin
router.post("/:id/assign", authorize("admin"), assignTicket);

// Upload admin media file - ONLY admin
router.post("/:id/upload-admin-media", authorize("admin"), uploadConfigs.complaintImages.single("media"), uploadAdminMedia);

// Add admin media/evidence - ONLY admin (after upload)
router.post("/:id/admin-media", authorize("admin"), addAdminMedia);

// Add internal note - ONLY admin
router.post("/:id/internal-notes", authorize("admin"), addInternalNote);

// Update priority - ONLY admin
router.put("/:id/priority", authorize("admin"), updatePriority);

// ==========================================
// STAFF ROUTES
// ==========================================

// Work updates - ONLY staff
router.post("/:id/work-updates", authorize("staff"), addWorkUpdate);

// Status update - ONLY Admin (validated by role in controller)
router.put("/:id/status", authorize("admin"), updateComplaintStatus);

// ==========================================
// COMMON ROUTES
// ==========================================

// Get single complaint - All authenticated users (role-checked in controller)
router.get("/:id", getComplaint);

// Get all tickets - Staff and Admin
router.get("/all/tickets", requireStaffOrAdmin, getAllTickets);

// Cancel ticket - Resident (own) and Admin (with validation)
router.post("/:id/cancel", cancelTicket);

// Add comment - All authenticated users (permissions checked in controller)
router.post("/:id/comments", addComment);

module.exports = router;
