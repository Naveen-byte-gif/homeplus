# Firebase Setup Guide - Quick Fix

## The Issue
You're seeing: `⚠️ Firebase credentials not found. Push notifications will be disabled.`

This means Firebase Admin SDK credentials are not configured in your `.env` file.

## Quick Solution

### Option 1: Use Service Account Key (Recommended)

1. **Get Firebase Service Account Key:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (or create one)
   - Click ⚙️ (Settings) → Project Settings
   - Go to "Service Accounts" tab
   - Click "Generate New Private Key"
   - Download the JSON file

2. **Add to `.env` file:**
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
   ```

   **Important:** 
   - Wrap the entire JSON in single quotes `'...'`
   - Keep all the JSON content on one line
   - Don't add extra quotes inside

3. **Restart your server:**
   ```bash
   npm run dev
   ```

### Option 2: Use Individual Variables

If you prefer individual variables:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
```

**Important:**
- Keep the `\n` characters in the private key
- Wrap the private key in double quotes

## Step-by-Step Instructions

### Step 1: Create Firebase Project (if you don't have one)

1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Enter project name: "ApartmentSync" (or any name)
4. Click "Continue"
5. Disable Google Analytics (optional)
6. Click "Create project"

### Step 2: Get Service Account Key

1. In Firebase Console, click ⚙️ (Settings) → Project Settings
2. Go to "Service Accounts" tab
3. Click "Generate New Private Key"
4. Click "Generate Key" in the popup
5. JSON file will download automatically

### Step 3: Add to .env File

1. Open the downloaded JSON file
2. Copy the entire content
3. Open `apartment-sync-backend/.env` file
4. Add this line (replace with your actual JSON):
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY='<paste-your-json-here>'
   ```

   Example:
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"apartmentsync-12345","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-abc@apartmentsync-12345.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-abc%40apartmentsync-12345.iam.gserviceaccount.com"}'
   ```

### Step 4: Verify Setup

1. Restart your server
2. You should see: `✅ Firebase Admin initialized successfully`
3. Instead of: `⚠️ Firebase credentials not found`

## Troubleshooting

### Issue: "Invalid JSON"
- Make sure the entire JSON is on one line
- Wrap it in single quotes `'...'`
- Don't escape quotes inside the JSON

### Issue: "Private key format error"
- Make sure `\n` characters are preserved in the private key
- The private key should have actual newlines: `\n`

### Issue: "Project ID not found"
- Verify your Firebase project exists
- Check the project_id in the JSON matches your Firebase project

## Testing

After setup, test by creating a ticket:
1. Create a ticket as a resident
2. Check server logs for: `✅ Push notification sent successfully`
3. If you see this, Firebase is working!

## Note

**The app will work without Firebase**, but push notifications won't be sent. All other features (Socket.IO, Email, etc.) will work fine.

If you don't want to set up Firebase right now, you can ignore this warning. The app will continue to function normally, just without push notifications.

