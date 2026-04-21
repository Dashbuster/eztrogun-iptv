"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Falha ao entrar.");
        }

        router.push("/admin");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Falha inesperada."
        );
      }
    });
  };

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <p className="eyebrow">Admin Access</p>
        <h1>Painel da EZTROGUN</h1>
        <p className="hero-copy">
          Entre para ajustar prompt, modelo, memoria e documentos da base de
          conhecimento.
        </p>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label htmlFor="password">Senha do administrador</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite a senha definida em ADMIN_PASSWORD"
          />
          <button type="submit" disabled={isPending}>
            {isPending ? "Entrando..." : "Entrar"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
