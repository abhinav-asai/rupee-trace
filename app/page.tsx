"use client";

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
  const title = recovery ? "Choose a new password" : mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome to Rupee Trace";
  return <main className="mx-auto max-w-md px-5 py-16"><p className="eyebrow">EVERY RUPEE HAS A PURPOSE.</p><h1 className="mt-4 text-3xl font-semibold">{title}</h1><p className="mt-3 text-sm text-stone-500">Your budgets, expenses, and history—in your account.</p>
    <form onSubmit={submit} className="panel mt-7 p-6"><fieldset disabled={busy} className="space-y-5">
      {!recovery && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}
      {(recovery || mode !== "reset") && <label>{recovery ? "New password" : "Password"}<input name="password" type="password" minLength={mode === "login" && !recovery ? 1 : 8} autoComplete={mode === "login" && !recovery ? "current-password" : "new-password"} required />{(recovery || mode === "signup") && <span className="mt-2 block text-xs text-stone-500">At least 8 characters.</span>}</label>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      <button className="primary w-full" type="submit">{busy ? "Please wait…" : recovery ? "Save new password" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
    </fieldset></form>
    {!recovery && <div className="mt-5 flex flex-wrap gap-3">{mode !== "login" && <button className="secondary" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Back to login</button>}{mode === "login" && <><button className="secondary" onClick={() => { setMode("signup"); setError(""); }}>Create account</button><button className="secondary" onClick={() => { setMode("reset"); setError(""); }}>Forgot password?</button></>}</div>}
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
