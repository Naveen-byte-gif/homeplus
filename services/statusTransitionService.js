const { COMPLAINT_STATUS, USER_ROLES } = require('../utils/constants');

/**
 * Status Transition Service
 * Enforces strict role-based status transitions with validation
 */

// Configuration: Reopen window in days (configurable)
const REOPEN_WINDOW_DAYS = process.env.REOPEN_WINDOW_DAYS || 7;

/**
 * State Transition Matrix
 * Maps current status -> [allowed next statuses]
 * Role permissions are validated separately
 */
const STATUS_TRANSITION_MATRIX = {
  [COMPLAINT_STATUS.OPEN]: [COMPLAINT_STATUS.ASSIGNED, COMPLAINT_STATUS.CANCELLED],
  [COMPLAINT_STATUS.ASSIGNED]: [
    COMPLAINT_STATUS.IN_PROGRESS,
    COMPLAINT_STATUS.CANCELLED,
    COMPLAINT_STATUS.OPEN, // Unassign
  ],
  [COMPLAINT_STATUS.IN_PROGRESS]: [
    COMPLAINT_STATUS.RESOLVED,
    COMPLAINT_STATUS.CANCELLED,
  ],
  [COMPLAINT_STATUS.RESOLVED]: [
    COMPLAINT_STATUS.CLOSED,
    COMPLAINT_STATUS.REOPENED,
  ],
  [COMPLAINT_STATUS.CLOSED]: [COMPLAINT_STATUS.REOPENED],
  [COMPLAINT_STATUS.REOPENED]: [
    COMPLAINT_STATUS.ASSIGNED,
    COMPLAINT_STATUS.IN_PROGRESS,
    COMPLAINT_STATUS.CANCELLED,
  ],
  [COMPLAINT_STATUS.CANCELLED]: [], // Terminal state
};

/**
 * Role-based permissions
 * Maps role -> [allowed actions/statuses]
 */
const ROLE_PERMISSIONS = {
  [USER_ROLES.RESIDENT]: {
    // Can create with Open status
    canCreate: true,
    // Can cancel only when Open or Assigned
    canCancel: [COMPLAINT_STATUS.OPEN, COMPLAINT_STATUS.ASSIGNED],
    // Can reopen only after Resolved (within window)
    canReopen: [COMPLAINT_STATUS.RESOLVED],
    // Can close only Resolved tickets
    canClose: [COMPLAINT_STATUS.RESOLVED],
    // Cannot directly set these statuses
    cannotSet: [
      COMPLAINT_STATUS.IN_PROGRESS,
      COMPLAINT_STATUS.ASSIGNED,
      COMPLAINT_STATUS.RESOLVED,
    ],
  },
  [USER_ROLES.ADMIN]: {
    canCreate: false, // Admins don't create complaints
    // Can transition through admin workflow
    canSet: [
      COMPLAINT_STATUS.ASSIGNED,
      COMPLAINT_STATUS.IN_PROGRESS,
      COMPLAINT_STATUS.RESOLVED,
      COMPLAINT_STATUS.CLOSED,
      COMPLAINT_STATUS.CANCELLED,
      COMPLAINT_STATUS.REOPENED, // Admin can also reopen
    ],
    // Can approve/reject registrations
    canApproveReject: true,
    // Can assign staff
    canAssignStaff: true,
    // Mandatory comments required for these actions
    requiresComment: [
      COMPLAINT_STATUS.CANCELLED,
      COMPLAINT_STATUS.CLOSED,
      COMPLAINT_STATUS.REOPENED,
    ],
  },
  [USER_ROLES.STAFF]: {
    canCreate: false,
    // Can only update assigned tickets
    canUpdateAssignedOnly: true,
    // Can set these statuses for assigned tickets
    canSet: [COMPLAINT_STATUS.IN_PROGRESS, COMPLAINT_STATUS.RESOLVED],
    // Cannot cancel, close, or reopen
    cannotSet: [
      COMPLAINT_STATUS.CANCELLED,
      COMPLAINT_STATUS.CLOSED,
      COMPLAINT_STATUS.REOPENED,
      COMPLAINT_STATUS.ASSIGNED,
    ],
  },
};

