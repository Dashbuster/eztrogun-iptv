"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  ConversationRecord,
  KnowledgeDocument,
  SettingsRecord
} from "@/lib/types";

type Props = {
  initialSettings: SettingsRecord;
  initialDocuments: KnowledgeDocument[];
  recentConversations: ConversationRecord[];
  stats: {
    documents: number;
    conversations: number;
    knowledgeBytes: number;
  };
};

export function AdminDashboard({
  initialSettings,
  initialDocuments,
  recentConversations,
  stats
}: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings)
        });

        const payload = (await response.json()) as
          | SettingsRecord
          | { error?: string };

        if (!response.ok || !("updatedAt" in payload)) {
          throw new Error(
            "error" in payload ? payload.error || "Falha ao salvar." : "Falha."
          );
        }

        setSettings(payload);
        setMessage("Configuracoes salvas.");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Falha inesperada."
        );
      }
    });
  };

  const uploadFile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Selecione um arquivo antes de enviar.");
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await fetch("/api/admin/documents", {
          method: "POST",
          body: formData
        });

        const payload = (await response.json()) as
          | { document: KnowledgeDocument }
          | { error?: string };

        if (!response.ok || !("document" in payload)) {
          throw new Error(
            "error" in payload ? payload.error || "Falha no upload." : "Falha."
          );
        }

        setDocuments((current) => [payload.document, ...current]);
        setSelectedFile(null);
        setMessage("Documento enviado.");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Falha inesperada."
        );
      }
    });
  };

  const removeDocument = (id: string) => {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/documents/${id}`, {
          method: "DELETE"
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Falha ao remover documento.");
        }

        setDocuments((current) => current.filter((document) => document.id !== id));
        setMessage("Documento removido.");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Falha inesperada."
        );
      }
    });
  };

  const logout = () => {
    startTransition(async () => {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    });
  };

  return (
    <main className="admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Control Room</p>
          <h1>Operacao da EZTROGUN</h1>
          <p className="hero-copy">
            Administre o comportamento da IA, a memoria persistente e a base de
            conhecimento enviada para o site.
          </p>
        </div>
        <button className="ghost-button" type="button" onClick={logout}>
          Sair
        </button>
      </section>

      <section className="admin-stats">
        <article>
          <span>{stats.documents}</span>
          <p>documentos ativos</p>
        </article>
        <article>
          <span>{stats.conversations}</span>
          <p>conversas salvas</p>
        </article>
        <article>
          <span>{Math.ceil(stats.knowledgeBytes / 1024)} KB</span>
          <p>base de conhecimento</p>
        </article>
      </section>

      <section className="admin-grid">
        <form className="admin-panel" onSubmit={saveSettings}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Behavior</p>
              <h2>Configuracoes da IA</h2>
            </div>
          </div>

          <label htmlFor="model">Modelo</label>
          <input
            id="model"
            value={settings.model}
            onChange={(event) =>
              setSettings((current) => ({ ...current, model: event.target.value }))
            }
          />

          <label htmlFor="welcomeMessage">Mensagem inicial</label>
          <textarea
            id="welcomeMessage"
            rows={4}
            value={settings.welcomeMessage}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                welcomeMessage: event.target.value
              }))
            }
          />

          <label htmlFor="systemPrompt">Prompt de sistema</label>
          <textarea
            id="systemPrompt"
            rows={10}
            value={settings.systemPrompt}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                systemPrompt: event.target.value
              }))
            }
          />

          <button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar configuracoes"}
          </button>
        </form>

        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Knowledge</p>
              <h2>Documentos</h2>
            </div>
          </div>

          <form className="upload-form" onSubmit={uploadFile}>
            <input
              type="file"
              accept=".txt,.md,.csv,.json"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] || null)
              }
            />
            <button type="submit" disabled={isPending}>
              {isPending ? "Enviando..." : "Enviar arquivo"}
            </button>
          </form>

          <div className="document-list">
            {documents.length ? (
              documents.map((document) => (
                <article key={document.id} className="document-item">
                  <div>
                    <h3>{document.name}</h3>
                    <p>{document.excerpt || "Sem resumo disponivel."}</p>
                  </div>
                  <button type="button" onClick={() => removeDocument(document.id)}>
                    Remover
                  </button>
                </article>
              ))
            ) : (
              <p className="muted-copy">Nenhum documento enviado ainda.</p>
            )}
          </div>
        </section>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Memory</p>
            <h2>Conversas recentes</h2>
          </div>
        </div>

        <div className="conversation-list">
          {recentConversations.length ? (
            recentConversations.map((conversation) => (
              <article key={conversation.id} className="conversation-item">
                <h3>{conversation.title}</h3>
                <p>
                  {conversation.messages.at(-1)?.content || "Conversa sem mensagens."}
                </p>
                <span>
                  Atualizada em {new Date(conversation.updatedAt).toLocaleString("pt-BR")}
                </span>
              </article>
            ))
          ) : (
            <p className="muted-copy">Ainda nao existem conversas salvas.</p>
          )}
        </div>
      </section>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
