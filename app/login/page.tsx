"use client";

import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

// The page's two modes, chosen by the user with a toggle (system flow)
type Mode = "login" | "signup";

// Signup/Login page: FR1 (sign up) and FR3 (log in)
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  // FR1, FR3: send the form to /api/signup or /api/login
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            id: form.get("id"),
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            phone: form.get("phone"),
            address: form.get("address"),
            // FR34: only an explicitly ticked box counts as consent
            emailOptIn: form.get("emailOptIn") === "on",
          };

    try {
      const res = await fetch(mode === "login" ? "/api/login" : "/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // FR5: both endpoints set the session cookie, so the user lands logged in
        router.replace("/home");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <p className="text-6xl font-extrabold tracking-tight text-leaf">foodie</p>
        <p className="mt-3 text-ink/70">Order from restaurants near you in Pereira.</p>

        {/* Log in / Sign up toggle */}
        <div className="mt-10 flex gap-6 border-b border-mist">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              className={`-mb-px border-b-2 pb-2 outline-none focus-visible:ring-4 focus-visible:ring-mango/50 ${
                mode === m ? "border-mango font-semibold text-ink" : "border-transparent text-ink/70"
              }`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* FR1: signup-only fields */}
          {mode === "signup" && (
            <>
              <Field label="National ID (cédula)" name="id" required maxLength={20} />
              <Field label="Full name" name="name" required maxLength={120} autoComplete="name" />
            </>
          )}

          {/* FR1, FR3: fields used by both modes */}
          <Field label="Email" name="email" type="email" required maxLength={120} autoComplete="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            hint={mode === "signup" ? "At least 8 characters" : undefined}
          />

          {/* FR1, FR34: more signup-only fields, including the email opt-in (unticked by default) */}
          {mode === "signup" && (
            <>
              <Field label="Phone" name="phone" type="tel" required placeholder="+57 300 123 4567" autoComplete="tel" />
              <Field label="Delivery address" name="address" required maxLength={255} autoComplete="street-address" />
              <label className="flex items-start gap-3 pt-1">
                <input type="checkbox" name="emailOptIn" className="mt-1 size-4 accent-leaf" />
                <span className="text-ink">Email me updates about my orders</span>
              </label>
            </>
          )}

          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}

          {/* FR1, FR3: submits to the endpoint for the current mode */}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-leaf px-4 py-3 font-semibold text-white outline-none hover:bg-leaf/90 focus-visible:ring-4 focus-visible:ring-mango/50 disabled:opacity-60"
          >
            {mode === "login"
              ? busy ? "Logging in…" : "Log in"
              : busy ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}

// A labeled text input, used by every field of the form
function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink outline-none focus-visible:border-leaf focus-visible:ring-4 focus-visible:ring-mango/50"
      />
      {hint && <span className="mt-1 block text-sm text-ink/70">{hint}</span>}
    </label>
  );
}