/**
 * Validate status transition
 * @param {String} currentStatus - Current complaint status
 * @param {String} newStatus - Desired new status
 * @param {String} userRole - User's role (resident/admin/staff)
 * @param {Object} options - Additional validation options
 * @returns {Object} { valid: Boolean, error: String, errorCode: String }
 */
function validateStatusTransition(currentStatus, newStatus, userRole, options = {}) {
  const {
    complaint,
    userId,
    isOwnComplaint = false,
    hasComment = false,
  } = options;

  // Check if status transition is in matrix
  const allowedTransitions = STATUS_TRANSITION_MATRIX[currentStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Invalid status transition: Cannot transition from ${currentStatus} to ${newStatus}`,
      errorCode: 'INVALID_TRANSITION',
    };
  }

  // Role-based validation
  const permissions = ROLE_PERMISSIONS[userRole];
  if (!permissions) {
    return {
      valid: false,
      error: `Unknown user role: ${userRole}`,
      errorCode: 'INVALID_ROLE',
    };
  }

  // Resident validations
  if (userRole === USER_ROLES.RESIDENT) {
    // Residents can only modify their own complaints
    if (!isOwnComplaint) {
      return {
        valid: false,
        error: 'Residents can only modify their own complaints',
        errorCode: 'NOT_OWN_COMPLAINT',
      };
    }

    // Check if resident can cancel
    if (newStatus === COMPLAINT_STATUS.CANCELLED) {
      if (!permissions.canCancel.includes(currentStatus)) {
        return {
          valid: false,
          error: `Cannot cancel complaint with status: ${currentStatus}. Residents can only cancel Open or Assigned complaints.`,
          errorCode: 'CANCEL_NOT_ALLOWED',
        };
      }
    }

    // Check if resident can close
    if (newStatus === COMPLAINT_STATUS.CLOSED) {
      if (!permissions.canClose.includes(currentStatus)) {
        return {
          valid: false,
          error: `Cannot close complaint with status: ${currentStatus}. Residents can only close Resolved complaints.`,
          errorCode: 'CLOSE_NOT_ALLOWED',
        };
      }
    }

    // Check if resident can reopen
    if (newStatus === COMPLAINT_STATUS.REOPENED) {
      if (!permissions.canReopen.includes(currentStatus)) {
        return {
          valid: false,
          error: `Cannot reopen complaint with status: ${currentStatus}. Residents can only reopen Resolved complaints.`,
          errorCode: 'REOPEN_NOT_ALLOWED',
        };
      }

      // Check reopen window
      if (complaint && complaint.resolution?.resolvedAt) {
        const resolvedAt = new Date(complaint.resolution.resolvedAt);
        const now = new Date();
        const daysSinceResolution =
          (now - resolvedAt) / (1000 * 60 * 60 * 24);

        if (daysSinceResolution > REOPEN_WINDOW_DAYS) {
          return {
            valid: false,
            error: `Reopen window expired. Complaints can only be reopened within ${REOPEN_WINDOW_DAYS} days of resolution.`,
            errorCode: 'REOPEN_WINDOW_EXPIRED',
          };
        }
      }
    }

    // Check if resident is trying to set forbidden status
    if (permissions.cannotSet.includes(newStatus)) {
      return {
        valid: false,
        error: `Residents cannot set status to ${newStatus}`,
        errorCode: 'FORBIDDEN_STATUS',
      };
    }
  }

  // Admin validations
  if (userRole === USER_ROLES.ADMIN) {
    // Check if admin is trying to set an allowed status
    if (permissions.canSet && !permissions.canSet.includes(newStatus)) {
      return {
        valid: false,
        error: `Admin cannot set status to ${newStatus}`,
        errorCode: 'FORBIDDEN_STATUS',
      };
    }

    // Check mandatory comments for specific actions
    if (
      permissions.requiresComment.includes(newStatus) &&
      !hasComment
    ) {
      return {
        valid: false,
        error: `Comment/reason is required when ${userRole} sets status to ${newStatus}`,
        errorCode: 'COMMENT_REQUIRED',
      };
    }

    // Admin can transition through: Assigned → In Progress → Resolved → Closed
    // Validate proper sequence
    if (
      currentStatus === COMPLAINT_STATUS.ASSIGNED &&
      newStatus === COMPLAINT_STATUS.RESOLVED
    ) {
      return {
        valid: false,
        error: 'Cannot skip In Progress status. Transition must be: Assigned → In Progress → Resolved',
        errorCode: 'SKIP_STATE_NOT_ALLOWED',
      };
    }

    if (
      currentStatus === COMPLAINT_STATUS.ASSIGNED &&
      newStatus === COMPLAINT_STATUS.CLOSED
    ) {
      return {
        valid: false,
        error: 'Cannot skip required states. Transition must go through In Progress and Resolved',
        errorCode: 'SKIP_STATE_NOT_ALLOWED',
      };
    }

    if (
      currentStatus === COMPLAINT_STATUS.IN_PROGRESS &&
      newStatus === COMPLAINT_STATUS.CLOSED
    ) {
      return {
        valid: false,
        error: 'Cannot skip Resolved status. Transition must be: In Progress → Resolved → Closed',
        errorCode: 'SKIP_STATE_NOT_ALLOWED',
      };
    }
  }

  // Staff validations
  if (userRole === USER_ROLES.STAFF) {
    // Staff can only update assigned tickets
    if (permissions.canUpdateAssignedOnly && !complaint?.assignedTo?.staff) {
      return {
        valid: false,
        error: 'Staff can only update assigned tickets',
        errorCode: 'NOT_ASSIGNED',
      };
    }

    // Check if staff is assigned to this ticket
    if (
      permissions.canUpdateAssignedOnly &&
      complaint?.assignedTo?.staff?.toString() !== userId?.toString()
    ) {
      return {
        valid: false,
        error: 'Staff can only update tickets assigned to them',
        errorCode: 'NOT_ASSIGNED_TO_STAFF',
      };
    }

    // Check if staff can set this status
    if (!permissions.canSet.includes(newStatus)) {
      return {
        valid: false,
        error: `Staff cannot set status to ${newStatus}`,
        errorCode: 'FORBIDDEN_STATUS',
      };
    }

    // Staff cannot cancel, close, or reopen
    if (permissions.cannotSet.includes(newStatus)) {
      return {
        valid: false,
        error: `Staff cannot ${newStatus.toLowerCase()} tickets`,
        errorCode: 'FORBIDDEN_STATUS',
      };
    }
  }

  // All validations passed
  return {
    valid: true,
    error: null,
    errorCode: null,
  };
}

/**
 * Get allowed statuses for a role and current status
 */
function getAllowedStatuses(currentStatus, userRole, options = {}) {
  const { isOwnComplaint = false, complaint } = options;
  const allowedTransitions = STATUS_TRANSITION_MATRIX[currentStatus] || [];
  const permissions = ROLE_PERMISSIONS[userRole];

  if (!permissions) {
    return [];
  }

  // Filter based on role permissions
  return allowedTransitions.filter((status) => {
    // Resident validations
    if (userRole === USER_ROLES.RESIDENT) {
      if (!isOwnComplaint) return false;
      if (permissions.cannotSet.includes(status)) return false;

      if (status === COMPLAINT_STATUS.CANCELLED) {
        return permissions.canCancel.includes(currentStatus);
      }
      if (status === COMPLAINT_STATUS.CLOSED) {
        return permissions.canClose.includes(currentStatus);
      }
      if (status === COMPLAINT_STATUS.REOPENED) {
        if (!permissions.canReopen.includes(currentStatus)) return false;
        // Check reopen window
        if (complaint?.resolution?.resolvedAt) {
          const resolvedAt = new Date(complaint.resolution.resolvedAt);
          const now = new Date();
          const daysSinceResolution =
            (now - resolvedAt) / (1000 * 60 * 60 * 24);
          return daysSinceResolution <= REOPEN_WINDOW_DAYS;
        }
        return true;
      }
      return true;
    }

    // Admin validations
    if (userRole === USER_ROLES.ADMIN) {
      return permissions.canSet?.includes(status) ?? false;
    }

    // Staff validations
    if (userRole === USER_ROLES.STAFF) {
      if (permissions.cannotSet.includes(status)) return false;
      return permissions.canSet?.includes(status) ?? false;
    }

    return false;
  });
}

module.exports = {
  validateStatusTransition,
  getAllowedStatuses,
  STATUS_TRANSITION_MATRIX,
  ROLE_PERMISSIONS,
  REOPEN_WINDOW_DAYS,
};
