"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#080A08",
          color: "#F2F0E8",
          fontFamily: "ui-monospace, monospace",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "40ch" }}>
          <p style={{ fontSize: 10, letterSpacing: "0.18em", color: "#E8785D", margin: 0 }}>FOLDMARK · FATAL</p>
          <h1 style={{ fontSize: 24, lineHeight: 1.1, margin: "1rem 0 0" }}>The application failed to render.</h1>
          {error.digest ? (
            <p style={{ fontSize: 11, color: "#5C6259", marginTop: "1rem" }}>DIGEST {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              height: 44,
              padding: "0 1.25rem",
              background: "transparent",
              color: "#F2F0E8",
              border: "1px solid rgba(242,240,232,0.16)",
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: "0.16em",
              cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </div>
      </body>
    </html>
  );
}
