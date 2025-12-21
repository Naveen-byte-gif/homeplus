const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
    },
    title: {
      type: String,
      required: [true, "Complaint title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Complaint description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    category: {
      type: String,
      enum: [
        "Electrical",
        "Plumbing",
        "Carpentry",
        "Painting",
        "Cleaning",
        "Security",
        "Elevator",
        "Common Area",
        "Other",
      ],
      required: true,
    },
    subCategory: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Emergency"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: [
        "Open",
        "Assigned",
        "In Progress",
        "Resolved",
        "Closed",
        "Cancelled",
        "Reopened",
      ],
      default: "Open",
    },
    location: {
      specificLocation: String,
      accessInstructions: String,
      wing: String,
      flatNumber: String,
      floorNumber: Number,
    },
    media: [
      {
        url: String,
        publicId: String,
        type: { type: String, enum: ["image", "video"] },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
      assignedAt: Date,
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    timeline: [
      {
        status: String,
        description: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    // Immutable status history for audit trail
    statusHistory: [
      {
        fromStatus: { type: String, required: true },
        toStatus: { type: String, required: true },
        reason: String, // Mandatory for certain transitions
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        updatedByRole: { type: String, required: true },
        timestamp: { type: Date, default: Date.now, immutable: true },
        ipAddress: String,
        userAgent: String,
        // Additional metadata
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],
    workUpdates: [
      {
        description: String,
        images: [
          {
            url: String,
            publicId: String,
          },
        ],
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    resolution: {
      description: String,
      resolvedAt: Date,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      images: [
        {
          url: String,
          publicId: String,
        },
      ],
    },
    rating: {
      score: { type: Number, min: 1, max: 5 },
      comment: String,
      ratedAt: Date,
    },
    sla: {
      expectedResolution: Date,
      actualResolution: Date,
      isBreached: { type: Boolean, default: false },
    },
    internalNotes: [
      {
        note: String,
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        addedAt: { type: Date, default: Date.now },
        isInternal: { type: Boolean, default: true },
      },
    ],
    // Comments for transparent communication
    comments: [
      {
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: [1000, "Comment cannot exceed 1000 characters"],
        },
        postedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        postedAt: { type: Date, default: Date.now },
        media: [
          {
            url: String,
            publicId: String,
            type: { type: String, enum: ["image", "video"] },
          },
        ],
        isEdited: { type: Boolean, default: false },
        editedAt: Date,
      },
    ],
    // Track if ticket was previously closed (for reopen logic)
    previouslyClosed: { type: Boolean, default: false },
    closedAt: Date,
    reopenedAt: Date,
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancellationReason: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
complaintSchema.index({ createdBy: 1, status: 1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ category: 1, priority: 1 });
complaintSchema.index({ status: 1, createdAt: 1 });
complaintSchema.index({ ticketNumber: 1 }, { unique: true });

// Pre-validate middleware to generate ticket number before required checks
complaintSchema.pre("validate", async function (next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    this.ticketNumber = `APT-${Date.now().toString().slice(-6)}-${(count + 1)
      .toString()
      .padStart(4, "0")}`;

    // Add initial timeline entry
    this.timeline.push({
      status: "Open",
      description: "Complaint registered",
      updatedBy: this.createdBy,
    });

    // Set SLA based on priority
    const slaHours = {
      Emergency: 2,
      High: 24,
      Medium: 72,
      Low: 168,
    };

    this.sla.expectedResolution = new Date(
      Date.now() + slaHours[this.priority] * 60 * 60 * 1000
    );
  }
  next();
});

// Instance method to update status with timeline tracking and audit history
complaintSchema.methods.updateStatus = async function (
  newStatus,
  description,
  updatedBy,
  options = {}
) {
  const oldStatus = this.status;
  const { updatedByRole, ipAddress, userAgent, metadata = {} } = options;

  this.status = newStatus;

  // Update timeline (existing functionality)
  this.timeline.push({
    status: newStatus,
    description:
      description || `Status changed from ${oldStatus} to ${newStatus}`,
    updatedBy: updatedBy,
  });

  // Add immutable status history entry (audit trail)
  this.statusHistory.push({
    fromStatus: oldStatus,
    toStatus: newStatus,
    reason: description || null,
    updatedBy: updatedBy,
    updatedByRole: updatedByRole || "unknown",
    timestamp: new Date(), // Immutable timestamp
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    metadata: {
      ...metadata,
      ticketNumber: this.ticketNumber,
      category: this.category,
      priority: this.priority,
    },
  });

  // Handle status-specific logic
  if (newStatus === "Resolved") {
    this.resolution.resolvedAt = new Date();
    this.resolution.resolvedBy = updatedBy;
    this.sla.actualResolution = new Date();
    this.sla.isBreached =
      this.sla.actualResolution > this.sla.expectedResolution;
  } else if (newStatus === "Closed") {
    this.closedAt = new Date();
    this.previouslyClosed = true;
  } else if (newStatus === "Reopened") {
    this.reopenedAt = new Date();
    this.reopenedBy = updatedBy;
    // Reset resolution data when reopening
    this.resolution = {
      description: "",
      resolvedAt: null,
      resolvedBy: null,
      images: [],
    };
  } else if (newStatus === "Cancelled") {
    this.cancelledAt = new Date();
    this.cancelledBy = updatedBy;
  } else if (newStatus === "Assigned") {
    // Assigned status is set when staff is assigned
    if (!this.assignedTo.assignedAt) {
      this.assignedTo.assignedAt = new Date();
    }
  }

  await this.save();
  return this;
};

// Instance method to add comment
complaintSchema.methods.addComment = async function (
  text,
  postedBy,
  media = []
) {
  this.comments.push({
    text,
    postedBy,
    media,
  });
  await this.save();
  return this.comments[this.comments.length - 1];
};

// Instance method to validate status transition
complaintSchema.methods.canTransitionTo = function (newStatus, userRole) {
  const validTransitions = {
    Open: ["Assigned", "Cancelled"],
    Assigned: ["In Progress", "Cancelled", "Open"], // Can unassign
    "In Progress": ["Resolved", "Cancelled"],
    Resolved: ["Closed", "Reopened"],
    Closed: ["Reopened"], // Can only reopen
    Reopened: ["Assigned", "In Progress", "Cancelled"], // Treated as active
    Cancelled: [], // Terminal state
  };

  const allowedStatuses = validTransitions[this.status] || [];

  // Role-based restrictions
  if (newStatus === "Assigned" && userRole !== "admin") {
    return false; // Only admin can assign
  }

  if (newStatus === "Reopened" && userRole !== "resident") {
    return false; // Only resident can reopen
  }

  if (newStatus === "Closed" && userRole !== "resident") {
    return false; // Only resident can close
  }

  return allowedStatuses.includes(newStatus);
};

// Static method for dashboard stats
complaintSchema.statics.getDashboardStats = async function (apartmentCode) {
  const stats = await this.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $match: {
        "user.apartmentCode": apartmentCode,
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  return stats.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});
};

module.exports = mongoose.model("Complaint", complaintSchema);
