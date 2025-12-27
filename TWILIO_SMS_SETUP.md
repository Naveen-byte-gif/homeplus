# Twilio SMS OTP Setup Guide

This guide explains how to set up Twilio SMS service for sending OTP codes in the ApartmentSync application.

## Prerequisites

1. A Twilio account (sign up at https://www.twilio.com/)
2. A Twilio phone number with SMS capabilities
3. Twilio Account SID and Auth Token

## Getting Your Twilio Credentials

1. **Log in to Twilio Console**: Go to https://console.twilio.com/
2. **Get Account SID**: Found on the dashboard homepage
3. **Get Auth Token**: Click on "Show" next to Auth Token (keep this secret!)
4. **Get Phone Number**: Go to Phone Numbers > Manage > Active numbers

## Environment Variables Setup

Add the following environment variables to your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=942e81975e6a13a11087a10e714d3331
TWILIO_PHONE_NUMBER=+17622357212
```

**Important Security Notes:**
- Never commit your `.env` file to version control
- Keep your Auth Token secret and secure
- Rotate your Auth Token if it's ever exposed

## Phone Number Format

The SMS service automatically formats phone numbers to E.164 format:
- 10-digit numbers (e.g., `9876543210`) → `+919876543210`
- Numbers with country code (e.g., `919876543210`) → `+919876543210`
- Numbers already in E.164 format (e.g., `+919876543210`) → Used as-is

## How It Works

### Backend Flow

1. **User requests OTP**: Client calls `/api/auth/send-otp` with phone number
2. **OTP Generation**: Backend generates a 6-digit OTP and stores it in database
3. **SMS Sending**: Backend sends OTP via Twilio SMS
4. **OTP Verification**: User enters OTP, backend verifies it

### SMS Service Features

- ✅ Automatic phone number formatting
- ✅ Error handling with user-friendly messages
- ✅ Development mode logging (when Twilio not configured)
- ✅ Production-ready Twilio integration
- ✅ Detailed logging for debugging

## Testing

### Development Mode

If Twilio credentials are not configured, the service will:
- Log OTP to console for testing
- Still generate and store OTP in database
- Allow OTP verification to work normally

### Production Mode

With Twilio configured:
- OTPs are sent via SMS
- Real-time delivery status tracking
- Error handling for invalid numbers

## Troubleshooting

### OTP Not Received

1. **Check Twilio Console**: Verify message status in Twilio console
2. **Check Phone Number**: Ensure phone number is in correct format
3. **Check Trial Account**: Trial accounts can only send to verified numbers
4. **Check Logs**: Review backend logs for error messages

### Common Errors

- **Error 21211**: Invalid phone number format
- **Error 21608**: Phone number not verified (Trial account limitation)
- **Error 21614**: Invalid phone number

### Trial Account Limitations

Twilio trial accounts have limitations:
- Can only send SMS to verified phone numbers
- Limited number of messages per day
- Upgrade to paid account for production use

## Code Structure

### Backend Files

- `services/smsService.js`: SMS service with Twilio integration
- `controllers/authController.js`: Auth controller using SMS service
- `models/OTP.js`: OTP model for storing OTPs

### Key Functions

```javascript
// Send OTP
const { sendOTP } = require('./services/smsService');
await sendOTP(phoneNumber, otpCode);

// Format phone number
const { formatPhoneNumber } = require('./services/smsService');
const formatted = formatPhoneNumber('9876543210'); // Returns: +919876543210
```

## Security Best Practices

1. **Environment Variables**: Store credentials in `.env`, never in code
2. **Token Security**: Keep Auth Token secret and rotate regularly
3. **Rate Limiting**: Already implemented in `server.js`
4. **OTP Expiry**: OTPs expire after 5 minutes
5. **OTP Usage**: Each OTP can only be used once

## Support

For Twilio-specific issues:
- Twilio Documentation: https://www.twilio.com/docs
- Twilio Support: https://support.twilio.com/

For application-specific issues:
- Check backend logs
- Review error messages in API responses
- Verify environment variables are set correctly

