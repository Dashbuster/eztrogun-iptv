"use client";

import { useEffect, useMemo, useState } from "react";

import { buildM3U, parseM3U, samplePlaylist } from "@/lib/iptv";
import type { IPTVChannel } from "@/lib/iptv";

import { IPTVPlayer } from "./iptv-player";

const SAMPLE_SOURCE = "sample://local";
const PASTED_SOURCE = "manual://pasted";
const FAVORITES_STORAGE_KEY = "iptv:favorites";
const RECENT_STORAGE_KEY = "iptv:recent";
const initialChannels = parseM3U(samplePlaylist);

function getChannelStorageId(channel: IPTVChannel) {
  return `${channel.name}::${channel.url}`;
}

export function IPTVClient() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const storedFavorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      return storedFavorites ? (JSON.parse(storedFavorites) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const storedRecent = window.localStorage.getItem(RECENT_STORAGE_KEY);
      return storedRecent ? (JSON.parse(storedRecent) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [playlistInput, setPlaylistInput] = useState(samplePlaylist);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [channels, setChannels] = useState<IPTVChannel[]>(initialChannels);
  const [selectedId, setSelectedId] = useState<string | null>(initialChannels[0]?.id ?? null);
  const [status, setStatus] = useState("Playlist demo carregada.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [activeSource, setActiveSource] = useState(SAMPLE_SOURCE);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentIds));
  }, [recentIds]);

  const groups = useMemo(() => {
    return ["all", ...new Set(channels.map((channel) => channel.group).filter(Boolean))];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return channels.filter((channel) => {
      const matchesGroup = activeGroup === "all" || channel.group === activeGroup;
      const matchesQuery =
        !normalizedQuery || `${channel.name} ${channel.group || ""}`.toLowerCase().includes(normalizedQuery);

      return matchesGroup && matchesQuery;
    });
  }, [activeGroup, channels, query]);

  const selectedChannel =
    filteredChannels.find((channel) => channel.id === selectedId) ||
    channels.find((channel) => channel.id === selectedId) ||
    filteredChannels[0] ||
    channels[0] ||
    null;

  const favoriteChannels = useMemo(() => {
    const favorites = new Set(favoriteIds);

    return channels.filter((channel) => favorites.has(getChannelStorageId(channel)));
  }, [channels, favoriteIds]);

  const recentChannels = useMemo(() => {
    const channelsById = new Map(channels.map((channel) => [getChannelStorageId(channel), channel]));

    return recentIds.map((id) => channelsById.get(id)).filter((channel): channel is IPTVChannel => Boolean(channel));
  }, [channels, recentIds]);

  const groupHighlights = useMemo(() => {
    const counts = new Map<string, number>();

    for (const channel of channels) {
      counts.set(channel.group, (counts.get(channel.group) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
  }, [channels]);

  function rememberRecentChannel(channel: IPTVChannel | null) {
    if (!channel) {
      return;
    }

    const channelId = getChannelStorageId(channel);
    setRecentIds((current) => [channelId, ...current.filter((item) => item !== channelId)].slice(0, 8));
  }

  function selectChannel(channel: IPTVChannel | null) {
    setSelectedId(channel?.id ?? null);
    rememberRecentChannel(channel);
  }

  function applyLoadedChannels(nextChannels: IPTVChannel[], source: string, nextStatus: string) {
    setChannels(nextChannels);
    selectChannel(nextChannels[0] ?? null);
    setActiveGroup("all");
    setQuery("");
    setActiveSource(source);
    setStatus(nextStatus);
    setError(null);
  }

  function resetToDemo() {
    applyLoadedChannels(initialChannels, SAMPLE_SOURCE, "Playlist demo recarregada.");
    setPlaylistInput(samplePlaylist);
    setPlaylistUrl("");
  }

  function toggleFavorite(channel: IPTVChannel) {
    const channelId = getChannelStorageId(channel);

    setFavoriteIds((current) =>
      current.includes(channelId) ? current.filter((item) => item !== channelId) : [channelId, ...current]
    );
  }

  function downloadPlaylist(filename: string, playlistChannels: IPTVChannel[]) {
    if (!playlistChannels.length) {
      setError("Nenhum canal disponivel para exportar.");
      return;
    }

    const content = buildM3U(playlistChannels);
    const blob = new Blob([content], { type: "audio/x-mpegurl;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    setError(null);
    setStatus(`${playlistChannels.length} canais exportados em ${filename}.`);
  }

  async function copySelectedStream() {
    if (!selectedChannel) {
      setError("Selecione um canal antes de copiar o link.");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedChannel.url);
      setError(null);
      setStatus(`Link bruto de ${selectedChannel.name} copiado.`);
    } catch {
      setError("Nao foi possivel copiar o link do stream.");
    }
  }

  async function loadRemotePlaylist() {
    const trimmedUrl = playlistUrl.trim();

    if (!trimmedUrl) {
      setError("Informe a URL da playlist M3U.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/playlist?url=${encodeURIComponent(trimmedUrl)}`);
      const data = (await response.json()) as { content?: string; error?: string };

      if (!response.ok || !data.content) {
        throw new Error(data.error || "Nao foi possivel carregar a playlist.");
      }

      const parsedChannels = parseM3U(data.content);

      if (parsedChannels.length === 0) {
        throw new Error("A playlist foi carregada, mas nenhum canal valido foi encontrado.");
      }

      setPlaylistInput(data.content);
      applyLoadedChannels(parsedChannels, trimmedUrl, `${parsedChannels.length} canais carregados da URL remota.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao carregar a playlist.");
    } finally {
      setLoading(false);
    }
  }

  function loadLocalPlaylist() {
    const parsedChannels = parseM3U(playlistInput);

    if (parsedChannels.length === 0) {
      setError("Cole uma playlist M3U valida com entradas EXTINF e URL de stream.");
      return;
    }

    applyLoadedChannels(parsedChannels, PASTED_SOURCE, `${parsedChannels.length} canais carregados do conteudo colado.`);
  }

  return (
    <main className="iptv-shell">
      <section className="iptv-hero">
        <div>
          <p className="eyebrow">Eztrogun IPTV</p>
          <h1>Reproduza playlists IPTV em um painel web limpo e direto.</h1>
          <p className="hero-copy">
            Carregue uma playlist M3U pela URL ou pelo texto bruto, filtre canais e reproduza streams
            HLS no navegador. Esta base foi preparada para evoluir com login, favoritos, EPG e backend.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <strong>{channels.length}</strong>
            <span>Canais detectados</span>
          </article>
          <article>
            <strong>{filteredChannels.length}</strong>
            <span>Resultados visiveis</span>
          </article>
          <article>
            <strong>{selectedChannel?.group || "Livre"}</strong>
            <span>Grupo atual</span>
          </article>
          <article>
            <strong>{favoriteChannels.length}</strong>
            <span>Favoritos salvos</span>
          </article>
        </div>
      </section>

      <section className="iptv-layout">
        <aside className="iptv-sidebar card">
          <div className="panel-heading">
            <h2>Fonte da playlist</h2>
            <p>{status}</p>
          </div>

          <label className="field">
            <span>URL M3U</span>
            <div className="inline-field">
              <input
                type="url"
                placeholder="https://provedor.com/lista.m3u"
                value={playlistUrl}
                onChange={(event) => setPlaylistUrl(event.target.value)}
              />
              <button type="button" onClick={loadRemotePlaylist} disabled={loading}>
                {loading ? "Carregando" : "Importar"}
              </button>
            </div>
          </label>

          <label className="field">
            <span>Conteudo M3U</span>
            <textarea
              rows={12}
              placeholder="#EXTM3U ..."
              value={playlistInput}
              onChange={(event) => setPlaylistInput(event.target.value)}
            />
          </label>

          <div className="sidebar-actions">
            <button type="button" onClick={loadLocalPlaylist}>
              Ler texto colado
            </button>
            <button type="button" className="ghost-button" onClick={resetToDemo}>
              Carregar demo
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="source-card">
            <span>Origem ativa</span>
            <strong>
              {activeSource === SAMPLE_SOURCE
                ? "Demo local"
                : activeSource === PASTED_SOURCE
                  ? "Playlist colada manualmente"
                  : activeSource}
            </strong>
          </div>

          <div className="sidebar-stack">
            <div className="mini-panel">
              <div className="mini-panel-header">
                <h3>Favoritos</h3>
                <span>{favoriteChannels.length}</span>
              </div>

              {favoriteChannels.length ? (
                <div className="mini-channel-list">
                  {favoriteChannels.slice(0, 6).map((channel) => (
                    <button key={channel.id} type="button" className="mini-channel" onClick={() => selectChannel(channel)}>
                      <strong>{channel.name}</strong>
                      <span>{channel.group}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mini-panel-empty">Marque canais com a estrela para manter acesso rapido.</p>
              )}
            </div>

            <div className="mini-panel">
              <div className="mini-panel-header">
                <h3>Recentes</h3>
                <span>{recentChannels.length}</span>
              </div>

              {recentChannels.length ? (
                <div className="mini-channel-list">
                  {recentChannels.slice(0, 6).map((channel) => (
                    <button key={channel.id} type="button" className="mini-channel" onClick={() => selectChannel(channel)}>
                      <strong>{channel.name}</strong>
                      <span>{channel.group}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mini-panel-empty">Os ultimos canais abertos aparecem aqui.</p>
              )}
            </div>
          </div>
        </aside>

        <section className="iptv-main">
          <div className="card player-card">
            <IPTVPlayer channel={selectedChannel} />
          </div>

          <div className="card insights-card">
            <div className="channels-header">
              <div>
                <h2>Ferramentas da playlist</h2>
                <p>Exporte recortes da lista atual e copie o stream selecionado.</p>
              </div>
            </div>

            <div className="tool-grid">
              <button type="button" className="tool-button" onClick={() => downloadPlaylist("playlist-filtrada.m3u", filteredChannels)}>
                <strong>Baixar lista filtrada</strong>
                <span>{filteredChannels.length} canais da busca atual</span>
              </button>
              <button type="button" className="tool-button" onClick={() => downloadPlaylist("playlist-favoritos.m3u", favoriteChannels)}>
                <strong>Baixar favoritos</strong>
                <span>{favoriteChannels.length} canais marcados</span>
              </button>
              <button type="button" className="tool-button" onClick={copySelectedStream}>
                <strong>Copiar stream atual</strong>
                <span>{selectedChannel ? selectedChannel.name : "Nenhum canal selecionado"}</span>
              </button>
            </div>

            <div className="group-summary">
              {groupHighlights.map(([group, count]) => (
                <article key={group}>
                  <strong>{count}</strong>
                  <span>{group}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="card channels-card">
            <div className="channels-header">
              <div>
                <h2>Lista de canais</h2>
                <p>Suporta busca por nome e grupo.</p>
              </div>
              <div className="channels-controls">
                <select value={activeGroup} onChange={(event) => setActiveGroup(event.target.value)}>
                  {groups.map((group) => (
                    <option key={group} value={group}>
                      {group === "all" ? "Todos os grupos" : group}
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  placeholder="Buscar canal ou categoria"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="channel-list">
              {filteredChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={`channel-item ${channel.id === selectedChannel?.id ? "active" : ""}`}
                  onClick={() => selectChannel(channel)}
                >
                  <div className="channel-copy">
                    <strong>{channel.name}</strong>
                    <span>{channel.group || "Sem categoria"}</span>
                  </div>
                  <div className="channel-meta">
                    <small>{channel.type.toUpperCase()}</small>
                    <span
                      role="button"
                      aria-label={`${
                        favoriteIds.includes(getChannelStorageId(channel)) ? "Remover dos" : "Adicionar aos"
                      } favoritos`}
                      className={`favorite-chip ${
                        favoriteIds.includes(getChannelStorageId(channel)) ? "active" : ""
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavorite(channel);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleFavorite(channel);
                        }
                      }}
                      tabIndex={0}
                    >
                      ★
                    </span>
                  </div>
                </button>
              ))}

              {filteredChannels.length === 0 ? (
                <div className="empty-state">
                  <strong>Nenhum canal encontrado.</strong>
                  <span>Ajuste o filtro ou carregue outra playlist.</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
