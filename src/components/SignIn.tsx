"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Email magic link or Google. Supabase sends the person back to /auth/callback. */
export default function SignIn({ next = "/" }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  return (
    <div className="signin">
      <button
        type="button"
        className="btn-paper wide-btn"
        onClick={() => supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } })}
      >
        CONTINUE WITH GOOGLE
      </button>
      <div className="or">or get a sign-in link by email</div>
      <form
        className="signin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("sending");
          const { error } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
          if (error) {
            setError(error.message);
            setState("error");
          } else setState("sent");
        }}
      >
        <label htmlFor="signin-email" className="sr">Email address</label>
        <input id="signin-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn-gold" disabled={state === "sending"}>
          {state === "sending" ? "SENDING…" : "SEND LINK"}
        </button>
      </form>
      {state === "sent" && <p className="note">Check {email} for a sign-in link. Open it on this device.</p>}
      {state === "error" && <p className="note err">{error}</p>}
    </div>
  );
}
