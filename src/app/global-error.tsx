"use client";

import { useEffect } from "react";

/**
 * Root error boundary. Catches client-side exceptions thrown anywhere in the
 * tree — including the wallet providers in the root layout — so a single failing
 * component can never blank the whole site with Next's bare white "Application
 * error: a client-side exception has occurred" screen. It replaces the layout
 * entirely, so it must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real cause in the console for debugging.
    console.error(error);
  }, [error]);

  // TEMPORARY DIAGNOSTIC: show the real error on screen so we can capture the
  // exact cause on real mobile Safari (which our headless tests can't reproduce).
  const detail = `${error?.name ?? "Error"}: ${error?.message ?? "(no message)"}`;
  const stack = (error?.stack ?? "").split("\n").slice(0, 6).join("\n");

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff7ee",
          color: "#18181b",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: "1.25rem",
            padding: "2rem",
            boxShadow: "0 20px 60px rgba(224,83,42,0.12)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "#52525b" }}>
            The app hit an unexpected error. This is usually temporary — try
            reloading.
          </p>
          <pre
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "rgba(0,0,0,0.05)",
              borderRadius: "0.75rem",
              fontSize: "0.7rem",
              lineHeight: 1.4,
              color: "#b83f16",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowX: "auto",
            }}
          >
            {detail}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
            {stack ? `\n\n${stack}` : ""}
          </pre>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              padding: "0.7rem 1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#e0532a",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
