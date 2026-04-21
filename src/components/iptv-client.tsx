"use client";

import { useEffect, useMemo, useState } from "react";

import { buildM3U, parseM3U } from "@/lib/iptv";
import type { IPTVChannel } from "@/lib/iptv";

import { IPTVPlayer } from "./iptv-player";

type CatalogTab = "live" | "movie" | "series";
type AccessProfile = {
  code: string;
  username: string;
  password: string;
};
type SavedPlaylist = {
  id: string;
  name: string;
  url: string;
  content: string;
  source: "url" | "text";
  updatedAt: string;
};

const FAVORITES_STORAGE_KEY = "iptv:favorites";
const RECENT_STORAGE_KEY = "iptv:recent";
const ACCESS_STORAGE_KEY = "iptv:access-profile";
const PLAYLISTS_STORAGE_KEY = "iptv:saved-playlists";

function getChannelStorageId(channel: IPTVChannel) {
  return `${channel.name}::${channel.url}`;
}

function createPlaylistId() {
  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    return "Serie";
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
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const storedPlaylists = window.localStorage.getItem(PLAYLISTS_STORAGE_KEY);
      return storedPlaylists ? (JSON.parse(storedPlaylists) as SavedPlaylist[]) : [];
    } catch {
      return [];
    }
  });
  const [playlistName, setPlaylistName] = useState("");
  const [playlistInput, setPlaylistInput] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [status, setStatus] = useState("Cadastre uma playlist para começar.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [activeTab, setActiveTab] = useState<CatalogTab>("live");

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentIds));
  }, [recentIds]);

  useEffect(() => {
    window.localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(accessProfile));
  }, [accessProfile]);

  useEffect(() => {
    window.localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(savedPlaylists));
  }, [savedPlaylists]);

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
    channels.find((channel) => channel.id === selectedId) ||
    filteredChannels[0] ||
    tabChannels[0] ||
    channels[0] ||
    null;

  const activePlaylist = useMemo(() => {
    return savedPlaylists.find((playlist) => playlist.id === activePlaylistId) || null;
  }, [activePlaylistId, savedPlaylists]);

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

  function chooseInitialTab(nextChannels: IPTVChannel[]) {
    if (nextChannels.some((channel) => channel.catalog === activeTab)) {
      return activeTab;
    }

    return nextChannels[0]?.catalog || "live";
  }

  function applyLoadedChannels(nextChannels: IPTVChannel[], nextStatus: string, playlistId?: string | null) {
    const preferredTab = chooseInitialTab(nextChannels);
    const firstChannel =
      nextChannels.find((channel) => channel.catalog === preferredTab) || nextChannels[0] || null;

    setChannels(nextChannels);
    setActiveTab(preferredTab);
    setActiveGroup("all");
    setQuery("");
    setStatus(nextStatus);
    setError(null);
    setActivePlaylistId(playlistId ?? null);
    selectChannel(firstChannel);
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
    setActiveTab(nextTab);
    setActiveGroup("all");
    setQuery("");
    selectChannel(channels.find((channel) => channel.catalog === nextTab) || null);
  }

  function toggleFavorite(channel: IPTVChannel) {
    const channelId = getChannelStorageId(channel);

    setFavoriteIds((current) =>
      current.includes(channelId) ? current.filter((item) => item !== channelId) : [channelId, ...current]
    );
  }

  function clearPlaylistForm() {
    setPlaylistName("");
    setPlaylistUrl("");
    setPlaylistInput("");
    setEditingPlaylistId(null);
  }

  function fillPlaylistForm(playlist: SavedPlaylist) {
    setPlaylistName(playlist.name);
    setPlaylistUrl(playlist.url);
    setPlaylistInput(playlist.content);
    setEditingPlaylistId(playlist.id);
  }

  function validateAndParsePlaylist(rawContent: string) {
    const parsedChannels = parseM3U(rawContent);

    if (parsedChannels.length === 0) {
      throw new Error("A playlist nao possui entradas validas EXTINF com URL.");
    }

    return parsedChannels;
  }

  async function fetchRemotePlaylist(url: string) {
    const response = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
    const data = (await response.json()) as { content?: string; error?: string };

    if (!response.ok || !data.content) {
      throw new Error(data.error || "Nao foi possivel carregar a playlist.");
    }

    return data.content;
  }

  async function savePlaylist() {
    const trimmedName = playlistName.trim();
    const trimmedUrl = playlistUrl.trim();
    const rawContent = playlistInput.trim();

    if (!trimmedName) {
      setError("Informe um nome para a playlist.");
      return;
    }

    if (!trimmedUrl && !rawContent) {
      setError("Informe uma URL M3U ou cole o conteudo da playlist.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = trimmedUrl ? await fetchRemotePlaylist(trimmedUrl) : rawContent;
      const parsedChannels = validateAndParsePlaylist(content);
      const playlistRecord: SavedPlaylist = {
        id: editingPlaylistId || createPlaylistId(),
        name: trimmedName,
        url: trimmedUrl,
        content,
        source: trimmedUrl ? "url" : "text",
        updatedAt: new Date().toISOString()
      };

      setSavedPlaylists((current) => {
        if (editingPlaylistId) {
          return current.map((playlist) => (playlist.id === editingPlaylistId ? playlistRecord : playlist));
        }

        return [playlistRecord, ...current];
      });

      setPlaylistInput(content);
      setActivePlaylistId(playlistRecord.id);
      applyLoadedChannels(parsedChannels, `Playlist ${trimmedName} carregada.`, playlistRecord.id);
      setStatus(editingPlaylistId ? `Playlist ${trimmedName} atualizada.` : `Playlist ${trimmedName} salva.`);
      clearPlaylistForm();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao salvar a playlist.");
    } finally {
      setLoading(false);
    }
  }

  function loadSavedPlaylist(playlist: SavedPlaylist) {
    try {
      const parsedChannels = validateAndParsePlaylist(playlist.content);
      setPlaylistInput(playlist.content);
      setPlaylistUrl(playlist.url);
      setPlaylistName(playlist.name);
      setEditingPlaylistId(null);
      applyLoadedChannels(parsedChannels, `Playlist ${playlist.name} carregada.`, playlist.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao abrir a playlist.");
    }
  }

  function deletePlaylist(playlistId: string) {
    const playlistToRemove = savedPlaylists.find((playlist) => playlist.id === playlistId);

    setSavedPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));

    if (activePlaylistId === playlistId) {
      setActivePlaylistId(null);
      setChannels([]);
      setSelectedId(null);
      setStatus("Playlist removida. Cadastre ou carregue outra playlist.");
    }

    if (editingPlaylistId === playlistId) {
      clearPlaylistForm();
    }

    setError(null);
    setStatus(playlistToRemove ? `Playlist ${playlistToRemove.name} apagada.` : "Playlist apagada.");
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

  return (
    <main className="iptv-shell">
      <section className="iptv-home card">
        <div className="home-backdrop" />
        <div className="home-brand">
          <p className="eyebrow">Eztrogun IPTV</p>
          <h1>Assist+</h1>
          <p className="hero-copy">
            Um painel inicial neon para organizar acessos, playlists e catalogos separados em
            canais, filmes e series.
          </p>
        </div>

        <div className="launch-grid">
          <button type="button" className={`launch-card ${activeTab === "live" ? "active" : ""}`} onClick={() => switchTab("live")}>
            <strong>Live TV</strong>
            <span>{catalogCounts.live} itens</span>
          </button>
          <button type="button" className={`launch-card ${activeTab === "movie" ? "active" : ""}`} onClick={() => switchTab("movie")}>
            <strong>Movies</strong>
            <span>{catalogCounts.movie} itens</span>
          </button>
          <button type="button" className={`launch-card ${activeTab === "series" ? "active" : ""}`} onClick={() => switchTab("series")}>
            <strong>Series</strong>
            <span>{catalogCounts.series} itens</span>
          </button>
          <button type="button" className="launch-card" onClick={() => document.getElementById("playlists-panel")?.scrollIntoView({ behavior: "smooth" })}>
            <strong>Playlists</strong>
            <span>{savedPlaylists.length} salvas</span>
          </button>
          <button type="button" className="launch-card" onClick={() => document.getElementById("settings-panel")?.scrollIntoView({ behavior: "smooth" })}>
            <strong>Settings</strong>
            <span>Acesso local</span>
          </button>
        </div>

        <div className="home-reload">
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </section>

      <section className="iptv-layout">
        <aside className="iptv-sidebar card">
          <div id="settings-panel" className="panel-heading">
            <h2>Settings</h2>
            <p>Codigo, usuario e senha ficam salvos localmente neste navegador.</p>
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

          <div id="playlists-panel" className="panel-heading">
            <h2>Playlists</h2>
            <p>Crie, edite, carregue e apague playlists sem depender de demos.</p>
          </div>

          <div className="playlist-editor">
            <label className="field">
              <span>Nome da playlist</span>
              <input
                type="text"
                placeholder="Minha playlist principal"
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>URL M3U</span>
              <input
                type="url"
                placeholder="https://provedor.com/lista.m3u"
                value={playlistUrl}
                onChange={(event) => setPlaylistUrl(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Conteudo M3U</span>
              <textarea
                rows={8}
                placeholder="#EXTM3U ..."
                value={playlistInput}
                onChange={(event) => setPlaylistInput(event.target.value)}
              />
            </label>

            <div className="sidebar-actions">
              <button type="button" onClick={savePlaylist} disabled={loading}>
                {loading ? "Salvando" : editingPlaylistId ? "Atualizar playlist" : "Salvar playlist"}
              </button>
              <button type="button" className="ghost-button" onClick={clearPlaylistForm}>
                Limpar
              </button>
            </div>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="source-card">
            <span>Playlist ativa</span>
            <strong>{activePlaylist?.name || "Nenhuma playlist carregada"}</strong>
          </div>

          <div className="saved-playlists">
            {savedPlaylists.length ? (
              savedPlaylists.map((playlist) => (
                <article
                  key={playlist.id}
                  className={`saved-playlist ${playlist.id === activePlaylistId ? "active" : ""}`}
                >
                  <div>
                    <strong>{playlist.name}</strong>
                    <span>
                      {playlist.source === "url" ? "URL remota" : "Conteudo colado"} •{" "}
                      {new Date(playlist.updatedAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="saved-actions">
                    <button type="button" className="mini-action" onClick={() => loadSavedPlaylist(playlist)}>
                      Abrir
                    </button>
                    <button type="button" className="mini-action ghost-button" onClick={() => fillPlaylistForm(playlist)}>
                      Editar
                    </button>
                    <button type="button" className="mini-action danger-button" onClick={() => deletePlaylist(playlist.id)}>
                      Apagar
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhuma playlist salva.</strong>
                <span>Crie sua primeira playlist no formulário acima.</span>
              </div>
            )}
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
                <p>Exporte a aba atual ou copie o stream do item selecionado.</p>
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
                    ? "Aqui ficam apenas canais ao vivo."
                    : activeTab === "movie"
                      ? "Aqui ficam apenas filmes."
                      : "Aqui ficam apenas series."}
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
                  <span>Carregue uma playlist e use as abas para navegar entre canais, filmes e series.</span>
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
