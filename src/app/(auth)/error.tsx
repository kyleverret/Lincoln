"use client";

import { useEffect } from "react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Auth] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">
          Unable to load login page
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-gray-400">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
