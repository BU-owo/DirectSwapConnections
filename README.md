# DirectSwapConnections
# BU Direct Swap Connections

A housing swap platform for BU students — GitHub Pages frontend, Firebase backend.

## Firebase Config Setup
1. Copy `firebase-config.example.js` to `firebase-config.js`.
2. Fill in your Firebase web config values in `firebase-config.js`.
3. Keep `firebase-config.js` out of git (it is ignored).

The app expects `window.__FIREBASE_CONFIG__` to be defined before `app.js` loads.

## Security Note
Firebase web API keys are not true secrets in browser apps, but they should still be protected from abuse:
- Restrict the key in Google Cloud Console to your app's domains.
- Rotate any key that was previously committed.
- Keep strict Firestore/Auth rules in place.

## How It Works
- Sign in with a **@bu.edu email** (magic link, no password)
- Submit your housing listing
- Browse other listings and filter by gender, building, occupancy, or roommate status
- **Contact info is locked** until you submit your own listing
- Update or remove your listing any time