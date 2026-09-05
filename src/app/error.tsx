"use client";

import { useEffect } from "react";

/**
 * Page-level error boundary. Catches client-side exceptions thrown inside a page
 * while keeping the site shell (header, footer, wallet) mounted, so one broken
 * route (e.g. a token page hitting an unreachable RPC) degrades to a recoverable
 * card instead of taking down the app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-display text-2xl font-bold text-zinc-900">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          This page hit an unexpected error. It&apos;s usually temporary - try
          again.
        </p>
        <button onClick={() => reset()} className="btn-brand mt-6 inline-flex">
          Try again
        </button>
      </div>
    </div>
  );
}
