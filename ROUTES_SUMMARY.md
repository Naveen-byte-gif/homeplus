# API Routes Summary - Clean Implementation

## Complaint Routes (`/api/complaints`)

### Resident Only Routes
- `POST /api/complaints` - **Create complaint** (ONLY residents, status always "Open")
- `GET /api/complaints/my-complaints` - Get resident's own complaints
- `POST /api/complaints/:id/rate` - Rate complaint (ONLY residents)
- `POST /api/complaints/:id/reopen` - Reopen ticket (ONLY residents, with window validation)
- `POST /api/complaints/:id/close` - Close ticket (ONLY residents, from Resolved only)

### Admin Only Routes
- `POST /api/complaints/:id/assign` - Assign ticket to staff (ONLY admin)

### Staff Only Routes
- `POST /api/complaints/:id/work-updates` - Add work update (ONLY staff)

### Staff & Admin Routes
- `PUT /api/complaints/:id/status` - Update status (Staff & Admin, with role validation)

### Common Routes (Role-checked in controller)
- `GET /api/complaints/:id` - Get single complaint
- `GET /api/complaints/all/tickets` - Get all tickets (Staff & Admin)
- `POST /api/complaints/:id/cancel` - Cancel ticket (Resident own, or Admin)
- `POST /api/complaints/:id/comments` - Add comment (permissions checked in controller)

---

## Admin Routes (`/api/admin/complaints`)

### Admin Complaint Management
- `GET /api/admin/complaints` - Get all complaints for admin's apartment
- `PUT /api/admin/complaints/:complaintId/assign` - Assign complaint to staff
- `PUT /api/admin/complaints/:id/status` - Update complaint status (Admin)
- `POST /api/admin/complaints/:id/close` - Close ticket (Admin, with mandatory reason)
- `POST /api/admin/complaints/:id/cancel` - Cancel ticket (Admin, with mandatory reason)
- `POST /api/admin/complaints/:id/reopen` - Reopen ticket (Admin, with mandatory reason)

---

## Key Security Features

### ✅ Resident Protection
- Only residents can create complaints
- Complaints always created with status "Open" (enforced)
- Residents can only modify their own complaints
- Status transitions validated against role permissions

### ✅ Admin Control
- Admin can change status through proper workflow
- Admin can assign staff
- Admin actions require mandatory comments for certain statuses
- Admin can close/cancel/reopen with reasons

### ✅ Staff Limitations
- Staff can only update assigned tickets
- Staff cannot cancel, close, or reopen tickets
- Staff can set In Progress and Resolved status

### ✅ Validation
- All status transitions validated server-side
- Role-based permission checks
- Invalid transitions rejected with clear error codes
- Mandatory comments enforced for specific actions

---

## Status Transition Rules

### Resident Allowed Transitions
- Create: `Open` (enforced, cannot set other status)
- Cancel: `Open` → `Cancelled`, `Assigned` → `Cancelled`
- Reopen: `Resolved` → `Reopened` (within window)
- Close: `Resolved` → `Closed`

### Admin Allowed Transitions
- Full workflow: `Assigned` → `In Progress` → `Resolved` → `Closed`
- Cannot skip states (e.g., cannot go directly from `Assigned` to `Resolved`)
- Can cancel, close, reopen (with mandatory comments)

### Staff Allowed Transitions
- `Assigned` → `In Progress` (for assigned tickets only)
- `In Progress` → `Resolved` (for assigned tickets only)
- Cannot cancel, close, reopen, or assign

---

## Error Codes

- `FORBIDDEN_CREATE` - Non-resident trying to create complaint
- `INVALID_INITIAL_STATUS` - Trying to create complaint with non-Open status
- `INVALID_TRANSITION` - Invalid status transition
- `FORBIDDEN_STATUS` - Role cannot set this status
- `COMMENT_REQUIRED` - Comment/reason required
- `SKIP_STATE_NOT_ALLOWED` - Cannot skip required states
- `REOPEN_WINDOW_EXPIRED` - Reopen window has expired
- `NOT_OWN_COMPLAINT` - Resident trying to modify others' complaints
- `NOT_ASSIGNED_STAFF` - Staff trying to modify unassigned tickets

