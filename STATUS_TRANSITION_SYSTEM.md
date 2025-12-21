# Status Transition System - Implementation Guide

## Overview

This document describes the enhanced role-based status transition system with strict validation, audit logging, and comprehensive notifications.

## Key Features

### 1. **Role-Based Status Control**

#### Resident Permissions
- ✅ Can create complaints with status `Open`
- ✅ Can cancel complaints only when status is `Open` or `Assigned`
- ✅ Can reopen complaints only after `Resolved` (within configurable window - default 7 days)
- ✅ Can close complaints only when status is `Resolved`
- ❌ Cannot directly set: `In Progress`, `Resolved`, `Assigned`, `Closed` (except from Resolved)

#### Admin Permissions
- ✅ Can assign staff to complaints
- ✅ Can transition through: `Assigned` → `In Progress` → `Resolved` → `Closed`
- ✅ Can cancel, close, or reopen complaints (with mandatory comments)
- ✅ Can approve/reject user registrations
- ❌ Cannot skip required states (e.g., cannot go directly from `Assigned` to `Resolved`)

#### Staff Permissions
- ✅ Can update only assigned tickets
- ✅ Can set status: `In Progress`, `Resolved`
- ❌ Cannot cancel, close, reopen, or assign

### 2. **State Transition Matrix**

```
Open → Assigned, Cancelled
Assigned → In Progress, Cancelled, Open (unassign)
In Progress → Resolved, Cancelled
Resolved → Closed, Reopened
Closed → Reopened
Reopened → Assigned, In Progress, Cancelled
Cancelled → [] (Terminal)
```

### 3. **Mandatory Comments**

Comments/reasons are **required** for:
- Admin: Cancellation, Closure, Reopening
- Resident: Cancellation, Reopening (recommended)
- Staff: Not required (but recommended)

### 4. **Configurable Reopen Window**

Residents can reopen resolved complaints within a configurable window (default: 7 days).

Set via environment variable:
```bash
REOPEN_WINDOW_DAYS=7
```

### 5. **Immutable Audit Trail**

Every status transition is logged with:
- From/To status
- Who made the change (User ID + Role)
- When (timestamp - immutable)
- Why (reason/comment)
- IP Address
- User Agent
- Additional metadata

### 6. **Enhanced Notifications**

All status change notifications include:
- Complete residence location (Apartment Code, Wing, Floor, Flat Number, Specific Location)
- Status change details
- Who made the change
- Ticket information

## API Endpoints

### Update Status
```http
PUT /api/complaints/:id/status
Body: {
  status: "Resolved",
  description: "Issue fixed", // Optional but recommended
  reason: "Fixed the issue"   // Alternative to description
}
```

**Response Codes:**
- `400 INVALID_TRANSITION` - Invalid status transition
- `400 FORBIDDEN_STATUS` - Role cannot set this status
- `400 COMMENT_REQUIRED` - Comment/reason required
- `400 SKIP_STATE_NOT_ALLOWED` - Cannot skip required states
- `400 REOPEN_WINDOW_EXPIRED` - Reopen window has expired
- `403 NOT_OWN_COMPLAINT` - Resident trying to modify others' complaints
- `403 NOT_ASSIGNED_STAFF` - Staff trying to modify unassigned tickets

### Cancel Ticket
```http
POST /api/complaints/:id/cancel
Body: {
  reason: "No longer needed" // REQUIRED
}
```

### Reopen Ticket
```http
POST /api/complaints/:id/reopen
Body: {
  reason: "Issue persists" // REQUIRED
}
```

### Close Ticket
```http
POST /api/complaints/:id/close
Body: {
  reason: "Satisfied with resolution" // Required for Admin, optional for Resident
}
```

## Error Handling

All endpoints return structured error responses:

```json
{
  "success": false,
  "message": "Error description",
  "errorCode": "ERROR_CODE"
}
```

## Notification Payload

Status update notifications include:

```json
{
  "type": "ticket_status_updated",
  "ticketId": "...",
  "ticketNumber": "APT-123456-0001",
  "title": "Complaint Title",
  "oldStatus": "Open",
  "newStatus": "Assigned",
  "updatedBy": "Admin Name",
  "updatedByRole": "admin",
  "residenceLocation": "Apartment: ABC123, Wing: A, Floor: 2, Flat: 201",
  "location": {
    "apartmentCode": "ABC123",
    "wing": "A",
    "floorNumber": 2,
    "flatNumber": "201",
    "specificLocation": "Living Room"
  },
  "category": "Electrical",
  "priority": "High"
}
```

## SLA Timer Updates

SLA timers are automatically updated on status changes:
- **In Progress**: Records start time, calculates expected resolution
- **Resolved**: Records actual resolution time, checks SLA breach
- All timers are maintained automatically

## Testing

Test scenarios to verify:

1. ✅ Resident can create complaint (status = Open)
2. ✅ Resident cannot cancel Resolved/Closed complaints
3. ✅ Resident cannot set status to In Progress
4. ✅ Admin can assign staff (status = Assigned)
5. ✅ Admin cannot skip from Assigned to Resolved
6. ✅ Staff can only update assigned tickets
7. ✅ Staff cannot cancel/close tickets
8. ✅ Resident can reopen within window
9. ✅ Resident cannot reopen after window expires
10. ✅ Mandatory comments enforced for admin actions
11. ✅ All transitions logged in statusHistory
12. ✅ Notifications include complete location

## Configuration

### Environment Variables

```bash
# Reopen window in days (default: 7)
REOPEN_WINDOW_DAYS=7
```

## Files Modified

1. `services/statusTransitionService.js` - Status transition validator
2. `models/Complaint.js` - Added statusHistory field
3. `controllers/complaintController.js` - Enhanced validation
4. `services/ticketNotificationService.js` - Enhanced notifications with location

## Future Enhancements

- [ ] Configurable status transition rules via admin panel
- [ ] Custom SLA rules per category
- [ ] Automated escalation on SLA breach
- [ ] Status transition approval workflow
- [ ] Bulk status updates with validation

