"use client";

import { useEffect, useMemo, useState } from "react";

import { buildM3U, parseM3U, samplePlaylist } from "@/lib/iptv";
import type { IPTVChannel } from "@/lib/iptv";

import { IPTVPlayer } from "./iptv-player";

type CatalogTab = "live" | "movie" | "series";
type AccessProfile = {
  code: string;
  username: string;
  password: string;
};

const SAMPLE_SOURCE = "sample://local";
const PASTED_SOURCE = "manual://pasted";
const FAVORITES_STORAGE_KEY = "iptv:favorites";
const RECENT_STORAGE_KEY = "iptv:recent";
const ACCESS_STORAGE_KEY = "iptv:access-profile";
const initialChannels = parseM3U(samplePlaylist);

function getChannelStorageId(channel: IPTVChannel) {
  return `${channel.name}::${channel.url}`;
}

function getEmptyAccessProfile(): AccessProfile {
  return {
    code: "",
    username: "",
    password: ""
  };
}

function getCatalogLabel(tab: CatalogTab) {
  if (tab === "live") {
    return "Canais";
  }

  if (tab === "movie") {
    return "Filmes";
  }

  return "Series";
}

function getItemLabel(channel: IPTVChannel | null) {
  if (!channel) {
    return "Item";
  }

  if (channel.catalog === "movie") {
    return "Filme";
  }

  if (channel.catalog === "series") {
    return "Episodio";
  }

  return "Canal";
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
  const [accessProfile, setAccessProfile] = useState<AccessProfile>(() => {
    if (typeof window === "undefined") {
      return getEmptyAccessProfile();
    }

    try {
      const storedProfile = window.localStorage.getItem(ACCESS_STORAGE_KEY);
      return storedProfile ? (JSON.parse(storedProfile) as AccessProfile) : getEmptyAccessProfile();
    } catch {
      return getEmptyAccessProfile();
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
  const [activeTab, setActiveTab] = useState<CatalogTab>("live");
  const [activeSource, setActiveSource] = useState(SAMPLE_SOURCE);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentIds));
  }, [recentIds]);

  useEffect(() => {
    window.localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(accessProfile));
  }, [accessProfile]);

  const catalogCounts = useMemo(() => {
    return {
      live: channels.filter((channel) => channel.catalog === "live").length,
      movie: channels.filter((channel) => channel.catalog === "movie").length,
      series: channels.filter((channel) => channel.catalog === "series").length
    };
  }, [channels]);

  const tabChannels = useMemo(() => {
    return channels.filter((channel) => channel.catalog === activeTab);
  }, [activeTab, channels]);

  const groups = useMemo(() => {
    return ["all", ...new Set(tabChannels.map((channel) => channel.group).filter(Boolean))];
  }, [tabChannels]);

  const filteredChannels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tabChannels.filter((channel) => {
      const matchesGroup = activeGroup === "all" || channel.group === activeGroup;
      const matchesQuery =
        !normalizedQuery || `${channel.name} ${channel.group || ""}`.toLowerCase().includes(normalizedQuery);

      return matchesGroup && matchesQuery;
    });
  }, [activeGroup, query, tabChannels]);

  const selectedChannel =
    filteredChannels.find((channel) => channel.id === selectedId) ||
    tabChannels.find((channel) => channel.id === selectedId) ||
    filteredChannels[0] ||
    tabChannels[0] ||
    channels.find((channel) => channel.id === selectedId) ||
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
    const preferredTab = nextChannels.some((channel) => channel.catalog === activeTab)
      ? activeTab
      : nextChannels[0]?.catalog || "live";
    const firstChannelForTab = nextChannels.find((channel) => channel.catalog === preferredTab) || nextChannels[0] || null;

    setChannels(nextChannels);
    setActiveTab(preferredTab);
    setActiveGroup("all");
    setQuery("");
    setActiveSource(source);
    setStatus(nextStatus);
    setError(null);
    selectChannel(firstChannelForTab);
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

  function saveAccessProfile() {
    setStatus(
      accessProfile.code.trim()
        ? `Perfil ${accessProfile.code.trim()} salvo localmente neste navegador.`
        : "Credenciais salvas localmente neste navegador."
    );
    setError(null);
  }

  function switchTab(nextTab: CatalogTab) {
    const firstChannel = channels.find((channel) => channel.catalog === nextTab) || null;

    setActiveTab(nextTab);
    setActiveGroup("all");
    setQuery("");
    selectChannel(firstChannel);
  }

  function downloadPlaylist(filename: string, playlistChannels: IPTVChannel[]) {
    if (!playlistChannels.length) {
      setError("Nenhum item disponivel para exportar.");
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
    setStatus(`${playlistChannels.length} itens exportados em ${filename}.`);
  }

  async function copySelectedStream() {
    if (!selectedChannel) {
      setError("Selecione um item antes de copiar o link.");
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
        throw new Error("A playlist foi carregada, mas nenhum item valido foi encontrado.");
      }

      setPlaylistInput(data.content);
      applyLoadedChannels(parsedChannels, trimmedUrl, `${parsedChannels.length} itens carregados da URL remota.`);
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

    applyLoadedChannels(parsedChannels, PASTED_SOURCE, `${parsedChannels.length} itens carregados do conteudo colado.`);
  }

  return (
    <main className="iptv-shell">
      <section className="iptv-hero">
        <div>
          <p className="eyebrow">Eztrogun IPTV</p>
          <h1>Monte um catalogo com canais, filmes e series em areas separadas.</h1>
          <p className="hero-copy">
            Organize playlists M3U em uma interface com credenciais de acesso, abas dedicadas e
            selecao rapida para canais ao vivo, filmes e series.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <strong>{catalogCounts.live}</strong>
            <span>Canais ao vivo</span>
          </article>
          <article>
            <strong>{catalogCounts.movie}</strong>
            <span>Filmes</span>
          </article>
          <article>
            <strong>{catalogCounts.series}</strong>
            <span>Series</span>
          </article>
          <article>
            <strong>{favoriteChannels.length}</strong>
            <span>Favoritos</span>
          </article>
        </div>
      </section>

      <section className="iptv-layout">
        <aside className="iptv-sidebar card">
          <div className="panel-heading">
            <h2>Acesso do cliente</h2>
            <p>{status}</p>
          </div>

          <div className="credential-card">
            <label className="field">
              <span>Codigo</span>
              <input
                type="text"
                placeholder="ex: sala-01"
                value={accessProfile.code}
                onChange={(event) => setAccessProfile((current) => ({ ...current, code: event.target.value }))}
              />
            </label>

            <label className="field">
              <span>Usuario</span>
              <input
                type="text"
                placeholder="usuario do acesso"
                value={accessProfile.username}
                onChange={(event) => setAccessProfile((current) => ({ ...current, username: event.target.value }))}
              />
            </label>

            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                placeholder="senha do acesso"
                value={accessProfile.password}
                onChange={(event) => setAccessProfile((current) => ({ ...current, password: event.target.value }))}
              />
            </label>

            <button type="button" onClick={saveAccessProfile}>
              Salvar credenciais
            </button>
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
              rows={10}
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
                      <span>{getCatalogLabel(channel.catalog)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mini-panel-empty">Marque itens com a estrela para acesso rapido.</p>
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
                      <span>{getCatalogLabel(channel.catalog)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mini-panel-empty">Os ultimos itens abertos aparecem aqui.</p>
              )}
            </div>
          </div>
        </aside>

        <section className="iptv-main">
          <div className="card catalog-card">
            <div className="catalog-tabs">
              <button type="button" className={activeTab === "live" ? "active" : ""} onClick={() => switchTab("live")}>
                Canais
                <span>{catalogCounts.live}</span>
              </button>
              <button type="button" className={activeTab === "movie" ? "active" : ""} onClick={() => switchTab("movie")}>
                Filmes
                <span>{catalogCounts.movie}</span>
              </button>
              <button type="button" className={activeTab === "series" ? "active" : ""} onClick={() => switchTab("series")}>
                Series
                <span>{catalogCounts.series}</span>
              </button>
            </div>
          </div>

          <div className="card player-card">
            <IPTVPlayer channel={selectedChannel} />
          </div>

          <div className="card insights-card">
            <div className="channels-header">
              <div>
                <h2>Ferramentas da categoria</h2>
                <p>Trabalhe separadamente com a area atual do catalogo.</p>
              </div>
            </div>

            <div className="tool-grid">
              <button
                type="button"
                className="tool-button"
                onClick={() => downloadPlaylist(`eztrogun-${activeTab}-filtrado.m3u`, filteredChannels)}
              >
                <strong>Baixar aba atual</strong>
                <span>{filteredChannels.length} itens em {getCatalogLabel(activeTab).toLowerCase()}</span>
              </button>
              <button
                type="button"
                className="tool-button"
                onClick={() =>
                  downloadPlaylist(
                    `eztrogun-${activeTab}-favoritos.m3u`,
                    favoriteChannels.filter((channel) => channel.catalog === activeTab)
                  )
                }
              >
                <strong>Baixar favoritos da aba</strong>
                <span>{favoriteChannels.filter((channel) => channel.catalog === activeTab).length} itens marcados</span>
              </button>
              <button type="button" className="tool-button" onClick={copySelectedStream}>
                <strong>Copiar stream atual</strong>
                <span>{selectedChannel ? selectedChannel.name : "Nenhum item selecionado"}</span>
              </button>
            </div>
          </div>

          <div className="card channels-card">
            <div className="channels-header">
              <div>
                <h2>{getCatalogLabel(activeTab)}</h2>
                <p>
                  {activeTab === "live"
                    ? "Aqui aparecem apenas canais ao vivo."
                    : activeTab === "movie"
                      ? "Aqui aparecem apenas filmes."
                      : "Aqui aparecem apenas itens de series."}
                </p>
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
                  placeholder={`Buscar em ${getCatalogLabel(activeTab).toLowerCase()}`}
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
                    <small>{getCatalogLabel(channel.catalog)}</small>
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
                  <strong>Nenhum item encontrado.</strong>
                  <span>Ajuste o filtro, troque de aba ou carregue outra playlist.</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card details-card">
            <div className="detail-grid">
              <article>
                <span>Categoria atual</span>
                <strong>{getCatalogLabel(activeTab)}</strong>
              </article>
              <article>
                <span>Grupo selecionado</span>
                <strong>{selectedChannel?.group || "Nenhum"}</strong>
              </article>
              <article>
                <span>Tipo do item</span>
                <strong>{getItemLabel(selectedChannel)}</strong>
              </article>
              <article>
                <span>Codigo ativo</span>
                <strong>{accessProfile.code.trim() || "Nao definido"}</strong>
              </article>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
