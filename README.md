# DirectSwapConnections
# BU Direct Swap Connections

A housing swap platform for BU students — GitHub Pages frontend, Firebase backend.

## How It Works
- Sign in with a **@bu.edu email** (magic link, no password)
- Submit your housing listing
- Browse other listings and filter by gender, building, occupancy, or roommate status
- **Contact info is locked** until you submit your own listing
- Update or remove your listing any time

---

## Setup (one-time, ~15 min)

### 1. Create a Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → name it (e.g. `bu-direct-swap`)

### 2. Enable Authentication
1. Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Email/Password**
3. Also enable **Email link (passwordless sign-in)**

### 3. Authorize your domain
1. Authentication → **Settings** → **Authorized domains**
2. Add `YOUR-USERNAME.github.io`
   *(also add `localhost` if you want to test locally)*

### 4. Create Firestore Database
1. Firebase Console → **Firestore Database** → **Create database**
2. Start in **production mode**
3. Pick a region (e.g. `us-east1`)

### 5. Deploy security rules
**Option A — Firebase CLI (recommended)**
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project
# replace the generated firestore.rules with the one in this repo
firebase deploy --only firestore:rules
```

**Option B — Firebase Console**
1. Firestore → **Rules** tab
2. Paste the contents of `firestore.rules` and click **Publish**

### 6. Add your Firebase config
1. Firebase Console → **Project Settings** → **Your apps** → **Add app (Web)**
2. Copy the config object
3. Paste it into the top of `app.js` (replaces the placeholder values)

### 7. Push to GitHub Pages
1. Push all files to a GitHub repo
2. **Settings** → **Pages** → set source to your main branch, root folder
3. Your site will be live at `https://BU-owo.github.io/DirectSwapConnections/`

---

## Local Testing
Don't open `index.html` directly as a file — ES modules need a server.
```bash
npx serve .
# then open http://localhost:3000
```
Or use the **Live Server** extension in VS Code.

---

## Notes
- One listing per BU email
- Listings are sorted newest-first by default (also sortable by building)
- Contact info is only revealed once you have a live listing
- Email link sign-ins require the user to **click the link on the same device** they requested it from