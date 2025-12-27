# Quick Twilio Setup Guide

## Problem
OTP is generated but SMS is not being sent to your phone. This happens when Twilio credentials are not configured.

## Solution

### Step 1: Create `.env` file
Create a file named `.env` in the `apartment-sync-backend` directory (same folder as `server.js`).

### Step 2: Add Twilio Credentials
Add these lines to your `.env` file:

```env
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=942e81975e6a13a11087a10e714d3331
TWILIO_PHONE_NUMBER=+17622357212
```

### Step 3: Restart Server
After adding the credentials, restart your server:
```bash
# Stop the server (Ctrl+C)
# Then start again
npm run dev
```

### Step 4: Test
Try sending OTP again. You should now receive SMS on your phone.

## Important Notes

1. **Trial Account**: If you're using a Twilio trial account, you can only send SMS to **verified phone numbers**. 
   - Go to Twilio Console → Phone Numbers → Verified Caller IDs
   - Add your phone number there first

2. **Check Server Logs**: After restarting, check your server console. You should see:
   - `✅ [SMS] OTP sent successfully to +91XXXXXXXXXX`
   - `📋 [SMS] Message SID: SM...`
   - If you see `⚠️ [SMS] Twilio client not initialized`, the credentials are not loaded

3. **Phone Number Format**: The system automatically formats Indian numbers:
   - Input: `6281807267`
   - Formatted: `+916281807267`

## Troubleshooting

### Still not receiving SMS?

1. **Check Twilio Console**: 
   - Go to https://console.twilio.com/
   - Check "Monitor" → "Logs" → "Messaging"
   - See if messages are being sent and their status

2. **Verify Phone Number** (Trial accounts only):
   - Twilio Console → Phone Numbers → Verified Caller IDs
   - Add your phone number: `+916281807267`

3. **Check Server Logs**:
   - Look for `✅ [SMS] OTP sent successfully` - means SMS was sent
   - Look for `⚠️ [SMS]` warnings - means credentials missing
   - Look for `❌ [SMS] Error` - means there's an error

4. **Common Errors**:
   - **Error 21608**: Phone number not verified (Trial account)
   - **Error 21211**: Invalid phone number format
   - **Error 21614**: Invalid phone number

## Current Status Check

After adding credentials and restarting, check your server logs. You should see one of these:

✅ **Success**: 
```
📱 [SMS] Sending OTP to +916281807267 (original: 6281807267)
✅ [SMS] OTP sent successfully to +916281807267
📋 [SMS] Message SID: SMxxxxxxxxxxxxx
📋 [SMS] Message Status: queued
```

❌ **Still Not Configured**:
```
⚠️ [SMS] Twilio client not initialized - logging OTP for development
📱 [SMS] OTP for +916281807267: 123456
📱 [SMS] ⚠️ SMS NOT SENT - Twilio credentials missing
```

If you see the second message, your `.env` file is not being loaded. Make sure:
- File is named exactly `.env` (not `.env.txt` or `.env.example`)
- File is in the `apartment-sync-backend` directory
- Server was restarted after creating/editing the file

