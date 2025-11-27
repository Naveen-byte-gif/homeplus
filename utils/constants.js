const COMPLAINT_CATEGORIES = [
  'Electrical',
  'Plumbing', 
  'Carpentry',
  'Painting',
  'Cleaning',
  'Security',
  'Elevator',
  'Common Area',
  'Other'
];

const COMPLAINT_PRIORITIES = {
  LOW: 'Low',
  MEDIUM: 'Medium', 
  HIGH: 'High',
  EMERGENCY: 'Emergency'
};

const COMPLAINT_STATUS = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  REOPENED: 'Reopened'
};

const USER_ROLES = {
  RESIDENT: 'resident',
  STAFF: 'staff', 
  ADMIN: 'admin'
};

const USER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REJECTED: 'rejected'
};

const NOTICE_CATEGORIES = [
  'General',
  'Maintenance',
  'Security', 
  'Event',
  'Emergency',
  'Payment'
];

const NOTICE_PRIORITIES = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent'
};

module.exports = {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUS,
  USER_ROLES,
  USER_STATUS,
  NOTICE_CATEGORIES,
  NOTICE_PRIORITIES
};