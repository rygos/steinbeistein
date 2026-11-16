"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Anmeldung fehlgeschlagen.");
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="login-page"><form className="login-card" onSubmit={(event) => void login(event)}><div className="login-mark">S</div><span className="eyebrow">STEIN FÜR STEIN</span><h1>Willkommen zurück</h1><p>Bitte melde dich an, um deine Sammlung zu öffnen.</p><label htmlFor="password">Passwort</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /><button className="button primary" type="submit" disabled={busy}>{busy ? "Anmelden …" : "Anmelden"}</button>{error && <p role="alert" className="login-error">{error}</p>}</form></main>;
}
