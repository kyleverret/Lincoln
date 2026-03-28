"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global] Unhandled error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            backgroundColor: "#f9fafb",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#111827",
                margin: 0,
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                marginTop: "4px",
                fontSize: "14px",
                color: "#6b7280",
              }}
            >
              A critical error occurred. Please try again.
            </p>
            {error.digest && (
              <p
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#9ca3af",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={reset}
            style={{
              borderRadius: "6px",
              backgroundColor: "#2563eb",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
