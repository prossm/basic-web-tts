# RevenueCat Integration Setup

## Overview
The Basic TTS application now includes full RevenueCat integration with the following usage model:
- **First audio file**: Always free for any user
- **Additional 15 minutes**: Free after the first file
- **Beyond 15 minutes**: Requires paid subscription

## Backend Configuration

### Environment Variables Required
Add these environment variables to your deployment configuration:

```bash
# RevenueCat API Configuration
REVENUECAT_API_KEY=your_revenuecat_secret_api_key_here
```

### Usage Limits
The following limits are configured in `server.py`:
- `FREE_FIRST_FILE = True` - First file always free
- `FREE_DURATION_SECONDS = 15 * 60` - 15 minutes of free audio after first file

## Frontend Configuration

### RevenueCat Configuration
The app is configured with the following RevenueCat settings:

```javascript
// Public API Key (already configured)
const revenueCatApiKey = 'rcb_QKFmTOiOnWADwtcAadurQldsNlNN';
```

### RevenueCat Dashboard Configuration
1. **App**: Basic TTS app created in RevenueCat dashboard ✅
2. **Product**: Monthly subscription product ID: `monthly` ✅
3. **Entitlement**: `premium` entitlement for unlimited access ✅
4. **Offering**: `premium_monthly` offering identifier ✅

## Features Implemented

### Backend Features
- ✅ User usage tracking (duration and file count)
- ✅ Automatic paywall enforcement at synthesis endpoint
- ✅ RevenueCat subscription verification
- ✅ Usage endpoints for frontend (`/user-usage`, `/check-generation-limits`)

### Frontend Features
- ✅ PayWall modal with usage information
- ✅ RevenueCat Web SDK integration
- ✅ Purchase flow with error handling
- ✅ Success confirmation modal
- ✅ Usage display in header for logged-in users
- ✅ Real-time usage updates after generation

### API Endpoints
- `POST /synthesize` - Now includes usage checking before generation
- `GET /user-usage` - Returns user's current usage and limits
- `POST /check-generation-limits` - Pre-check if user can generate audio

## Testing

### Test Flow
1. **Anonymous User**: Cannot generate beyond first file
2. **Logged-in User**: Can generate first file + 15 minutes free
3. **Over Limit**: Shows paywall modal with subscription option
4. **With Subscription**: Unlimited generation

### RevenueCat Sandbox Testing
Use RevenueCat's sandbox environment for testing purchases without real charges.

## Deployment Checklist

- [x] Set `REVENUECAT_API_KEY` environment variable
- [x] Configure public API key in `app.js`
- [x] Configure RevenueCat products and entitlements
- [ ] Test purchase flow in sandbox environment
- [ ] Test usage tracking and limit enforcement
- [ ] Verify subscription status checking

## Notes

- The integration gracefully falls back to placeholder functionality if RevenueCat SDK fails to load
- Usage is tracked by audio duration (calculated using Python's wave module)
- Deleted recordings are excluded from usage calculations
- Anonymous users get no free usage beyond the first file (login required)