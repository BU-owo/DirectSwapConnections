/**
 * App Shell
 * Renders top-level navigation, hero, footer, and route mapping for browse/submit pages.
 */
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { AppProvider, useAppContext } from "./context/AppContext";
import BrowsePage from "./pages/BrowsePage";
import HomePage from "./pages/HomePage";
import SubmitPage from "./pages/SubmitPage";

function Layout() {
  const { user, myListing, signInWithGoogle, signOutUser, firebaseConfigError } = useAppContext();
  const [authError, setAuthError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isSubmitPage = location.pathname === "/submit";
  const isBrowsePage = location.pathname === "/browse";

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > 980) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const isMobile = window.innerWidth <= 980;
    if (menuOpen && isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }

    document.body.style.overflow = "";
    return () => {};
  }, [menuOpen]);

  async function handleSignIn() {
    setAuthError("");
    try {
      await signInWithGoogle();
      setMenuOpen(false);
    } catch (error) {
      setAuthError(error.message || "Sign in failed.");
    }
  }

  async function handleSignOut() {
    setAuthError("");
    await signOutUser();
    setMenuOpen(false);
  }

  return (
    <>
      <nav className={menuOpen ? "menu-open" : ""}>
        <NavLink
          to="/"
          className="nav-brand"
          onClick={() => setMenuOpen(false)}
        >
          Terrier <span>Housing</span>
        </NavLink>
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
        <div className="nav-menu">
          <div className="nav-center">
            <NavLink
              to="/"
              className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`.trim()}
              end
            >
              Home
            </NavLink>
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
              <>
                <div id="state-in">
                  <img className="nav-avatar" src={user.photoURL || ""} alt="" />
                  <span className="nav-email-text">{user.email}</span>
                  <button className="btn-nav-signout" onClick={handleSignOut}>Sign Out</button>
                </div>
                <div className="nav-mobile-auth-block">
                  <div className="nav-mobile-profile">
                    <img className="nav-avatar" src={user.photoURL || ""} alt="" />
                    <div className="nav-mobile-profile-text">
                      <strong>Signed in</strong>
                      <span>{user.email}</span>
                    </div>
                  </div>
                  <button
                    className="btn-nav-menu-action"
                    onClick={() => {
                      navigate("/submit");
                      setMenuOpen(false);
                    }}
                  >
                    {myListing ? "Update Listing" : "Submit Listing"}
                  </button>
                  <button className="btn-nav-menu-signout" onClick={handleSignOut}>Sign Out</button>
                </div>
              </>
            ) : (
              <>
                <button className="btn-google-nav" onClick={handleSignIn}>Sign In with Google</button>
                <div className="nav-mobile-auth-block">
                  <button className="btn-google-nav" onClick={handleSignIn}>Sign In with Google</button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {!isHome && (
        <div className="hero">
          <h1>BU Housing<br /><em>Direct Swaps</em></h1>
          <p>Find your perfect room swap. Submit your listing, browse others, and connect with fellow Terriers.</p>
          <div className="hero-actions">
            <button className={isSubmitPage ? "hero-cta-white" : "hero-cta-ghost"} onClick={() => navigate("/submit")}>Submit a Listing</button>
            <button className={isBrowsePage ? "hero-cta-white" : "hero-cta-ghost"} onClick={() => navigate("/browse")}>Browse Listings</button>
          </div>
          <div className="hero-pill"><span className="pill-dot"></span> BU students only - Login with @bu.edu to access the site</div>
          {firebaseConfigError ? <div className="msg msg-error" style={{ marginTop: 12 }}>{firebaseConfigError}</div> : null}
          {authError ? <div className="msg msg-error" style={{ marginTop: 12 }}>{authError}</div> : null}
        </div>
      )}
      {isHome && firebaseConfigError ? <div className="msg msg-error" style={{ margin: "12px auto", maxWidth: 600 }}>{firebaseConfigError}</div> : null}
      {isHome && authError ? <div className="msg msg-error" style={{ margin: "12px auto", maxWidth: 600 }}>{authError}</div> : null}

      <main className={isHome ? "main-home" : ""}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer>
        <div className="footer-disclaimer">
          <strong>Disclaimer:</strong> Not affiliated with or endorsed by Boston University. This is an independent, community-made tool. Use at your own discretion. Listing info is submitted by students and has not been verified. Please exercise caution and common sense when connecting with others and arranging swaps.
        </div>
        <div className="footer-contact">
          <strong>Questions or issues?</strong> Email <a href="mailto:directswapconnections@gmail.com">directswapconnections@gmail.com</a> about Terrier Housing
        </div>
        <div className="footer-legacy-name">
          Terrier Housing was formerly known as Direct Swap Connections.
        </div>
        <div className="footer-community">
          <strong>Need more help with housing?</strong> Join <a href="https://discord.gg/qFXzgSN58c" target="_blank" rel="noopener noreferrer">Terrier Hub Discord</a> for community support!
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
