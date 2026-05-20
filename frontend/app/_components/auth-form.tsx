"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { apiRequest } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { AuthResponse } from "@/types";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiRequest<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(response.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uwierzytelnianie nie powiodło się.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[2rem] card p-8">
      <p className="mb-2 text-sm uppercase tracking-[0.24em] text-muted">
        {mode === "login" ? "Logowanie" : "Nowe konto"}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        {mode === "login" ? "Zaloguj się do przestrzeni NGS" : "Utwórz nowe konto do analiz"}
      </h1>
      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Adres e-mail</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Hasło</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Wysyłanie..." : mode === "login" ? "Zaloguj" : "Zarejestruj"}
        </button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {mode === "login" ? "Nie masz jeszcze konta?" : "Masz już konto?"}{" "}
        <Link href={mode === "login" ? "/register" : "/login"} className="text-accent-strong">
          {mode === "login" ? "Załóż konto" : "Przejdź do logowania"}
        </Link>
      </p>
    </div>
  );
}
