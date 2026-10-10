"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import BudgetDashboard, { type SavedData, validCycle } from "./budget-dashboard";

let client: SupabaseClient | undefined;
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase connection settings are missing.");
  client ??= createClient(url, key);
  return client;
}
function validate(data: SavedData): boolean {
  try {
    return data.version === 2 && validCycle(data.current) && Array.isArray(data.archives) && data.archives.every(validCycle);
  } catch { return false; }
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    try {
      const { data } = supabase().auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
        setReady(true);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        if (!session) setRecovery(false);
      });
      return () => data.subscription.unsubscribe();
    } catch (cause) {
      // Configuration errors must be visible instead of leaving an endless spinner.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(cause instanceof Error ? cause.message : "Unable to connect.");
    }
  }, []);
  async function logout() {
    setError("");
    try {
      const { error } = await supabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      setUser(null);
    } catch { setError("Could not log out. Please try again."); }
  }
  return <>
    {error && <p role="alert" className="bg-red-50 p-4 text-red-800">{error}</p>}
    {!ready ? <p className="p-8">Connecting to your account…</p> : recovery ? <AuthForm recovery onRecovered={() => setRecovery(false)} /> : !user ? <AuthForm /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3 text-sm"><span className="break-all">Signed in as {user.email}</span><button className="secondary" onClick={logout}>Log out</button></div>
      <AccountBudget key={user.id} user={user} />
    </>}
  </>;
}

function AuthForm({ recovery = false, onRecovered }: { recovery?: boolean; onRecovered?: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  function switchMode(next: "login" | "signup" | "reset") { setMode(next); setError(""); setMessage(""); setShowPassword(false); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    setBusy(true); setError(""); setMessage("");
    try {
      if (recovery) {
        const result = await supabase().auth.updateUser({ password });
        if (result.error) throw result.error;
        onRecovered?.();
      } else if (mode === "reset") {
        const result = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
        if (result.error) throw result.error;
        setMessage("If an account exists for this address, you’ll receive a password reset link.");
      } else if (mode === "signup") {
        const result = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } });
        if (result.error) throw result.error;
        setMessage("Check your email to confirm your account, then return here to log in.");
        form.reset();
      } else {
        const result = await supabase().auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete this request. Please try again.");
    } finally { setBusy(false); }
  }
  const title = recovery ? "Choose a new password" : mode === "signup" ? "A fresh start for your money." : mode === "reset" ? "Let’s get you back in." : "Welcome back";
  return <main className="min-h-screen bg-[#fcfaf4] px-5 py-7 sm:px-10 sm:py-10">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="inline-flex items-center gap-3 text-2xl font-semibold tracking-tight text-emerald-950"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950 text-white">₹</span><span className="font-serif">Rupee Trace</span></Link>
      <div className="mt-9 grid items-center gap-8 lg:mt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <section>
          <p className="eyebrow">EVERY RUPEE HAS A PURPOSE</p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-tight text-emerald-950 sm:text-5xl lg:text-6xl">A little clarity.<br />A lot more control.</h1>
          <div className="hidden lg:block"><BudgetIllustration /></div>
        </section>
        <section aria-label="Your account" className="w-full max-w-lg lg:justify-self-end">
          <div className="rounded-3xl border border-[#d6dbcf] bg-white p-6 shadow-[0_12px_45px_-30px_rgba(20,60,40,0.25)] sm:p-10">
            <h2 className="font-serif text-3xl leading-tight text-emerald-950 sm:text-4xl">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-500">{recovery ? "Choose a password to continue to your account." : mode === "signup" ? "Create an account and give every rupee a purpose." : mode === "reset" ? "We’ll email you a link to reset your password." : "Your money, with intention."}</p>
            <form onSubmit={submit} className="mt-7"><fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
              {!recovery && <label htmlFor="auth-email">Email<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>}
              {(recovery || mode !== "reset") && <div><label htmlFor="auth-password">{recovery ? "New password" : "Password"}</label><div className="relative"><input id="auth-password" className="pr-20" name="password" type={showPassword ? "text" : "password"} minLength={mode === "login" && !recovery ? 1 : 8} autoComplete={mode === "login" && !recovery ? "current-password" : "new-password"} required /><button type="button" className="absolute inset-y-0 right-0 px-4 text-sm text-emerald-900" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button></div>{(recovery || mode === "signup") && <p className="mt-2 text-xs text-stone-500">At least 8 characters.</p>}</div>}
              {!recovery && mode === "login" && <div className="text-right"><button type="button" className="text-sm text-emerald-800 underline underline-offset-4" onClick={() => switchMode("reset")}>Forgot password?</button></div>}
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
              <button className="primary w-full" type="submit">{busy ? "Please wait…" : recovery ? "Save new password" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
              {!recovery && <p className="pt-2 text-center text-sm text-stone-600">{mode === "login" ? <>New here? <button type="button" className="font-medium text-emerald-800 underline underline-offset-4" onClick={() => switchMode("signup")}>Create an account</button></> : <>{mode === "signup" ? "Already have an account? " : "Remember your password? "}<button type="button" className="font-medium text-emerald-800 underline underline-offset-4" onClick={() => switchMode("login")}>Log in</button></>}</p>}
            </fieldset></form>
          </div>
          <p className="mt-5 text-center text-xs leading-relaxed text-stone-500">Your budgets and expenses, saved to your account.</p>
        </section>
      </div>
      <div className="mx-auto mt-8 max-w-md lg:hidden"><BudgetIllustration /></div>
    </div>
  </main>;

}

