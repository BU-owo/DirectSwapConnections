import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

export default function HomePage() {
  const { user, myListing, signInWithGoogle } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const ctaClass = (path) => (location.pathname === path ? "hero-cta-white" : "hero-cta-ghost");

  return (
    <div className="home-page">

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-hero-eyebrow">
            <span className="pill-dot"></span> BU Students Only
          </div>
          <h1 className="home-hero-title">
            Terrier<br /><em>Housing</em>
          </h1>
          <p className="home-hero-formerly">Formerly Direct Swap Connections</p>
          <p className="home-hero-sub">
            The student-run platform for BU housing swaps. Find someone who wants
            your room and take theirs.
          </p>
          <div className="home-hero-actions">
            <button className={ctaClass("/submit")} onClick={() => navigate("/submit")}>
              {myListing ? "Edit My Listing" : "Submit a Listing"}
            </button>
            <button className={ctaClass("/browse")} onClick={() => navigate("/browse")}>
              Browse Listings
            </button>
          </div>
          {!user && (
            <p className="home-hero-signin">
              <button className="home-signin-link" onClick={signInWithGoogle}>
                Sign in with your @bu.edu Google account
              </button>{" "}
              to submit or browse contact info.
            </p>
          )}
        </div>
      </section>

      {/* ── What is a Direct Swap? ──────────────────────────── */}
      <section className="home-section">
        <div className="home-section-inner">
          <h2 className="home-section-title">What is a Direct Swap?</h2>
          <p className="home-section-lead">
            A <strong>Direct Swap</strong> is when two BU residents trade rooms with each other directly —
            with no lottery or middleman. BU allows this through the official
            housing portal during a specific window each semester. This site helps you
            find the other person.
          </p>

          <div className="home-cards">
            <div className="home-card" onClick={() => navigate("/browse")} style={{ cursor: "pointer" }}>
              <div className="home-card-icon">🔍</div>
              <h3>Browse</h3>
              <p>See what rooms other students are offering and what they're looking for.</p>
            </div>
            <div className="home-card" onClick={() => navigate("/submit")} style={{ cursor: "pointer" }}>
              <div className="home-card-icon">📋</div>
              <h3>Submit</h3>
              <p>Post your current room and describe what you'd like in return.</p>
            </div>
            <div className="home-card">
              <div className="home-card-icon">🤝</div>
              <h3>Connect</h3>
              <p>Reach out directly via email, phone, or social media. Coordinate together and both agree to the swap in the BU portal.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Key Dates ──────────────────────────────────────── */}
      <section className="home-section home-section-alt">
        <div className="home-section-inner">
          <h2 className="home-section-title">2026–2027 Direct Swap Window</h2>
          <p className="home-section-lead">
            BU opens a window each semester for direct swaps. Both parties must agree
            and submit through the official BU housing portal before the deadline.
            Watch your <strong>@bu.edu email</strong> for official dates.
          </p>

          <div className="home-dates">
            <div className="home-date-card">
              <div className="home-date-label">Portal Opens</div>
              <div className="home-date-value">Check BU Housing Email</div>
            </div>
            <div className="home-date-arrow">→</div>
            <div className="home-date-card">
              <div className="home-date-label">Deadline</div>
              <div className="home-date-value">Check BU Housing Email</div>
            </div>
          </div>

          <p className="home-dates-note">
            💡 Tip: Start connecting with matches now so you're ready when the window opens.
            Both students must agree <em>before</em> submitting in the BU portal.
          </p>
        </div>
      </section>

      {/* ── Disclaimer / Credits ───────────────────────────── */}
      <section className="home-section">
        <div className="home-section-inner home-bottom-grid">
          <div className="home-disclaimer-card">
            <h3 className="home-sub-title">⚠️ Disclaimer</h3>
            <p>
              This site is <strong>not affiliated with or endorsed by Boston University.</strong>{" "}
              It is an independent, community-made tool built to help BU students find each other.
              All listing information is self-reported and unverified. Please use common sense
              when connecting with others.
            </p>
            <p style={{ marginTop: 10 }}>
              Terrier Housing reserves the right to remove any listing at any time.
              No financial exchanges for swaps — this is a violation of BU policy and will
              result in a ban from this site.
            </p>
          </div>

          <div className="home-contact-card">
            <h3 className="home-sub-title">💬 Contact & Help</h3>
            <p>Have a question, found a bug, or need a listing removed?</p>
            <a className="home-contact-link" href="mailto:directswapconnections@gmail.com">
              directswapconnections@gmail.com
            </a>
            <p style={{ marginTop: 16 }}>Need broader housing advice? Join the BU student community:</p>
            <a
              className="home-contact-link home-discord-link"
              href="https://discord.gg/qFXzgSN58c"
              target="_blank"
              rel="noopener noreferrer"
            >
              🎮 Terrier Hub Discord
            </a>
            <p className="home-credits">
              Built by BU students, for BU students.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────── */}
      <section className="home-bottom-cta">
        <h2>Ready to find your swap?</h2>
        <div className="home-hero-actions">
          <button className={ctaClass("/submit")} onClick={() => navigate("/submit")}>
            {myListing ? "Edit My Listing" : "Submit a Listing"}
          </button>
          <button className={ctaClass("/browse")} onClick={() => navigate("/browse")}>
            Browse Listings
          </button>
        </div>
      </section>

    </div>
  );
}
