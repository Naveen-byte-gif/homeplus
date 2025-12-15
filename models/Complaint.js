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

// Instance method to update status with timeline tracking
complaintSchema.methods.updateStatus = async function (
  newStatus,
  description,
  updatedBy
) {
  this.status = newStatus;
  this.timeline.push({
    status: newStatus,
    description: description,
    updatedBy: updatedBy,
  });

  if (newStatus === "Resolved") {
    this.resolution.resolvedAt = new Date();
    this.resolution.resolvedBy = updatedBy;
    this.sla.actualResolution = new Date();
    this.sla.isBreached =
      this.sla.actualResolution > this.sla.expectedResolution;
  }

  await this.save();
  return this;
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