function AccountBudget({ user }: { user: User }) {
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<SavedData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const revision = useRef<number | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await supabase().from("user_budgets").select("data, revision").eq("user_id", user.id).maybeSingle();
        if (result.error) throw result.error;
        if (!active) return;
        if (result.data && !validate(result.data.data)) throw new Error("Your saved budget could not be read. It has not been overwritten.");
        revision.current = result.data?.revision ?? null;
        setInitial(result.data?.data ?? null);
        setError(""); setLoaded(true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your budget. Check your connection and make sure database setup is complete.");
      }
    }
    void load();
    return () => { active = false; };
  }, [user.id, retry]);

  async function persist(data: SavedData) {
    if (lock.current) throw new Error("A save is already in progress.");
    if (!validate(data)) throw new Error("This budget is invalid and was not saved.");
    lock.current = true;
    try {
      const account = await supabase().auth.getUser();
      if (account.error || account.data.user?.id !== user.id) throw new Error("Your login changed or expired. Please log in again before saving.");
      // Compare revisions so two devices cannot silently overwrite one another.
      const nextRevision = (revision.current ?? 0) + 1;
      const table = supabase().from("user_budgets");
      const result = revision.current === null
        ? await table.insert({ user_id: user.id, data, revision: nextRevision }).select("revision").single()
        : await table.update({ data, revision: nextRevision }).eq("user_id", user.id).eq("revision", revision.current).select("revision").maybeSingle();
      if (result.error) {
        if (result.error.code === "23505") throw new Error("This account already has a newer budget. Refresh before making changes.");
        throw new Error("Could not save to your account. Check your connection and try again.");
      }
      if (!result.data) throw new Error("Your budget changed in another tab or device. Refresh to load it, then repeat your change.");
      revision.current = result.data.revision;
    } finally { lock.current = false; }
  }

  if (!loaded) return <main className="mx-auto max-w-xl p-8">{error ? <><p role="alert" className="mb-4 text-red-700">{error}</p><button className="secondary" onClick={() => { setError(""); setRetry(n => n + 1); }}>Retry loading</button></> : <p>Loading your budget…</p>}</main>;
  return <>
    {error && <p role="alert" className="mx-auto max-w-6xl p-5 text-red-700">{error}</p>}
    <BudgetDashboard initial={initial} persist={persist} />
  </>;
}

// A lightweight, scalable illustration; the figures are examples, not account data.
function BudgetIllustration() {
  return <figure className="relative mx-auto mt-6 max-w-xl py-6" aria-label="Example budget: 5,000 rupees allocated, 600 spent, 4,400 remaining">
    <svg aria-hidden="true" viewBox="0 0 540 350" className="w-full" fill="none">
      <g stroke="#7c806a" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M45 93L187 70L213 285L65 307Z" fill="#f1f0e2"/><path d="M355 72L495 105L464 307L334 281Z" fill="#f1f0e2"/>
        <path d="M154 42Q265 34 368 45L376 306Q265 314 159 307Z" fill="#fffdf5"/>
        <path d="M158 45L365 42L372 302L161 305Z" strokeOpacity=".3"/>
        <path d="M77 146L104 123L131 146M85 143V175H123V143M99 175V155H110V175"/>
        <path d="M404 145L442 121L449 128L423 151L438 166L432 173L411 161L397 169L391 163L404 145Z"/>
        <path d="M84 206L134 199M88 229L137 222M392 212L446 223M389 237L441 248" strokeWidth="5" strokeLinecap="round" strokeOpacity=".35"/>
      </g>
      <g fill="#173e2d" textAnchor="middle" fontFamily="Georgia, serif"><text x="265" y="90" fontSize="23">Dining budget</text><text x="265" y="141" fontSize="23">₹5,000 allocated</text><text x="265" y="208" fontSize="21">₹600 spent</text><text x="265" y="277" fontSize="24" fontWeight="bold">₹4,400 remaining</text></g>
      <path d="M191 164H338" stroke="#dce3ca" strokeWidth="9" strokeLinecap="round"/><path d="M191 164H254" stroke="#75916b" strokeWidth="9" strokeLinecap="round"/>
      <path d="M191 231H338" stroke="#e4dfcd" strokeWidth="7" strokeLinecap="round"/><path d="M191 231H211" stroke="#75916b" strokeWidth="7" strokeLinecap="round"/>
      <g stroke="#bd880f" strokeWidth="2.5" strokeLinecap="round"><path d="M27 92C40 34 93 23 130 53M111 52L132 56L125 35"/><path d="M481 274C529 255 529 214 495 191M500 211L492 189L515 192"/><path d="M388 43L399 23M405 55L425 40"/></g>
      <g stroke="#45634c" strokeWidth="2" fill="#dce5d2"><path d="M48 312Q27 276 20 236Q53 253 48 286Q16 282 10 266Q46 270 48 312Z"/><path d="M475 320Q494 298 508 281Q510 308 487 311"/></g>
    </svg>
    <figcaption className="text-center font-serif text-sm italic text-stone-500">A small plan. A clearer picture. · Example budget</figcaption>
  </figure>;
}
