"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";

import type { ChatMessage } from "@/lib/types";

const SUGGESTIONS = [
  "Monte um plano de negocios para uma loja online.",
  "Explique uma ideia complexa de forma simples.",
  "Crie uma estrategia de marketing para uma empresa local.",
  "Revise um texto e deixe mais profissional."
];

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function getSessionId() {
  const existing = window.localStorage.getItem("eztrogun-session-id");

  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem("eztrogun-session-id", next);
  return next;
}

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isPending, startTransition] = useTransition();
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextSessionId = getSessionId();
    sessionIdRef.current = nextSessionId;

    void (async () => {
      try {
        const response = await fetch(`/api/chat/session?sessionId=${nextSessionId}`);
        const payload = (await response.json()) as {
          messages: ChatMessage[];
          welcomeMessage: string;
        };

        if (payload.messages.length) {
          setMessages(payload.messages);
        } else {
          setMessages([createMessage("assistant", payload.welcomeMessage)]);
        }
      } catch {
        setMessages([
          createMessage(
            "assistant",
            "Eu sou a EZTROGUN. Posso operar como IA geral para conversas, ideias, analises e apoio a tarefas."
          )
        ]);
      } finally {
        setIsBooting(false);
      }
    })();
  }, []);

  const sendMessage = (content: string) => {
    const trimmed = content.trim();
    const sessionId = sessionIdRef.current;

    if (!trimmed || isPending || !sessionId) {
      return;
    }

    const nextMessages = [...messages, createMessage("user", trimmed)];
    setMessages(nextMessages);
    setInput("");
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionId,
            messages: nextMessages
          })
        });

        const payload = (await response.json()) as
          | { answer: string }
          | { error: string };

        if (!response.ok || !("answer" in payload)) {
          throw new Error(
            "error" in payload ? payload.error : "Falha ao consultar a EZTROGUN."
          );
        }

        setMessages((current) => [
          ...current,
          createMessage("assistant", payload.answer)
        ]);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Falha inesperada ao consultar a EZTROGUN.";

        setError(message);
      }
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(input);
  };

  return (
    <main className="shell">
      <section className="hero-card">
        <p className="eyebrow">EZTROGUN</p>
        <h1>IA web pronta para crescer com o seu negocio.</h1>
        <p className="hero-copy">
          Esta primeira versao entrega chat, backend desacoplado, configuracao por
          ambiente e uma base limpa para memoria, ferramentas e painel admin.
        </p>
        <div className="hero-grid">
          <article>
            <span>01</span>
            <h2>Arquitetura</h2>
            <p>Camadas separadas para UI, configuracao e integracao com modelo.</p>
          </article>
          <article>
            <span>02</span>
            <h2>Escalabilidade</h2>
            <p>Pronta para adicionar auth, billing, RAG, analytics e automacoes.</p>
          </article>
          <article>
            <span>03</span>
            <h2>Controle</h2>
            <p>Prompt, modelo e chave ficam fora do codigo, via ambiente.</p>
          </article>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Launch Pad</p>
              <h2>Use Cases</h2>
            </div>
          </div>

          <div className="suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="suggestion"
                type="button"
                onClick={() => sendMessage(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-card">
          <div className="chat-header">
            <div>
              <p className="eyebrow">General Intelligence Interface</p>
              <h2>Converse com a EZTROGUN</h2>
            </div>
            <span className="status">
              {isBooting ? "Carregando..." : isPending ? "Pensando..." : "Online"}
            </span>
          </div>

          <div className="messages">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`message message-${message.role}`}
              >
                <span className="role">
                  {message.role === "assistant" ? "EZTROGUN" : "Voce"}
                </span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="message">
              Sua mensagem
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Descreva o que voce quer que a EZTROGUN faca."
            />
            <div className="composer-footer">
              <p>
                Base ampla para uso geral. Posso ampliar com memoria, login,
                dashboard, arquivos e ferramentas.
              </p>
              <button type="submit" disabled={isPending}>
                Enviar
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
          </form>
        </section>
      </section>
    </main>
  );
}
