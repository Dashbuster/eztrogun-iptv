"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  createEPGIndex,
  formatProgramTimeRange,
  getCurrentAndNextPrograms,
  getProgramsForChannel,
  parseXmltv
} from "@/lib/epg";
import type { EPGIndex } from "@/lib/epg";
import { buildM3U } from "@/lib/iptv";
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
  epgUrl?: string;
  content?: string;
  source: "url" | "text";
  updatedAt: string;
};
type IndexedChannel = IPTVChannel & {
  searchValue: string;
  storageId: string;
};

const FAVORITES_STORAGE_KEY = "iptv:favorites";
const RECENT_STORAGE_KEY = "iptv:recent";
const ACCESS_STORAGE_KEY = "iptv:access-profile";
const PLAYLISTS_STORAGE_KEY = "iptv:saved-playlists";
const CHANNEL_ROW_HEIGHT = 86;
const CHANNEL_LIST_HEIGHT = 540;
const CHANNEL_LIST_OVERSCAN = 8;
const MEDIA_GRID_CARD_HEIGHT = 308;
const MEDIA_GRID_OVERSCAN = 2;

function getChannelStorageId(channel: IPTVChannel) {
  return `${channel.name}::${channel.url}`;
}

function createPlaylistId() {
  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStorage<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? (JSON.parse(storedValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return { ok: true as const };
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error };
  }
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

function getPreferredGroup(channels: IPTVChannel[], tab: CatalogTab) {
  return channels.find((channel) => channel.catalog === tab)?.group || "all";
}

function getChannelNumber(channel: IPTVChannel | null) {
  if (!channel) {
    return "--";
  }

  return channel.id.split("-")[0] || "--";
}

function getCatalogDescription(channel: IPTVChannel | null, epgDescription?: string) {
  if (!channel) {
    return "Selecione um item para abrir detalhes completos.";
  }

  if (epgDescription) {
    return epgDescription;
  }

  if (channel.catalog === "live") {
    return `${channel.name} esta dentro da categoria ${channel.group || "Sem categoria"} e pronto para reproducao ao vivo.`;
  }

  if (channel.catalog === "movie") {
    return `${channel.name} esta listado em ${channel.group || "Filmes"} e pode ser aberto no player principal.`;
  }

  return `${channel.name} esta organizado em ${channel.group || "Series"} para navegacao por categoria.`;
}

export function IPTVClient() {
  const parserWorkerRef = useRef<Worker | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readStorage(FAVORITES_STORAGE_KEY, []));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStorage(RECENT_STORAGE_KEY, []));
  const [accessProfile, setAccessProfile] = useState<AccessProfile>(() =>
    readStorage(ACCESS_STORAGE_KEY, getEmptyAccessProfile())
  );
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() =>
    readStorage<SavedPlaylist[]>(PLAYLISTS_STORAGE_KEY, []).map((playlist) => ({
      ...playlist,
      content: playlist.source === "text" ? playlist.content || "" : ""
    }))
  );
  const [playlistName, setPlaylistName] = useState("");
  const [playlistInput, setPlaylistInput] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistEpgUrl, setPlaylistEpgUrl] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [epgIndex, setEpgIndex] = useState<EPGIndex | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [status, setStatus] = useState("Cadastre uma playlist para começar.");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [epgLoading, setEpgLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [activeTab, setActiveTab] = useState<CatalogTab>("live");
  const [listScrollTop, setListScrollTop] = useState(0);
  const [gridColumns, setGridColumns] = useState(4);

  useEffect(() => {
    writeStorage(FAVORITES_STORAGE_KEY, favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    writeStorage(RECENT_STORAGE_KEY, recentIds);
  }, [recentIds]);

  useEffect(() => {
    writeStorage(ACCESS_STORAGE_KEY, accessProfile);
  }, [accessProfile]);

  useEffect(() => {
    const compactPlaylists = savedPlaylists.map((playlist) => ({
      ...playlist,
      content: playlist.source === "text" ? playlist.content || "" : ""
    }));
    writeStorage(PLAYLISTS_STORAGE_KEY, compactPlaylists);
  }, [savedPlaylists]);

  useEffect(() => {
    return () => {
      parserWorkerRef.current?.terminate();
      parserWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateGridColumns = () => {
      if (window.innerWidth < 640) {
        setGridColumns(1);
        return;
      }

      if (window.innerWidth < 980) {
        setGridColumns(2);
        return;
      }

      if (window.innerWidth < 1320) {
        setGridColumns(3);
        return;
      }

      setGridColumns(4);
    };

    updateGridColumns();
    window.addEventListener("resize", updateGridColumns);

    return () => window.removeEventListener("resize", updateGridColumns);
  }, []);

  const deferredQuery = useDeferredValue(query);

  const catalogIndex = useMemo(() => {
    const all: IndexedChannel[] = [];
    const byId = new Map<string, IndexedChannel>();
    const byStorageId = new Map<string, IndexedChannel>();
    const byCatalog: Record<CatalogTab, IndexedChannel[]> = {
      live: [],
      movie: [],
      series: []
    };
    const groupsByCatalog: Record<CatalogTab, string[]> = {
      live: [],
      movie: [],
      series: []
    };
    const groupSets: Record<CatalogTab, Set<string>> = {
      live: new Set<string>(),
      movie: new Set<string>(),
      series: new Set<string>()
    };

    for (const channel of channels) {
      const indexedChannel: IndexedChannel = {
        ...channel,
        searchValue: `${channel.name} ${channel.group || ""}`.toLowerCase(),
        storageId: getChannelStorageId(channel)
      };

      all.push(indexedChannel);
      byId.set(indexedChannel.id, indexedChannel);
      byStorageId.set(indexedChannel.storageId, indexedChannel);
      byCatalog[indexedChannel.catalog].push(indexedChannel);

      if (indexedChannel.group && !groupSets[indexedChannel.catalog].has(indexedChannel.group)) {
        groupSets[indexedChannel.catalog].add(indexedChannel.group);
        groupsByCatalog[indexedChannel.catalog].push(indexedChannel.group);
      }
    }

    return {
      all,
      byId,
      byStorageId,
      byCatalog,
      groupsByCatalog
    };
  }, [channels]);

  const catalogCounts = useMemo(() => {
    return {
      live: catalogIndex.byCatalog.live.length,
      movie: catalogIndex.byCatalog.movie.length,
      series: catalogIndex.byCatalog.series.length
    };
  }, [catalogIndex]);

  const tabChannels = useMemo(() => {
    return catalogIndex.byCatalog[activeTab];
  }, [activeTab, catalogIndex]);

  const categoryEntries = useMemo(() => {
    const counts = new Map<string, number>();

    for (const channel of tabChannels) {
      counts.set(channel.group, (counts.get(channel.group) || 0) + 1);
    }

    return [...counts.entries()].map(([group, count]) => ({ group, count }));
  }, [tabChannels]);

  const filteredChannels = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return tabChannels.filter((channel) => {
      const matchesGroup = activeGroup === "all" || channel.group === activeGroup;
      const matchesQuery = !normalizedQuery || channel.searchValue.includes(normalizedQuery);

      return matchesGroup && matchesQuery;
    });
  }, [activeGroup, deferredQuery, tabChannels]);

  const totalVirtualHeight = filteredChannels.length * CHANNEL_ROW_HEIGHT;
  const virtualStartIndex = Math.max(0, Math.floor(listScrollTop / CHANNEL_ROW_HEIGHT) - CHANNEL_LIST_OVERSCAN);
  const virtualVisibleCount =
    Math.ceil(CHANNEL_LIST_HEIGHT / CHANNEL_ROW_HEIGHT) + CHANNEL_LIST_OVERSCAN * 2;
  const virtualEndIndex = Math.min(filteredChannels.length, virtualStartIndex + virtualVisibleCount);
  const visibleChannels = filteredChannels.slice(virtualStartIndex, virtualEndIndex);
  const topSpacerHeight = virtualStartIndex * CHANNEL_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, totalVirtualHeight - virtualEndIndex * CHANNEL_ROW_HEIGHT);
  const mediaGridRowCount = Math.ceil(filteredChannels.length / gridColumns);
  const mediaGridTotalHeight = mediaGridRowCount * MEDIA_GRID_CARD_HEIGHT;
  const mediaGridStartRow = Math.max(0, Math.floor(listScrollTop / MEDIA_GRID_CARD_HEIGHT) - MEDIA_GRID_OVERSCAN);
  const mediaGridVisibleRows =
    Math.ceil(CHANNEL_LIST_HEIGHT / MEDIA_GRID_CARD_HEIGHT) + MEDIA_GRID_OVERSCAN * 2;
  const mediaGridEndRow = Math.min(mediaGridRowCount, mediaGridStartRow + mediaGridVisibleRows);
  const mediaGridVisibleChannels = filteredChannels.slice(
    mediaGridStartRow * gridColumns,
    mediaGridEndRow * gridColumns
  );
  const mediaGridTopSpacerHeight = mediaGridStartRow * MEDIA_GRID_CARD_HEIGHT;
  const mediaGridBottomSpacerHeight = Math.max(0, mediaGridTotalHeight - mediaGridEndRow * MEDIA_GRID_CARD_HEIGHT);

  const selectedChannel =
    filteredChannels.find((channel) => channel.id === selectedId) ||
    tabChannels.find((channel) => channel.id === selectedId) ||
    (selectedId ? catalogIndex.byId.get(selectedId) || null : null) ||
    filteredChannels[0] ||
    tabChannels[0] ||
    catalogIndex.all[0] ||
    null;

  const activePlaylist = useMemo(() => {
    return savedPlaylists.find((playlist) => playlist.id === activePlaylistId) || null;
  }, [activePlaylistId, savedPlaylists]);

  const favoriteChannels = useMemo(() => {
    return favoriteIds
      .map((id) => catalogIndex.byStorageId.get(id))
      .filter((channel): channel is IndexedChannel => Boolean(channel));
  }, [catalogIndex, favoriteIds]);

  const recentChannels = useMemo(() => {
    return recentIds
      .map((id) => catalogIndex.byStorageId.get(id))
      .filter((channel): channel is IndexedChannel => Boolean(channel));
  }, [catalogIndex, recentIds]);

  const nextUpChannels = useMemo(() => {
    if (activeTab !== "live" || epgIndex) {
      return [];
    }

    const selectedIndex = filteredChannels.findIndex((channel) => channel.id === selectedChannel?.id);
    const startIndex = selectedIndex >= 0 ? selectedIndex + 1 : 0;

    return filteredChannels.slice(startIndex, startIndex + 4);
  }, [activeTab, epgIndex, filteredChannels, selectedChannel]);

  const selectedPrograms = useMemo(() => {
    if (!selectedChannel) {
      return [];
    }

    return getProgramsForChannel(epgIndex, selectedChannel.tvgId, selectedChannel.name);
  }, [epgIndex, selectedChannel]);

  const { currentProgram, upcomingPrograms } = useMemo(() => {
    return getCurrentAndNextPrograms(selectedPrograms);
  }, [selectedPrograms]);

  const selectedDescription = useMemo(() => {
    return getCatalogDescription(selectedChannel, currentProgram?.description);
  }, [currentProgram?.description, selectedChannel]);

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
    const preferredGroup = getPreferredGroup(nextChannels, preferredTab);

    setChannels(nextChannels);
    setActiveTab(preferredTab);
    setActiveGroup(preferredGroup);
    setQuery("");
    setListScrollTop(0);
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
    const nextTabChannels = catalogIndex.byCatalog[nextTab];
    setActiveTab(nextTab);
    setActiveGroup(getPreferredGroup(nextTabChannels, nextTab));
    setQuery("");
    setListScrollTop(0);
    selectChannel(nextTabChannels[0] || null);
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
    setPlaylistEpgUrl("");
    setPlaylistInput("");
    setEditingPlaylistId(null);
  }

  function fillPlaylistForm(playlist: SavedPlaylist) {
    setPlaylistName(playlist.name);
    setPlaylistUrl(playlist.url);
    setPlaylistEpgUrl(playlist.epgUrl || "");
    setPlaylistInput(playlist.content || "");
    setEditingPlaylistId(playlist.id);
  }

  async function validateAndParsePlaylist(rawContent: string) {
    if (!parserWorkerRef.current) {
      parserWorkerRef.current = new Worker(new URL("../workers/iptv-parser.worker.ts", import.meta.url));
    }

    return await new Promise<IPTVChannel[]>((resolve, reject) => {
      const worker = parserWorkerRef.current;

      if (!worker) {
        reject(new Error("Falha ao iniciar o parser da playlist."));
        return;
      }

      const handleMessage = (
        event: MessageEvent<
          | { ok: true; channels: IPTVChannel[] }
          | {
              ok: false;
              error: string;
            }
        >
      ) => {
        worker.removeEventListener("message", handleMessage);

        if (!event.data.ok) {
          reject(new Error(event.data.error));
          return;
        }

        if (event.data.channels.length === 0) {
          reject(new Error("A playlist nao possui entradas validas EXTINF com URL."));
          return;
        }

        resolve(event.data.channels);
      };

      worker.addEventListener("message", handleMessage);
      worker.postMessage({ content: rawContent });
    });
  }

  async function fetchRemoteText(url: string, mode: "m3u" | "raw" = "m3u") {
    const response = await fetch(`/api/playlist?url=${encodeURIComponent(url)}&mode=${mode}`);
    const data = (await response.json()) as { content?: string; error?: string };

    if (!response.ok || !data.content) {
      throw new Error(data.error || "Nao foi possivel carregar o conteudo remoto.");
    }

    return data.content;
  }

  async function loadEPG(epgUrl: string) {
    const trimmedUrl = epgUrl.trim();

    if (!trimmedUrl) {
      setEpgIndex(null);
      return false;
    }

    setEpgLoading(true);

    try {
      const content = await fetchRemoteText(trimmedUrl, "raw");
      setEpgIndex(createEPGIndex(parseXmltv(content)));
      return true;
    } catch (caughtError) {
      setEpgIndex(null);
      throw caughtError;
    } finally {
      setEpgLoading(false);
    }
  }

  async function savePlaylist() {
    const trimmedName = playlistName.trim();
    const trimmedUrl = playlistUrl.trim();
    const trimmedEpgUrl = playlistEpgUrl.trim();
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
      const content = trimmedUrl ? await fetchRemoteText(trimmedUrl) : rawContent;
      const parsedChannels = await validateAndParsePlaylist(content);
      const playlistRecord: SavedPlaylist = {
        id: editingPlaylistId || createPlaylistId(),
        name: trimmedName,
        url: trimmedUrl,
        epgUrl: trimmedEpgUrl,
        content: trimmedUrl ? "" : content,
        source: trimmedUrl ? "url" : "text",
        updatedAt: new Date().toISOString()
      };
      const compactNextPlaylists = (
        editingPlaylistId
          ? savedPlaylists.map((playlist) => (playlist.id === editingPlaylistId ? playlistRecord : playlist))
          : [playlistRecord, ...savedPlaylists]
      ).map((playlist) => ({
        ...playlist,
        content: playlist.source === "text" ? playlist.content || "" : ""
      }));
      const persistCheck = writeStorage(PLAYLISTS_STORAGE_KEY, compactNextPlaylists);

      if (!persistCheck.ok) {
        throw new Error("A playlist e grande demais para ficar salva no navegador. Use URL ou reduza o conteudo colado.");
      }

      setSavedPlaylists((current) => {
        if (editingPlaylistId) {
          return current.map((playlist) => (playlist.id === editingPlaylistId ? playlistRecord : playlist));
        }

        return [playlistRecord, ...current];
      });

      if (trimmedEpgUrl) {
        await loadEPG(trimmedEpgUrl);
      } else {
        setEpgIndex(null);
      }

      if (!trimmedUrl) {
        setPlaylistInput(content);
      }

      setActivePlaylistId(playlistRecord.id);
      applyLoadedChannels(parsedChannels, `Playlist ${trimmedName} carregada.`, playlistRecord.id);
      setStatus(
        trimmedUrl
          ? `Playlist ${trimmedName} carregada por URL sem espelhar o M3U no editor.`
          : editingPlaylistId
            ? `Playlist ${trimmedName} atualizada.`
            : `Playlist ${trimmedName} salva.`
      );
      clearPlaylistForm();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao salvar a playlist.");
    } finally {
      setLoading(false);
    }
  }

  function loadSavedPlaylist(playlist: SavedPlaylist) {
    const openPlaylist = async () => {
      setLoading(true);
      setError(null);

      try {
        const content = playlist.source === "url" ? await fetchRemoteText(playlist.url) : playlist.content || "";
        const parsedChannels = await validateAndParsePlaylist(content);

        if (playlist.epgUrl) {
          await loadEPG(playlist.epgUrl);
        } else {
          setEpgIndex(null);
        }

        setPlaylistInput(playlist.source === "text" ? content : "");
        setPlaylistUrl(playlist.url);
        setPlaylistEpgUrl(playlist.epgUrl || "");
        setPlaylistName(playlist.name);
        setEditingPlaylistId(null);
        applyLoadedChannels(parsedChannels, `Playlist ${playlist.name} carregada.`, playlist.id);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Falha ao abrir a playlist.");
      } finally {
        setLoading(false);
      }
    };

    void openPlaylist();
  }

  function deletePlaylist(playlistId: string) {
    const playlistToRemove = savedPlaylists.find((playlist) => playlist.id === playlistId);

    setSavedPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));

    if (activePlaylistId === playlistId) {
      setActivePlaylistId(null);
      setChannels([]);
      setEpgIndex(null);
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
              <span>URL EPG/XMLTV</span>
              <input
                type="url"
                placeholder="https://provedor.com/guia.xml"
                value={playlistEpgUrl}
                onChange={(event) => setPlaylistEpgUrl(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Conteudo M3U</span>
              <textarea
                rows={8}
                placeholder={playlistUrl ? "Playlist remota carregada sem espelhar o M3U aqui." : "#EXTM3U ..."}
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
            <small>{epgLoading ? "Carregando EPG..." : activePlaylist?.epgUrl ? "EPG ativo" : "Sem EPG"}</small>
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
                <input
                  type="search"
                  placeholder={`Buscar em ${getCatalogLabel(activeTab).toLowerCase()}`}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setListScrollTop(0);
                  }}
                />
              </div>
            </div>

            <div className="browser-layout">
              <div className="category-column">
                <div className="browser-titlebar">
                  <strong>Categorias</strong>
                  <span>{categoryEntries.length}</span>
                </div>

                <div className="category-list">
                  {categoryEntries.map((entry) => (
                    <button
                      key={entry.group}
                      type="button"
                      className={`category-item ${activeGroup === entry.group ? "active" : ""}`}
                      onClick={() => {
                        setActiveGroup(entry.group);
                        setListScrollTop(0);
                      }}
                    >
                      <strong>{entry.group}</strong>
                      <span>{entry.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="items-column">
                <div className="browser-titlebar">
                  <strong>{activeGroup === "all" ? "Todos os grupos" : activeGroup}</strong>
                  <span>{filteredChannels.length}</span>
                </div>

                {activeTab === "live" ? (
                  <div className="channel-list" onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
                  <div style={{ height: topSpacerHeight }} aria-hidden="true" />
                  {visibleChannels.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      className={`channel-item ${channel.id === selectedChannel?.id ? "active" : ""}`}
                      onClick={() => selectChannel(channel)}
                    >
                      <div className="channel-copy">
                        {channel.logo ? (
                          <span className={`media-thumb ${activeTab === "live" ? "live-thumb" : ""}`}>
                            <img src={channel.logo} alt={channel.name} loading="lazy" />
                          </span>
                        ) : null}
                        <div>
                          <strong>{channel.name}</strong>
                          <span>{channel.group || "Sem categoria"}</span>
                        </div>
                      </div>
                      <div className="channel-meta">
                        <small>{getChannelNumber(channel)}</small>
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
                  <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />

                  {filteredChannels.length === 0 ? (
                    <div className="empty-state">
                      <strong>Nenhum item encontrado.</strong>
                      <span>Troque de categoria ou refine a busca.</span>
                    </div>
                  ) : null}
                  </div>
                ) : (
                  <div className="media-grid-shell" onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
                    <div style={{ height: mediaGridTopSpacerHeight }} aria-hidden="true" />
                    <div
                      className="media-grid"
                      style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
                    >
                      {mediaGridVisibleChannels.map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          className={`media-card ${channel.id === selectedChannel?.id ? "active" : ""}`}
                          onClick={() => selectChannel(channel)}
                        >
                          <div className="media-card-poster">
                            {channel.logo ? (
                              <img src={channel.logo} alt={channel.name} loading="lazy" />
                            ) : (
                              <span className="media-card-fallback">{getItemLabel(channel)}</span>
                            )}
                          </div>
                          <div className="media-card-copy">
                            <strong>{channel.name}</strong>
                            <span>{channel.group || "Sem categoria"}</span>
                            <small>{getChannelNumber(channel)}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div style={{ height: mediaGridBottomSpacerHeight }} aria-hidden="true" />

                    {filteredChannels.length === 0 ? (
                      <div className="empty-state">
                        <strong>Nenhum item encontrado.</strong>
                        <span>Troque de categoria ou refine a busca.</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="preview-column">
                <div className="browser-titlebar">
                  <strong>Preview</strong>
                  <span>{selectedChannel ? getItemLabel(selectedChannel) : "Nenhum"}</span>
                </div>

                <div className="preview-summary">
                  <article>
                    <span>Selecionado</span>
                    <strong>{selectedChannel?.name || "Nenhum item"}</strong>
                  </article>
                  <article>
                    <span>Categoria</span>
                    <strong>{selectedChannel?.group || "Sem categoria"}</strong>
                  </article>
                  <article>
                    <span>Formato</span>
                    <strong>{selectedChannel?.type.toUpperCase() || "--"}</strong>
                  </article>
                  <article>
                    <span>Canal</span>
                    <strong>{getChannelNumber(selectedChannel)}</strong>
                  </article>
                </div>

                <div className={`preview-poster ${selectedChannel?.logo ? "has-image" : ""}`}>
                  {selectedChannel?.logo ? (
                    <img src={selectedChannel.logo} alt={selectedChannel.name} loading="lazy" />
                  ) : null}
                  <div className="preview-overlay">
                    <span>{getItemLabel(selectedChannel)}</span>
                    <strong>{selectedChannel?.name || "Nenhum item"}</strong>
                    <small>{selectedDescription}</small>
                  </div>
                </div>

                {activeTab === "live" ? (
                  <div className="epg-panel">
                    <div className="browser-titlebar">
                      <strong>Agora / Proximo</strong>
                      <span>{getChannelNumber(selectedChannel)}</span>
                    </div>

                    <div className="epg-now">
                      <span>Agora</span>
                      <strong>{currentProgram?.title || selectedChannel?.name || "Nenhum canal"}</strong>
                      <small>
                        {currentProgram
                          ? `${formatProgramTimeRange(currentProgram)} • ${currentProgram.description || "Programacao ao vivo"}`
                          : selectedChannel?.group || "Sem categoria"}
                      </small>
                    </div>

                    <div className="timeline-list">
                      {upcomingPrograms.length
                        ? upcomingPrograms.map((program) => (
                            <article key={`${program.channelId}-${program.start}`} className="timeline-item program-item">
                              <span className="timeline-dot" />
                              <div>
                                <strong>{program.title}</strong>
                                <small>{formatProgramTimeRange(program)}</small>
                              </div>
                            </article>
                          ))
                        : nextUpChannels.map((channel) => (
                            <button
                              key={channel.id}
                              type="button"
                              className="timeline-item"
                              onClick={() => selectChannel(channel)}
                            >
                              <span className="timeline-dot" />
                              <div>
                                <strong>{channel.name}</strong>
                                <small>{channel.group}</small>
                              </div>
                            </button>
                          ))}

                      {upcomingPrograms.length === 0 && nextUpChannels.length === 0 ? (
                        <div className="empty-state">
                          <strong>Nenhum proximo item.</strong>
                          <span>Adicione uma URL XMLTV para ver a grade real por horario.</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="timeline-list">
                  {recentChannels
                    .filter((channel) => channel.catalog === activeTab)
                    .slice(0, 6)
                    .map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        className={`timeline-item ${channel.id === selectedChannel?.id ? "active" : ""}`}
                        onClick={() => selectChannel(channel)}
                      >
                        <span className="timeline-dot" />
                        <div>
                          <strong>{channel.name}</strong>
                          <small>{channel.group}</small>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="channel-list legacy-hidden" onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
              <div style={{ height: topSpacerHeight }} aria-hidden="true" />
              {visibleChannels.map((channel) => (
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
              <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />

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
              <article>
                <span>Descricao</span>
                <strong>{selectedDescription}</strong>
              </article>
              <article>
                <span>Guia EPG</span>
                <strong>{activePlaylist?.epgUrl ? "Conectado" : "Nao informado"}</strong>
              </article>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
