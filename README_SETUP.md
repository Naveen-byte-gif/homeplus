# ApartmentSync Backend Setup Guide

## Overview
This backend has been fully configured with:
- ✅ Admin login/registration routes
- ✅ Firebase Admin SDK integration for push notifications
- ✅ Email templates
- ✅ Real-time Socket.IO updates
- ✅ FCM token management

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/apartmentsync

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=30d

# CORS
SOCKET_CORS_ORIGIN=http://localhost:3000

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Support Contact
SUPPORT_EMAIL=support@apartmentsync.com
ADMIN_EMAIL=admin@apartmentsync.com
SUPPORT_PHONE=+91-XXXXXX-XXXX

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Firebase Configuration
# Option 1: Service Account Key (JSON string)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project-id",...}

# Option 2: Individual credentials
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n
```

### 3. Firebase Setup
1. Go to Firebase Console (https://console.firebase.google.com/)
2. Create a new project or use existing
3. Go to Project Settings > Service Accounts
4. Generate a new private key
5. Copy the JSON content and set it as `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env`

### 4. Start Server
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp-register` - Verify OTP and Register
- `POST /api/auth/verify-otp-login` - Verify OTP and Login
- `POST /api/auth/password-login` - Password Login
- `POST /api/auth/admin/login` - Admin Login
- `POST /api/auth/admin/register` - Admin Register
- `GET /api/auth/me` - Get Current User

### Users
- `GET /api/users/dashboard` - Get User Dashboard
- `PUT /api/users/profile` - Update Profile
- `PUT /api/users/change-password` - Change Password
- `POST /api/users/fcm-token` - Update FCM Token

### Admin
- `GET /api/admin/dashboard` - Admin Dashboard
- `GET /api/admin/pending-approvals` - Get Pending Approvals
- `PUT /api/admin/users/:userId/approval` - Approve/Reject User
- `GET /api/admin/complaints` - Get All Complaints
- `PUT /api/admin/complaints/:complaintId/assign` - Assign Complaint
- `POST /api/admin/apartments` - Create Apartment

## Features

### Real-time Updates
- Socket.IO is configured for real-time notifications
- Users receive updates for:
  - Complaint status changes
  - New notices
  - Account approvals
  - Payment reminders

### Push Notifications
- Firebase Cloud Messaging (FCM) integration
- Automatic push notifications for:
  - Complaint updates
  - New notices
  - Account status changes
  - Important announcements

### Email Templates
Email templates are located in `templates/emails/`:
- `welcome.html` - Welcome email for new users
- `account_approved.html` - Account approval notification
- `complaint_registered.html` - Complaint registration confirmation

## Notes
- Admin users can register without apartment code
- After admin registration, they can create an apartment
- All other users require apartment code for registration
- FCM tokens are automatically stored when users login

