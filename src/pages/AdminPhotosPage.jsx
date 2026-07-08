/**
 * Admin Photos Page
 * View all housing photo submissions grouped by campus group / address / layout.
 * Reachable only by typing the URL directly — no nav link anywhere in the app.
 */
import React, { useEffect, useRef, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAppContext } from "../context/AppContext";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  return 0;
}

function formatDate(ts) {
  const ms = toMs(ts);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Photo Lightbox ──────────────────────────────────────────────────────────

function PhotoLightbox({ photos, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const overlayRef = useRef(null);

  // Keyboard navigation: arrow keys and Escape.
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  const photo = photos[index];

  return (
    <div
      ref={overlayRef}
      className="expand-modal-overlay"
      onClick={(event) => event.target === overlayRef.current && onClose()}
    >
      <div
        className="expand-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Photo viewer"
        style={{ maxWidth: 820, background: "#111", padding: "1rem" }}
      >
        <button className="modal-close" onClick={onClose} style={{ color: "#fff" }}>✕</button>

        <img
          src={photo.url}
          alt={photo.filename}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "70vh",
            margin: "0 auto",
            borderRadius: 6,
            objectFit: "contain",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.75rem", gap: "0.5rem" }}>
          <button
            className="btn-ghost-xs"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            style={{ minWidth: 72 }}
          >
            ← Prev
          </button>
          <span style={{ color: "#aaa", fontSize: "0.82rem", textAlign: "center", flex: 1 }}>
            {index + 1} / {photos.length} — {photo.filename}
          </span>
          <button
            className="btn-ghost-xs"
            disabled={index === photos.length - 1}
            onClick={() => setIndex((i) => i + 1)}
            style={{ minWidth: 72 }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Submission Card ─────────────────────────────────────────────────────────

function SubmissionCard({ submission, onThumbClick }) {
  return (
    <div
      style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "1rem",
        marginBottom: "0.75rem",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginBottom: "0.6rem" }}>
        <span className="badge badge-grey" style={{ fontWeight: 700 }}>{submission.address}</span>
        <span className="badge badge-blue">{submission.layout}</span>
        {(submission.photoTypes || []).map((type) => (
          <span key={type} className="badge badge-type">{type}</span>
        ))}
        {submission.submittedAt && (
          <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: "var(--sub)" }}>
            {formatDate(submission.submittedAt)}
          </span>
        )}
      </div>

      {/* Photo grid */}
      {submission.photos?.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: "0.5rem",
          }}
        >
          {submission.photos.map((photo, photoIndex) => (
            <button
              key={photoIndex}
              onClick={() => onThumbClick(submission.photos, photoIndex)}
              style={{
                border: "none",
                padding: 0,
                background: "none",
                cursor: "pointer",
                borderRadius: 6,
                overflow: "hidden",
              }}
              aria-label={`View ${photo.filename}`}
            >
              <img
                src={photo.url}
                alt={photo.filename}
                loading="lazy"
                style={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "4 / 3",
                  objectFit: "cover",
                  borderRadius: 6,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="fhint">No photos attached.</p>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminPhotosPage() {
  const { user, authReady, signInWithGoogle } = useAppContext();

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [authError, setAuthError] = useState("");
  const [lightbox, setLightbox] = useState(null); // { photos, index }

  const isBuUser = Boolean(user?.email?.endsWith("@bu.edu"));

  // Fetch all housingSubmissions once the user is confirmed as a BU account.
  useEffect(() => {
    if (!isBuUser || !db) return;

    let cancelled = false;
    setLoading(true);
    setFetchError("");

    async function fetch() {
      try {
        const q = query(collection(db, "housingSubmissions"), orderBy("submittedAt", "desc"));
        const snapshot = await getDocs(q);
        if (cancelled) return;
        setSubmissions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (!cancelled) setFetchError(err.message || "Failed to load submissions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [isBuUser]);

  async function handleSignIn() {
    setAuthError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err.message || "Sign in failed.");
    }
  }

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div className="panel">
        <p className="td-loading">Loading…</p>
      </div>
    );
  }

  // ── Sign-in gate ──────────────────────────────────────────────────────────
  if (!isBuUser) {
    return (
      <div className="panel">
        <div className="gate-wrap">
          <div className="gate-card">
            <div className="gate-icon">🔒</div>
            <h2 className="gate-title">Admin Access</h2>
            <p className="gate-desc">Sign in with your BU Google account to view housing photo submissions.</p>
            <button className="btn-google-lg" onClick={handleSignIn}>
              Sign in with Google
            </button>
            {authError ? (
              <div className="msg msg-error" style={{ marginTop: "1rem" }}>{authError}</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Group submissions by campusGroup ──────────────────────────────────────
  const grouped = submissions.reduce((acc, sub) => {
    const group = sub.campusGroup || "Unknown";
    if (!acc[group]) acc[group] = [];
    acc[group].push(sub);
    return acc;
  }, {});
  const sortedGroups = Object.keys(grouped).sort();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div id="panel-admin-photos" className="panel">
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="panel-top">
        <div>
          <h2 className="panel-title">Housing Photo Submissions</h2>
          <p className="result-count">
            {loading
              ? "Loading…"
              : `${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {fetchError ? (
        <div className="msg msg-error" style={{ marginBottom: "1.5rem" }}>{fetchError}</div>
      ) : null}

      {loading ? (
        <p className="td-loading">Loading submissions…</p>
      ) : submissions.length === 0 && !fetchError ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--sub)" }}>
          No photo submissions yet.
        </div>
      ) : (
        sortedGroups.map((group) => (
          <section key={group} className="fsec" style={{ marginTop: "1.5rem" }}>
            <h3 className="fsec-title">{group}</h3>
            {grouped[group].map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                onThumbClick={(photos, index) => setLightbox({ photos, index })}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
