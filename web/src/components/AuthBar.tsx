"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function AuthBar() {
  const { status, data } = useSession();

  return (
    <div className="flex items-center gap-2">
      {status === "authenticated" ? (
        <>
          <div className="text-xs text-zinc-300">
            Signed in as <span className="font-medium text-zinc-100">{data.user?.email}</span>
          </div>
          <button
            type="button"
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100"
          onClick={() => signIn("google")}
        >
          Sign in with Google
        </button>
      )}
    </div>
  );
}

