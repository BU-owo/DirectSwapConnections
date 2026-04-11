# BU Direct Swap Connections

A housing swap platform for BU students built with React + Vite and Firebase.

## Tech Stack
- React
- React Router
- Firebase Authentication
- Cloud Firestore
- Vite

## Features
- Google sign-in restricted to `@bu.edu`
- Submit, update, and remove swap listings
- Dynamic housing form with campus group, area, address, and layout dependencies
- Listing browse route with filters, sorting, and search
- Contact info hidden unless signed in

## Local Development
1. Install dependencies:
	`npm install`
2. Start the dev server:
	`npm run dev`
3. Build for production:
	`npm run build`

## Firebase Config
The app expects `firebase-config.js` to define `window.__FIREBASE_CONFIG__`.