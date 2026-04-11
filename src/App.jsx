import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import React, { useState } from "react";
import { AppProvider, useAppContext } from "./context/AppContext";
import BrowsePage from "./pages/BrowsePage";
import SubmitPage from "./pages/SubmitPage";

function Layout() {
  const { user, signInWithGoogle, signOutUser, firebaseConfigError } = useAppContext();
  const [authError, setAuthError] = useState("");
  const navigate = useNavigate();

  async function handleSignIn() {
    setAuthError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error.message || "Sign in failed.");
    }
  }

  async function handleSignOut() {
    setAuthError("");
    await signOutUser();
  }

  return (
    <>
      <nav>
        <div className="nav-brand">Direct Swap <span>Connections</span></div>
        <div className="nav-menu">
          <div className="nav-center">
            <NavLink
              to="/submit"
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`.trim()}
            >
              Submit Listing
            </NavLink>
            <NavLink
              to="/browse"
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`.trim()}
            >
              Browse Listings
            </NavLink>
          </div>
          <div className="nav-end">
            {user ? (
              <div id="state-in">
                <img className="nav-avatar" src={user.photoURL || ""} alt="" />
                <span className="nav-email-text">{user.email}</span>
                <button className="btn-nav-signout" onClick={handleSignOut}>Sign Out</button>
              </div>
            ) : (
              <button className="btn-google-nav" onClick={handleSignIn}>Sign In with Google</button>
            )}
          </div>
        </div>
      </nav>

      <div className="hero">
        <h1>BU Housing<br /><em>Direct Swaps</em></h1>
        <p>Find your perfect room swap. Submit your listing, browse others, and connect with fellow Terriers.</p>
        <div className="hero-actions">
          <button className="hero-cta-white" onClick={() => navigate("/submit")}>Submit a Listing</button>
          <button className="hero-cta-ghost" onClick={() => navigate("/browse")}>Browse Listings</button>
        </div>
        <div className="hero-pill"><span className="pill-dot"></span> BU students only - Login with @bu.edu to access the site</div>
        {firebaseConfigError ? <div className="msg msg-error" style={{ marginTop: 12 }}>{firebaseConfigError}</div> : null}
        {authError ? <div className="msg msg-error" style={{ marginTop: 12 }}>{authError}</div> : null}
      </div>

      <main>
        <Routes>
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="*" element={<Navigate to="/browse" replace />} />
        </Routes>
      </main>

      <footer>
        <div className="footer-disclaimer">
          Not affiliated with or endorsed by Boston University. This is an independent, community-made tool. Use at your own discretion. Listing info is submitted by students and has not been verified. Please exercise caution and common sense when connecting with others and arranging swaps.
        </div>
        <div className="footer-contact">
          Questions or issues? Email <a href="mailto:directswapconnections@gmail.com">directswapconnections@gmail.com</a>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
