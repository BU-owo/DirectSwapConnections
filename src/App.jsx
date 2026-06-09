/**
 * App Shell - Main Application Component
 * Renders top-level navigation, hero section, main content routes, and footer.
 * Manages mobile menu state, responsive behavior, and authentication UI.
 */
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { AppProvider, useAppContext } from "./context/AppContext";
import BrowsePage from "./pages/BrowsePage";
import HomePage from "./pages/HomePage";
import SubmitPage from "./pages/SubmitPage";

/**
 * Layout Component - Renders navigation, routes, and footer
 * Handles mobile menu toggle, responsive breakpoints, and authentication
 */
function Layout() {
  // Get authentication and listing data from context
  const { user, myListing, signInWithGoogle, signOutUser, firebaseConfigError } = useAppContext();

  // Local state for auth errors and mobile menu visibility
  const [authError, setAuthError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // React Router hooks for navigation and current location
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current page for conditional rendering
  const isHome = location.pathname === "/";
  const isSubmitPage = location.pathname === "/submit";
  const isBrowsePage = location.pathname === "/browse";

  // Close mobile menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when window resizes to desktop
  useEffect(() => {
    // Handle window resize to close menu on desktop
    function handleResize() {
      // Only close if resized to desktop size (> 980px)
      if (window.innerWidth > 980) {
        setMenuOpen(false);
      }
    }

    // Add resize listener
    window.addEventListener("resize", handleResize);
    // Clean up listener on component unmount
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    // Check if in mobile viewport
    const isMobile = window.innerWidth <= 980;
    // If menu is open on mobile, disable body scroll to prevent scrolling behind menu
    if (menuOpen && isMobile) {
      document.body.style.overflow = "hidden";
      // Restore overflow when menu closes or component unmounts
      return () => {
        document.body.style.overflow = "";
      };
    }

    // Ensure overflow is restored for desktop
    document.body.style.overflow = "";
    // Return no-op cleanup for desktop
    return () => {};
  }, [menuOpen]);

  /**
   * Handle Google sign-in button click
   */
  async function handleSignIn() {
    // Clear any previous auth errors
    setAuthError("");
    try {
      // Trigger Google sign-in
      await signInWithGoogle();
      // Close mobile menu after successful sign-in
      setMenuOpen(false);
    } catch (error) {
      // Show user-friendly error message
      setAuthError(error.message || "Sign in failed.");
    }
  }

  /**
   * Handle sign-out button click
   */
  async function handleSignOut() {
    // Clear any previous errors
    setAuthError("");
    // Sign user out via Firebase
    await signOutUser();
    // Close mobile menu
    setMenuOpen(false);
  }

  return (
    <>
      {/* ─── Navigation Bar ────────────────────────────────────────────────────── */}
      <nav className={menuOpen ? "menu-open" : ""}>
        {/* Brand logo - navigates to home */}
        <NavLink
          to="/"
          className="nav-brand"
          onClick={() => setMenuOpen(false)}
        >
          Terrier <span>Housing</span>
        </NavLink>

        {/* Hamburger menu toggle button for mobile */}
        <button
          type="button"
          className="nav-menu-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Navigation menu with links and auth section */}
        <div className="nav-menu">
          {/* Main navigation links */}
          <div className="nav-center">
            {/* Home link */}
            <NavLink
              to="/"
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`.trim()}
              end
            >
              Home
            </NavLink>

            {/* Submit listing link */}
            <NavLink
              to="/submit"
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`.trim()}
            >
              Submit Listing
            </NavLink>

            {/* Browse listings link */}
            <NavLink
              to="/browse"
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`.trim()}
            >
              Browse Listings
            </NavLink>
          </div>

          {/* Authentication section - shows different content based on login state */}
          <div className="nav-end">
            {user ? (
              // User is signed in - show profile and sign out
              <>
                {/* Desktop auth display */}
                <div id="state-in">
                  {/* User profile photo */}
                  <img className="nav-avatar" src={user.photoURL || ""} alt="" />
                  {/* User email address */}
                  <span className="nav-email-text">{user.email}</span>
                  {/* Sign out button */}
                  <button className="btn-nav-signout" onClick={handleSignOut}>Sign Out</button>
                </div>

                {/* Mobile auth display */}
                <div className="nav-mobile-auth-block">
                  {/* Profile section with photo and email */}
                  <div className="nav-mobile-profile">
                    <img className="nav-avatar" src={user.photoURL || ""} alt="" />
                    <div className="nav-mobile-profile-text">
                      <strong>Signed in</strong>
                      <span>{user.email}</span>
                    </div>
                  </div>

                  {/* Action button - shows "Update" if listing exists, "Submit" otherwise */}
                  <button
                    className="btn-nav-menu-action"
                    onClick={() => {
                      // Navigate to submit page and close menu
                      navigate("/submit");
                      setMenuOpen(false);
                    }}
                  >
                    {myListing ? "Update Listing" : "Submit Listing"}
                  </button>

                  {/* Sign out button for mobile */}
                  <button className="btn-nav-menu-signout" onClick={handleSignOut}>Sign Out</button>
                </div>
              </>
            ) : (
              // User is not signed in - show sign-in button
              <>
                {/* Desktop sign-in button */}
                <button className="btn-google-nav" onClick={handleSignIn}>Sign In with Google</button>

                {/* Mobile sign-in button */}
                <div className="nav-mobile-auth-block">
                  <button className="btn-google-nav" onClick={handleSignIn}>Sign In with Google</button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero Section (shown on all pages except home) ────────────────────── */}
      {!isHome && (
        <div className="hero">
          {/* Section heading */}
          <h1>BU Housing<br /><em>Direct Swaps</em></h1>
          {/* Description text */}
          <p>Find your perfect room swap. Submit your listing, browse others, and connect with fellow Terriers.</p>

          {/* Action buttons with dynamic styling based on current page */}
          <div className="hero-actions">
            {/* Submit listing button - highlighted if on submit page */}
            <button className={isSubmitPage ? "hero-cta-white" : "hero-cta-ghost"} onClick={() => navigate("/submit")}>Submit a Listing</button>
            {/* Browse listings button - highlighted if on browse page */}
            <button className={isBrowsePage ? "hero-cta-white" : "hero-cta-ghost"} onClick={() => navigate("/browse")}>Browse Listings</button>
          </div>

          {/* Info pill - explains BU-only access requirement */}
          <div className="hero-pill"><span className="pill-dot"></span> BU students only - Login with @bu.edu to access the site</div>

          {/* Firebase configuration error (if any) */}
          {firebaseConfigError ? <div className="msg msg-error" style={{ marginTop: 12 }}>{firebaseConfigError}</div> : null}

          {/* Authentication error display */}
          {authError ? <div className="msg msg-error" style={{ marginTop: 12 }}>{authError}</div> : null}
        </div>
      )}

      {/* Firebase config error on home page */}
      {isHome && firebaseConfigError ? <div className="msg msg-error" style={{ margin: "12px auto", maxWidth: 600 }}>{firebaseConfigError}</div> : null}

      {/* Auth error on home page */}
      {isHome && authError ? <div className="msg msg-error" style={{ margin: "12px auto", maxWidth: 600 }}>{authError}</div> : null}

      {/* ─── Main Content Area with Routes ──────────────────────────────────── */}
      <main className={isHome ? "main-home" : ""}>
        <Routes>
          {/* Home page route */}
          <Route path="/" element={<HomePage />} />

          {/* Browse listings page route */}
          <Route path="/browse" element={<BrowsePage />} />

          {/* Submit/edit listing page route */}
          <Route path="/submit" element={<SubmitPage />} />

          {/* Catch-all for undefined routes - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <footer>
        {/* Disclaimer about project independence */}
        <div className="footer-disclaimer">
          <strong>Disclaimer:</strong> Not affiliated with or endorsed by Boston University. This is an independent, community-made, partially vibe coded tool. Use at your own discretion. Listing info is submitted by students and has not been verified. Please exercise caution and common sense when connecting with others and arranging swaps.
        </div>

        {/* Contact information for bug reports and questions */}
        <div className="footer-contact">
          <strong>Questions or issues?</strong> Email <a href="mailto:directswapconnections@gmail.com">directswapconnections@gmail.com</a> about Terrier Housing
        </div>

        {/* Legacy name information */}
        <div className="footer-legacy-name">
          Terrier Housing was formerly known as Direct Swap Connections.
        </div>

        {/* Link to community Discord server for additional support */}
        <div className="footer-community">
          <strong>Need more help with housing?</strong> Join <a href="https://discord.gg/qFXzgSN58c" target="_blank" rel="noopener noreferrer">Terrier Hub Discord</a> for community support!
        </div>
      </footer>
    </>
  );
}

/**
 * Root App Component - Wraps Layout with AppProvider context
 */
export default function App() {
  return (
    // Provide Firebase auth and listing data to entire app via context
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
