"use client";

import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  createEPGIndex,
  formatProgramTimeRange,
  getCurrentAndNextPrograms,
  getProgramsForChannel,
  parseXmltv
} from "@/lib/epg";
import type { EPGIndex, EPGProgram } from "@/lib/epg";
import { buildM3U } from "@/lib/iptv";
import type { IPTVChannel } from "@/lib/iptv";

import { IPTVPlayer } from "./iptv-player";

type CatalogTab = "live" | "movie" | "series";
type HomePanel = "none" | "settings" | "playlists" | "catalog";
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
type SeriesSeason = {
  seasonNumber: number | null;
  label: string;
  episodes: IndexedChannel[];
};
type SeriesEntry = {
  key: string;
  title: string;
  group: string;
  logo?: string;
  episodes: IndexedChannel[];
  seasons: SeriesSeason[];
};
type CachedPlaylistPayload = {
  playlistId: string;
  cachedAt: string;
  channels: IPTVChannel[];
};
type HomeRailItem = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  aspect: "poster" | "wide";
  target: CatalogTab;
};
type HomeRail = {
  id: string;
  title: string;
  items: HomeRailItem[];
};

const FAVORITES_STORAGE_KEY = "iptv:favorites";
const RECENT_STORAGE_KEY = "iptv:recent";
const ACCESS_STORAGE_KEY = "iptv:access-profile";
const PLAYLISTS_STORAGE_KEY = "iptv:saved-playlists";
const ACTIVE_PLAYLIST_STORAGE_KEY = "iptv:active-playlist-id";
const PLAYLIST_CACHE_STORAGE_PREFIX = "iptv:playlist-cache:";
const CHANNEL_ROW_HEIGHT = 86;
const CHANNEL_LIST_HEIGHT = 540;
const CHANNEL_LIST_OVERSCAN = 8;
const MEDIA_GRID_CARD_HEIGHT = 468;
const MEDIA_GRID_OVERSCAN = 2;
const HOME_HERO = {
  eyebrow: "Assist+ Original",
  title: "Noite de Estreia",
  description:
    "Uma home com clima de streaming premium, hero cinematografico e trilhas que priorizam TV/Desktop sem perder adaptacao para mouse e mobile.",
  image:
    "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80"
} as const;
const HOME_RAILS_MOCK: HomeRail[] = [
  {
    id: "recent-live",
    title: "Canais Recentes",
    items: [
      {
        id: "live-1",
        title: "Arena Sports UHD",
        subtitle: "Esportes ao vivo",
        image: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80",
        aspect: "wide",
        target: "live"
      },
      {
        id: "live-2",
        title: "Prime News",
        subtitle: "Cobertura 24h",
        image: "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80",
        aspect: "wide",
        target: "live"
      },
      {
        id: "live-3",
        title: "Cinema Action",
        subtitle: "Abertura especial",
        image: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1200&q=80",
        aspect: "wide",
        target: "live"
      }
    ]
  },
  {
    id: "fresh-drop",
    title: "Adicionados Recentemente",
    items: [
      {
        id: "drop-1",
        title: "Horizonte Neon",
        subtitle: "Ficcao cientifica",
        image: "https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "movie"
      },
      {
        id: "drop-2",
        title: "Arquivo Zero",
        subtitle: "Serie policial",
        image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "series"
      },
      {
        id: "drop-3",
        title: "Velocidade Max",
        subtitle: "Acao intensa",
        image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "movie"
      }
    ]
  },
  {
    id: "featured-movies",
    title: "Filmes em Destaque",
    items: [
      {
        id: "movie-1",
        title: "Ultima Fronteira",
        subtitle: "Drama espacial",
        image: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "movie"
      },
      {
        id: "movie-2",
        title: "Fuga de Midnight",
        subtitle: "Suspense",
        image: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "movie"
      },
      {
        id: "movie-3",
        title: "Cidade Terminal",
        subtitle: "Crime urbano",
        image: "https://images.unsplash.com/photo-1513106580091-1d82408b8cd6?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "movie"
      }
    ]
  },
  {
    id: "popular-series",
    title: "Series Populares",
    items: [
      {
        id: "series-1",
        title: "Distrito 8",
        subtitle: "Thriller politico",
        image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "series"
      },
      {
        id: "series-2",
        title: "Modo Noturno",
        subtitle: "Cyber drama",
        image: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "series"
      },
      {
        id: "series-3",
        title: "Sinal Perdido",
        subtitle: "Mistério",
        image: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=900&q=80",
        aspect: "poster",
        target: "series"
      }
    ]
  }
] as const;

function LaunchIcon({ kind }: { kind: "home" | "live" | "movie" | "series" | "favorites" | "epg" | "playlists" | "settings" }) {
  if (kind === "home") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M10 22l14-11 14 11" />
        <path d="M14 20v16h20V20" />
        <path d="M20 36V26h8v10" />
      </svg>
    );
  }

  if (kind === "live") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="9" y="11" width="30" height="20" rx="5" />
        <path d="M18 37h12" />
        <path d="M24 31v6" />
        <path d="M16 7l8 7 8-7" />
        <path d="M14 20h20" />
      </svg>
    );
  }

  if (kind === "movie") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="11" y="12" width="26" height="24" rx="4" />
        <path d="M17 12l4 6" />
        <path d="M27 12l4 6" />
        <path d="M11 20h26" />
        <path d="M20 24l10 4-10 4z" />
      </svg>
    );
  }

  if (kind === "series") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="10" width="28" height="28" rx="6" />
        <path d="M19 18h10" />
        <path d="M19 24h10" />
        <path d="M19 30h6" />
        <circle cx="14.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="24" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="30" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (kind === "favorites") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 37l-9.4 5 1.8-10.5L8.8 24l10.5-1.5L24 13l4.7 9.5L39.2 24l-7.6 7.5L33.4 42z" />
      </svg>
    );
  }

  if (kind === "epg") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="9" y="12" width="30" height="24" rx="5" />
        <path d="M9 20h30" />
        <path d="M17 12v-4" />
        <path d="M31 12v-4" />
        <path d="M17 26h6" />
        <path d="M27 26h4" />
      </svg>
    );
  }

  if (kind === "playlists") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="10" y="10" width="28" height="28" rx="6" />
        <path d="M17 18h14" />
        <path d="M17 24h14" />
        <path d="M17 30h9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="9" />
      <path d="M24 10v4" />
      <path d="M24 34v4" />
      <path d="M10 24h4" />
      <path d="M34 24h4" />
      <path d="M14.5 14.5l2.8 2.8" />
      <path d="M30.7 30.7l2.8 2.8" />
      <path d="M33.5 14.5l-2.8 2.8" />
      <path d="M17.3 30.7l-2.8 2.8" />
    </svg>
  );
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractSeriesMeta(name: string) {
  const matchers = [
    /^(.*?)[\s._-]+S(\d{1,2})E(\d{1,3})(?:\b|[\s._-]|$)/i,
    /^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})(?:\b|[\s._-]|$)/i,
    /^(.*?)[\s._-]+temporada[\s._-]*(\d{1,2})[\s._-]+epis(?:odio|ódio)[\s._-]*(\d{1,3})(?:\b|[\s._-]|$)/i
  ];

  for (const pattern of matchers) {
    const match = name.match(pattern);

    if (!match) {
      continue;
    }

    const seriesTitle = match[1].replace(/[\s._-]+$/g, "").trim() || name.trim();
    const seasonNumber = Number.parseInt(match[2], 10);
    const episodeNumber = Number.parseInt(match[3], 10);

    return {
      seriesTitle,
      seasonNumber,
      episodeNumber
    };
  }

  return {
    seriesTitle: name.trim(),
    seasonNumber: null,
    episodeNumber: null
  };
}

function getSeriesKey(channel: IPTVChannel) {
  const meta = extractSeriesMeta(channel.name);
  return `${channel.group}::${normalizeSearchValue(meta.seriesTitle)}`;
}

function getSeriesSeasonLabel(seasonNumber: number | null) {
  if (seasonNumber === null) {
    return "Extras";
  }

  return `Temporada ${seasonNumber}`;
}

function getSeriesEpisodeLabel(channel: IPTVChannel) {
  const meta = extractSeriesMeta(channel.name);

  if (meta.seasonNumber !== null && meta.episodeNumber !== null) {
    return `T${String(meta.seasonNumber).padStart(2, "0")}E${String(meta.episodeNumber).padStart(2, "0")}`;
  }

  return getItemLabel(channel);
}

function getStableNumberSeed(value: string) {
  return [...value].reduce((seed, char) => seed + char.charCodeAt(0), 0);
}

function buildDetailMetadata(title: string, group?: string) {
  const seed = getStableNumberSeed(`${title}-${group || ""}`);
  const genres = [group || "Drama", "Suspense", "Acao", "Ficcao", "Aventura", "Crime"];
  const people = [
    "Maya Torres",
    "Caio Ferraz",
    "Luna Ribeiro",
    "Theo Martins",
    "Clara Salles",
    "Enzo Vidal"
  ];

  return {
    year: 2012 + (seed % 13),
    duration: `${92 + (seed % 46)} min`,
    rating: ["12", "14", "16", "18"][seed % 4],
    genre: genres[seed % genres.length],
    cast: `${people[seed % people.length]}, ${people[(seed + 2) % people.length]}, ${people[(seed + 4) % people.length]}`,
    director: people[(seed + 1) % people.length]
  };
}

function buildSeriesSynopsis(series: SeriesEntry) {
  return `${series.title} acompanha personagens sob pressao em ${series.group || "um universo premium"}, com ritmo de maratona e gancho forte em cada episodio.`;
}

function buildMovieSynopsis(channel: IPTVChannel) {
  return `${channel.name} entrega uma sessao cinematografica com atmosfera intensa, visual de destaque e narrativa pensada para uma experiencia de streaming premium.`;
}

function buildEpisodeRuntime(channel: IPTVChannel) {
  const seed = getStableNumberSeed(channel.name);
  return `${38 + (seed % 19)} min`;
}

function buildEpisodeSummary(channel: IPTVChannel, seriesTitle: string) {
  return `Neste episodio de ${seriesTitle}, a trama avanca com novas revelacoes, tensao crescente e um gancho pensado para continuar a temporada.`;
}

function getPanelTitle(panel: HomePanel) {
  if (panel === "settings") {
    return "Settings";
  }

  if (panel === "playlists") {
    return "Playlists";
  }

  if (panel === "catalog") {
    return "Catalogo";
  }

  return "Inicio";
}

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

function removeStorage(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function getPlaylistCacheStorageKey(playlistId: string) {
  return `${PLAYLIST_CACHE_STORAGE_PREFIX}${playlistId}`;
}

function readPlaylistCache(playlistId: string) {
  return readStorage<CachedPlaylistPayload | null>(getPlaylistCacheStorageKey(playlistId), null);
}

function writePlaylistCache(playlistId: string, channels: IPTVChannel[]) {
  return writeStorage(getPlaylistCacheStorageKey(playlistId), {
    playlistId,
    cachedAt: new Date().toISOString(),
    channels
  });
}

async function saveBackendPlaylistSnapshot(playlistId: string, channels: IPTVChannel[]) {
  try {
    await fetch(`/api/playlist-snapshots/${encodeURIComponent(playlistId)}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ channels })
    });
  } catch {
    // Ignore backend snapshot failures; local cache is still attempted.
  }
}

async function fetchBackendPlaylistSnapshot(playlistId: string) {
  try {
    const response = await fetch(`/api/playlist-snapshots/${encodeURIComponent(playlistId)}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { channels?: IPTVChannel[] };
    return data.channels || null;
  } catch {
    return null;
  }
}

async function deleteBackendPlaylistSnapshot(playlistId: string) {
  try {
    await fetch(`/api/playlist-snapshots/${encodeURIComponent(playlistId)}`, {
      method: "DELETE"
    });
  } catch {
    // Ignore backend snapshot cleanup failures.
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

function getProgramProgress(program: EPGProgram | null, now = Date.now()) {
  if (!program) {
    return 0;
  }

  if (now <= program.start) {
    return 0;
  }

  if (now >= program.end) {
    return 100;
  }

  return Math.max(0, Math.min(100, ((now - program.start) / (program.end - program.start)) * 100));
}

function floorToHalfHour(timestamp: number) {
  const date = new Date(timestamp);
  date.setMinutes(date.getMinutes() < 30 ? 0 : 30, 0, 0);
  return date.getTime();
}

function formatGuideTick(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function buildMockProgramsForChannel(channel: IPTVChannel, channelIndex: number, now = Date.now()): EPGProgram[] {
  const slotStart = floorToHalfHour(now) - 30 * 60 * 1000;
  const titles = [
    `${channel.group || "Ao Vivo"} Express`,
    `${channel.name} Newsline`,
    `${channel.group || "Prime Time"} Especial`,
    `${channel.name} Session`,
    "Madrugada Replay"
  ];

  return titles.map((title, index) => {
    const start = slotStart + index * 30 * 60 * 1000;
    const end = start + 30 * 60 * 1000;

    return {
      channelId: channel.tvgId || channel.id,
      channelName: channel.name,
      title,
      description: `Grade demonstrativa para ${channel.name}. Conecte um XMLTV para substituir este mock por EPG real.`,
      start,
      end
    };
  });
}

function getInitialBootPlaylistState() {
  const savedPlaylists = readStorage<SavedPlaylist[]>(PLAYLISTS_STORAGE_KEY, []).map((playlist) => ({
    ...playlist,
    content: playlist.source === "text" ? playlist.content || "" : ""
  }));
  const activePlaylistId = readStorage<string | null>(ACTIVE_PLAYLIST_STORAGE_KEY, null);
  const cachedChannels = activePlaylistId ? readPlaylistCache(activePlaylistId)?.channels || [] : [];
  const activePlaylist = activePlaylistId
    ? savedPlaylists.find((playlist) => playlist.id === activePlaylistId) || null
    : null;
  const activeTab = cachedChannels[0]?.catalog || "live";

  return {
    savedPlaylists,
    activePlaylistId,
    channels: cachedChannels,
    activePanel: cachedChannels.length ? ("catalog" as const) : ("none" as const),
    activeTab,
    activeGroup: cachedChannels.length ? getPreferredGroup(cachedChannels, activeTab) : "all",
    status: activePlaylist ? `Playlist ${activePlaylist.name} restaurada do cache local.` : "Cadastre uma playlist para começar."
  };
}

export function IPTVClient() {
  const parserWorkerRef = useRef<Worker | null>(null);
  const restoredPlaylistRef = useRef(false);
  const [bootPlaylistState] = useState(() => getInitialBootPlaylistState());
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readStorage(FAVORITES_STORAGE_KEY, []));
  const [recentIds, setRecentIds] = useState<string[]>(() => readStorage(RECENT_STORAGE_KEY, []));
  const [accessProfile, setAccessProfile] = useState<AccessProfile>(() =>
    readStorage(ACCESS_STORAGE_KEY, getEmptyAccessProfile())
  );
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() => bootPlaylistState.savedPlaylists);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistInput, setPlaylistInput] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistEpgUrl, setPlaylistEpgUrl] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [channels, setChannels] = useState<IPTVChannel[]>(() => bootPlaylistState.channels);
  const [epgIndex, setEpgIndex] = useState<EPGIndex | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(() => bootPlaylistState.activePlaylistId);
  const [status, setStatus] = useState(bootPlaylistState.status);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [epgLoading, setEpgLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState(bootPlaylistState.activeGroup);
  const [activeTab, setActiveTab] = useState<CatalogTab>(bootPlaylistState.activeTab);
  const [activePanel, setActivePanel] = useState<HomePanel>(bootPlaylistState.activePanel);
  const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [liveViewMode, setLiveViewMode] = useState<"browse" | "guide">("browse");
  const [liveGuideFocus, setLiveGuideFocus] = useState({ row: 0, column: 0 });
  const [guideBaseTime] = useState(() => floorToHalfHour(Date.now()));
  const [listScrollTop, setListScrollTop] = useState(0);
  const [gridColumns, setGridColumns] = useState(3);

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
    writeStorage(ACTIVE_PLAYLIST_STORAGE_KEY, activePlaylistId);
  }, [activePlaylistId]);

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

      if (window.innerWidth < 1120) {
        setGridColumns(2);
        return;
      }

      setGridColumns(3);
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

    if (activeTab === "series") {
      const groupTitles = new Map<string, Set<string>>();

      for (const channel of tabChannels) {
        const title = extractSeriesMeta(channel.name).seriesTitle;
        const collection = groupTitles.get(channel.group) || new Set<string>();

        collection.add(normalizeSearchValue(title));
        groupTitles.set(channel.group, collection);
      }

      return [...groupTitles.entries()].map(([group, titles]) => ({ group, count: titles.size }));
    }

    for (const channel of tabChannels) {
      counts.set(channel.group, (counts.get(channel.group) || 0) + 1);
    }

    return [...counts.entries()].map(([group, count]) => ({ group, count }));
  }, [activeTab, tabChannels]);

  const categoryBrowserEntries = useMemo(() => {
    return [{ group: "all", count: tabChannels.length }, ...categoryEntries];
  }, [categoryEntries, tabChannels.length]);

  const filteredChannels = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(deferredQuery.trim());

    return tabChannels.filter((channel) => {
      const matchesGroup = activeGroup === "all" || channel.group === activeGroup;
      const seriesTitle = channel.catalog === "series" ? extractSeriesMeta(channel.name).seriesTitle : "";
      const matchesQuery =
        !normalizedQuery ||
        channel.searchValue.includes(normalizedQuery) ||
        normalizeSearchValue(seriesTitle).includes(normalizedQuery);

      return matchesGroup && matchesQuery;
    });
  }, [activeGroup, deferredQuery, tabChannels]);

  const seriesEntries = useMemo<SeriesEntry[]>(() => {
    const seriesMap = new Map<
      string,
      {
        title: string;
        group: string;
        logo?: string;
        episodes: IndexedChannel[];
        seasons: Map<number | null, IndexedChannel[]>;
      }
    >();

    for (const channel of filteredChannels) {
      if (channel.catalog !== "series") {
        continue;
      }

      const meta = extractSeriesMeta(channel.name);
      const key = `${channel.group}::${normalizeSearchValue(meta.seriesTitle)}`;
      const current =
        seriesMap.get(key) ||
        {
          title: meta.seriesTitle,
          group: channel.group,
          logo: channel.logo,
          episodes: [],
          seasons: new Map<number | null, IndexedChannel[]>()
        };

      current.logo ||= channel.logo;
      current.episodes.push(channel);
      current.seasons.set(meta.seasonNumber, [...(current.seasons.get(meta.seasonNumber) || []), channel]);
      seriesMap.set(key, current);
    }

    return [...seriesMap.entries()]
      .map(([key, value]) => ({
        key,
        title: value.title,
        group: value.group,
        logo: value.logo,
        episodes: value.episodes.sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
        seasons: [...value.seasons.entries()]
          .sort(([left], [right]) => {
            if (left === null) {
              return 1;
            }

            if (right === null) {
              return -1;
            }

            return left - right;
          })
          .map(([seasonNumber, episodes]) => ({
            seasonNumber,
            label: getSeriesSeasonLabel(seasonNumber),
            episodes: [...episodes].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
          }))
      }))
      .sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
  }, [filteredChannels]);

  const activeSeries = useMemo(() => {
    if (activeTab !== "series" || !activeSeriesKey) {
      return null;
    }

    return seriesEntries.find((entry) => entry.key === activeSeriesKey) || null;
  }, [activeSeriesKey, activeTab, seriesEntries]);

  const resolvedSelectedId = useMemo(() => {
    if (activeTab !== "series") {
      return selectedId;
    }

    if (!activeSeries || !selectedId) {
      return null;
    }

    return activeSeries.episodes.some((episode) => episode.id === selectedId) ? selectedId : null;
  }, [activeSeries, activeTab, selectedId]);

  const selectedChannel = resolvedSelectedId ? catalogIndex.byId.get(resolvedSelectedId) || null : null;
  const playingChannel = playingId ? catalogIndex.byId.get(playingId) || null : null;

  const focusedSeason = useMemo(() => {
    if (!activeSeries) {
      return null;
    }

    const selectedEpisodeSeason =
      selectedChannel?.catalog === "series"
        ? activeSeries.seasons.find((season) => season.episodes.some((episode) => episode.id === selectedChannel.id))
        : null;

    if (selectedEpisodeSeason) {
      return selectedEpisodeSeason;
    }

    if (activeSeasonNumber !== null) {
      return activeSeries.seasons.find((season) => season.seasonNumber === activeSeasonNumber) || activeSeries.seasons[0];
    }

    return activeSeries.seasons[0] || null;
  }, [activeSeasonNumber, activeSeries, selectedChannel]);

  const isWideCatalogFocus = activePanel === "catalog" && (activeTab === "movie" || activeTab === "series");

  const totalVirtualHeight = filteredChannels.length * CHANNEL_ROW_HEIGHT;
  const virtualStartIndex = Math.max(0, Math.floor(listScrollTop / CHANNEL_ROW_HEIGHT) - CHANNEL_LIST_OVERSCAN);
  const virtualVisibleCount =
    Math.ceil(CHANNEL_LIST_HEIGHT / CHANNEL_ROW_HEIGHT) + CHANNEL_LIST_OVERSCAN * 2;
  const virtualEndIndex = Math.min(filteredChannels.length, virtualStartIndex + virtualVisibleCount);
  const visibleChannels = filteredChannels.slice(virtualStartIndex, virtualEndIndex);
  const topSpacerHeight = virtualStartIndex * CHANNEL_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, totalVirtualHeight - virtualEndIndex * CHANNEL_ROW_HEIGHT);
  const mediaGridColumns =
    activeTab === "live"
      ? gridColumns
      : (activeTab === "movie" || activeTab === "series") && isWideCatalogFocus
        ? Math.max(2, gridColumns)
        : Math.max(1, Math.min(gridColumns, 2));
  const mediaGridRowCountAdjusted = Math.ceil(filteredChannels.length / mediaGridColumns);
  const mediaGridTotalHeight = mediaGridRowCountAdjusted * MEDIA_GRID_CARD_HEIGHT;
  const mediaGridStartRow = Math.max(0, Math.floor(listScrollTop / MEDIA_GRID_CARD_HEIGHT) - MEDIA_GRID_OVERSCAN);
  const mediaGridVisibleRows =
    Math.ceil(CHANNEL_LIST_HEIGHT / MEDIA_GRID_CARD_HEIGHT) + MEDIA_GRID_OVERSCAN * 2;
  const mediaGridEndRow = Math.min(mediaGridRowCountAdjusted, mediaGridStartRow + mediaGridVisibleRows);
  const mediaGridVisibleChannels = filteredChannels.slice(
    mediaGridStartRow * mediaGridColumns,
    mediaGridEndRow * mediaGridColumns
  );
  const mediaGridTopSpacerHeight = mediaGridStartRow * MEDIA_GRID_CARD_HEIGHT;
  const mediaGridBottomSpacerHeight = Math.max(0, mediaGridTotalHeight - mediaGridEndRow * MEDIA_GRID_CARD_HEIGHT);
  const itemBrowserCount = activeTab === "series" ? seriesEntries.length : filteredChannels.length;

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

  const liveProgramsByChannel = useMemo(() => {
    const entries = new Map<string, EPGProgram[]>();
    const liveChannels = filteredChannels.filter((channel) => channel.catalog === "live");

    liveChannels.forEach((channel, index) => {
      const realPrograms = getProgramsForChannel(epgIndex, channel.tvgId, channel.name);
      entries.set(channel.id, realPrograms.length ? realPrograms : buildMockProgramsForChannel(channel, index));
    });

    return entries;
  }, [epgIndex, filteredChannels]);

  const effectiveSelectedPrograms = useMemo(() => {
    if (activeTab === "live" && selectedChannel) {
      return liveProgramsByChannel.get(selectedChannel.id) || [];
    }

    return selectedPrograms;
  }, [activeTab, liveProgramsByChannel, selectedChannel, selectedPrograms]);

  const { currentProgram, upcomingPrograms } = useMemo(() => {
    return getCurrentAndNextPrograms(effectiveSelectedPrograms);
  }, [effectiveSelectedPrograms]);

  const liveCategoryLabel = activeGroup === "all" ? "Todos" : activeGroup;

  const liveGuideSlots = useMemo(
    () => Array.from({ length: 6 }, (_, index) => guideBaseTime + index * 30 * 60 * 1000),
    [guideBaseTime]
  );

  const liveGuideRows = useMemo(() => {
    if (activeTab !== "live") {
      return [];
    }

    const windowStart = liveGuideSlots[0] || guideBaseTime;
    const windowEnd = (liveGuideSlots[liveGuideSlots.length - 1] || windowStart) + 30 * 60 * 1000;

    return filteredChannels
      .filter((channel) => channel.catalog === "live")
      .slice(0, 18)
      .map((channel) => {
        const programs = (liveProgramsByChannel.get(channel.id) || []).filter(
          (program) => program.end > windowStart && program.start < windowEnd
        );

        const cells = programs.map((program) => {
          const startIndex = Math.max(0, Math.floor((program.start - windowStart) / (30 * 60 * 1000)));
          const endIndex = Math.max(startIndex + 1, Math.ceil((program.end - windowStart) / (30 * 60 * 1000)));

          return {
            key: `${channel.id}-${program.start}`,
            program,
            startIndex,
            span: Math.max(1, Math.min(liveGuideSlots.length - startIndex, endIndex - startIndex))
          };
        });

        return {
          channel,
          cells
        };
      });
  }, [activeTab, filteredChannels, guideBaseTime, liveGuideSlots, liveProgramsByChannel]);

  useEffect(() => {
    if (activeTab !== "live" || liveViewMode !== "guide" || typeof document === "undefined") {
      return;
    }

    const rowIndex = Math.min(liveGuideFocus.row, Math.max(0, liveGuideRows.length - 1));
    const row = liveGuideRows[rowIndex];

    if (!row) {
      return;
    }

    const columnIndex = Math.min(liveGuideFocus.column, Math.max(0, row.cells.length - 1));
    document.querySelector<HTMLButtonElement>(`[data-guide-cell="${rowIndex}-${columnIndex}"]`)?.focus();
  }, [activeTab, liveGuideFocus, liveGuideRows, liveViewMode]);

  const selectedDescription = useMemo(() => {
    return getCatalogDescription(selectedChannel, currentProgram?.description);
  }, [currentProgram?.description, selectedChannel]);
  const focusedMovie = activeTab === "movie" ? selectedChannel : null;
  const focusedSeries = activeTab === "series" ? activeSeries : null;
  const isFocusedMediaDetail = Boolean(focusedMovie || focusedSeries);
  const currentPlayerChannel = activeTab === "live" ? selectedChannel : null;
  const showLiveGuide = activeTab === "live" && liveViewMode === "guide";
  const focusedMovieMeta = focusedMovie ? buildDetailMetadata(focusedMovie.name, focusedMovie.group) : null;
  const focusedSeriesMeta = focusedSeries ? buildDetailMetadata(focusedSeries.title, focusedSeries.group) : null;
  const heroBackdrop =
    (focusedMovie?.logo || focusedSeries?.logo || selectedChannel?.logo || HOME_HERO.image);

  const dashboardRails = useMemo<HomeRail[]>(() => {
    const buildItem = (channel: IndexedChannel): HomeRailItem => ({
      id: channel.id,
      title: channel.name,
      subtitle: channel.group || getCatalogLabel(channel.catalog),
      image: channel.logo || HOME_HERO.image,
      aspect: channel.catalog === "live" ? "wide" : "poster",
      target: channel.catalog
    });

    const recentLive = recentChannels.filter((channel) => channel.catalog === "live").slice(0, 12).map(buildItem);
    const featuredMovies = catalogIndex.byCatalog.movie.slice(0, 12).map(buildItem);
    const featuredSeries = seriesEntries.slice(0, 12).map((entry) => ({
      id: entry.key,
      title: entry.title,
      subtitle: `${entry.seasons.length} temporadas`,
      image: entry.logo || HOME_HERO.image,
      aspect: "poster" as const,
      target: "series" as const
    }));

    return [
      { ...HOME_RAILS_MOCK[0], items: recentLive.length ? recentLive : [...HOME_RAILS_MOCK[0].items] },
      { ...HOME_RAILS_MOCK[1] },
      { ...HOME_RAILS_MOCK[2], items: featuredMovies.length ? featuredMovies : [...HOME_RAILS_MOCK[2].items] },
      { ...HOME_RAILS_MOCK[3], items: featuredSeries.length ? featuredSeries : [...HOME_RAILS_MOCK[3].items] }
    ];
  }, [catalogIndex.byCatalog.movie, recentChannels, seriesEntries]);

  function rememberRecentChannel(channel: IPTVChannel | null) {
    if (!channel) {
      return;
    }

    const channelId = getChannelStorageId(channel);
    setRecentIds((current) => [channelId, ...current.filter((item) => item !== channelId)].slice(0, 8));
  }

  function selectChannel(channel: IPTVChannel | null) {
    if (channel) {
      setActivePanel("catalog");
      setActiveTab(channel.catalog);
      setActiveGroup(channel.group || getPreferredGroup(channels, channel.catalog));
    }

    setSelectedId(channel?.id ?? null);

    if (channel?.catalog === "series") {
      setActiveSeriesKey(getSeriesKey(channel));
      const matchedSeason = seriesEntries
        .find((entry) => entry.key === getSeriesKey(channel))
        ?.seasons.find((season) => season.episodes.some((episode) => episode.id === channel.id));
      setActiveSeasonNumber(matchedSeason?.seasonNumber ?? null);
      setPlayingId(null);
    } else if (channel?.catalog === "live") {
      setPlayingId(channel.id);
    } else {
      setPlayingId(null);
    }

    rememberRecentChannel(channel);
  }

  function chooseInitialTab(nextChannels: IPTVChannel[]) {
    if (nextChannels.some((channel) => channel.catalog === activeTab)) {
      return activeTab;
    }

    return nextChannels[0]?.catalog || "live";
  }

  function hydratePlaylistFields(playlist: SavedPlaylist, content?: string) {
    setPlaylistInput(playlist.source === "text" ? content || playlist.content || "" : "");
    setPlaylistUrl(playlist.url);
    setPlaylistEpgUrl(playlist.epgUrl || "");
    setPlaylistName(playlist.name);
    setEditingPlaylistId(null);
  }

  function applyLoadedChannels(nextChannels: IPTVChannel[], nextStatus: string, playlistId?: string | null) {
    const preferredTab = chooseInitialTab(nextChannels);
    const preferredGroup = getPreferredGroup(nextChannels, preferredTab);

    setChannels(nextChannels);
    setActiveTab(preferredTab);
    setActiveGroup(preferredGroup);
    setQuery("");
    setListScrollTop(0);
    setStatus(nextStatus);
    setError(null);
    setActivePlaylistId(playlistId ?? null);
    setActivePanel("catalog");
    setSelectedId(null);
    setActiveSeriesKey(null);
    setActiveSeasonNumber(null);
    setPlayingId(null);
  }

  function cacheLoadedPlaylist(playlistId: string, nextChannels: IPTVChannel[]) {
    const cacheResult = writePlaylistCache(playlistId, nextChannels);
    void saveBackendPlaylistSnapshot(playlistId, nextChannels);
    return cacheResult.ok;
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
    setActivePanel("catalog");
    setActiveGroup(getPreferredGroup(nextTabChannels, nextTab));
    if (nextTab === "live") {
      setLiveViewMode("browse");
    }
    setLiveGuideFocus({ row: 0, column: 0 });
    setQuery("");
    setListScrollTop(0);
    setSelectedId(null);
    setActiveSeriesKey(null);
    setActiveSeasonNumber(null);
    setPlayingId(null);
  }

  function openMoviePlayback() {
    if (selectedChannel?.catalog === "movie") {
      setPlayingId(selectedChannel.id);
    }
  }

  function openSeriesPlayback() {
    if (selectedChannel?.catalog === "series") {
      setPlayingId(selectedChannel.id);
    }
  }

  function handleTrailerIntent(title: string) {
    setStatus(`Trailer de ${title} indisponivel nesta playlist.`);
  }

  function closeFocusedCatalogView() {
    setSelectedId(null);
    setPlayingId(null);

    if (activeTab === "series") {
      setActiveSeriesKey(null);
      setActiveSeasonNumber(null);
    }
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
    setActivePanel("playlists");
  }

  function openPanel(panel: HomePanel) {
    setActivePanel(panel);
  }

  function openCatalogPanel(tab: CatalogTab) {
    switchTab(tab);
    setActivePanel("catalog");
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

      cacheLoadedPlaylist(playlistRecord.id, parsedChannels);

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

  async function loadSavedPlaylist(playlist: SavedPlaylist, options?: { restoreOnBoot?: boolean; preferCache?: boolean }) {
    setLoading(true);
    setError(null);

    try {
      const localCachedPlaylist = options?.preferCache ? readPlaylistCache(playlist.id) : null;
      const cachedChannels =
        localCachedPlaylist?.channels.length
          ? localCachedPlaylist.channels
          : options?.preferCache
            ? await fetchBackendPlaylistSnapshot(playlist.id)
            : null;

      if (cachedChannels?.length) {
        if (!localCachedPlaylist?.channels.length) {
          writePlaylistCache(playlist.id, cachedChannels);
        }

        hydratePlaylistFields(playlist, playlist.content);
        applyLoadedChannels(
          cachedChannels,
          options?.restoreOnBoot
            ? `Playlist ${playlist.name} restaurada automaticamente.`
            : `Playlist ${playlist.name} aberta do cache salvo.`,
          playlist.id
        );

        if (playlist.epgUrl) {
          void loadEPG(playlist.epgUrl).catch(() => {
            setEpgIndex(null);
          });
        } else {
          setEpgIndex(null);
        }

        return;
      }

      const content = playlist.source === "url" ? await fetchRemoteText(playlist.url) : playlist.content || "";
      const parsedChannels = await validateAndParsePlaylist(content);

      if (playlist.epgUrl) {
        await loadEPG(playlist.epgUrl);
      } else {
        setEpgIndex(null);
      }

      cacheLoadedPlaylist(playlist.id, parsedChannels);
      hydratePlaylistFields(playlist, content);
      applyLoadedChannels(
        parsedChannels,
        options?.restoreOnBoot ? `Playlist ${playlist.name} restaurada automaticamente.` : `Playlist ${playlist.name} carregada.`,
        playlist.id
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao abrir a playlist.");
    } finally {
      setLoading(false);
    }
  }

  function openSavedPlaylist(playlist: SavedPlaylist) {
    void loadSavedPlaylist(playlist, { preferCache: true });
  }

  const restorePlaylistOnBoot = useEffectEvent((playlist: SavedPlaylist) => {
    void loadSavedPlaylist(playlist, { restoreOnBoot: true, preferCache: true });
  });

  useEffect(() => {
    if (restoredPlaylistRef.current) {
      return;
    }

    if (channels.length && activePlaylistId) {
      restoredPlaylistRef.current = true;
      return;
    }

    restoredPlaylistRef.current = true;

    if (!savedPlaylists.length || !activePlaylistId) {
      return;
    }

    const playlistToRestore = savedPlaylists.find((playlist) => playlist.id === activePlaylistId);

    if (!playlistToRestore) {
      removeStorage(ACTIVE_PLAYLIST_STORAGE_KEY);
      return;
    }

    const restoreTimer = window.setTimeout(() => {
      restorePlaylistOnBoot(playlistToRestore);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [activePlaylistId, channels.length, savedPlaylists]);

  function deletePlaylist(playlistId: string) {
    const playlistToRemove = savedPlaylists.find((playlist) => playlist.id === playlistId);

    setSavedPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
    removeStorage(getPlaylistCacheStorageKey(playlistId));
    void deleteBackendPlaylistSnapshot(playlistId);

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

  function openSidebarTarget(target: "home" | "live" | "movie" | "series" | "favorites" | "epg" | "settings") {
    if (target === "home") {
      setActivePanel("none");
      setPlayingId(null);
      return;
    }

    if (target === "settings") {
      openPanel("settings");
      return;
    }

    if (target === "favorites") {
      const favorite = favoriteChannels[0] || null;

      if (favorite) {
        selectChannel(favorite);
        return;
      }

      openCatalogPanel("movie");
      return;
    }

    if (target === "epg") {
      openCatalogPanel("live");
      if (catalogIndex.byCatalog.live[0]) {
        selectChannel(catalogIndex.byCatalog.live[0]);
      }
      return;
    }

    openCatalogPanel(target);
  }

  function openHomeRailItem(item: HomeRailItem) {
    openCatalogPanel(item.target);
  }

  return (
    <main className={`iptv-shell assist-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`assist-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="assist-sidebar-top">
          <button type="button" className="assist-brand" onClick={() => openSidebarTarget("home")}>
            <span className="assist-brand-badge">A+</span>
            {!sidebarCollapsed ? <strong>Assist+</strong> : null}
          </button>
          <button
            type="button"
            className="assist-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
        </div>

        <nav className="assist-nav">
          {[
            { key: "home", label: "Inicio", icon: "home" },
            { key: "live", label: "TV ao Vivo", icon: "live" },
            { key: "movie", label: "Filmes", icon: "movie" },
            { key: "series", label: "Series", icon: "series" },
            { key: "favorites", label: "Favoritos", icon: "favorites" },
            { key: "epg", label: "Guia EPG", icon: "epg" },
            { key: "settings", label: "Configuracoes", icon: "settings" }
          ].map((item) => {
            const isActive =
              (item.key === "home" && activePanel === "none") ||
              (item.key === "live" && activePanel === "catalog" && activeTab === "live") ||
              (item.key === "movie" && activePanel === "catalog" && activeTab === "movie") ||
              (item.key === "series" && activePanel === "catalog" && activeTab === "series") ||
              (item.key === "settings" && activePanel === "settings");

            return (
              <button
                key={item.key}
                type="button"
                className={`assist-nav-item ${isActive ? "active" : ""}`}
                onClick={() => openSidebarTarget(item.key as "home" | "live" | "movie" | "series" | "favorites" | "epg" | "settings")}
              >
                <span className="launch-icon">
                  <LaunchIcon kind={item.icon as "home" | "live" | "movie" | "series" | "favorites" | "epg" | "settings"} />
                </span>
                {!sidebarCollapsed ? <span>{item.label}</span> : null}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed ? (
          <div className="assist-sidebar-foot">
            <button type="button" className="assist-playlist-chip" onClick={() => openPanel("playlists")}>
              <strong>{savedPlaylists.length}</strong>
              <span>Playlists</span>
            </button>
            <small>{activePlaylist?.name || "Sem playlist ativa"}</small>
          </div>
        ) : null}
      </aside>

      <div className="assist-content">
        <section className="assist-home-screen card">
          <div className="assist-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(7,10,16,0.92), rgba(7,10,16,0.42)), url(${heroBackdrop})` }}>
            <div className="assist-hero-copy">
              <p className="eyebrow">{HOME_HERO.eyebrow}</p>
              <h1>{HOME_HERO.title}</h1>
              <p>{HOME_HERO.description}</p>
              <div className="assist-hero-actions">
                <button type="button" onClick={() => (activePlaylist ? openCatalogPanel("movie") : openPanel("playlists"))}>
                  Assistir Agora
                </button>
                <button type="button" className="ghost-button" onClick={() => openCatalogPanel("series")}>
                  Trailer
                </button>
              </div>
            </div>
            <div className="assist-hero-status">
              <article>
                <span>Playlist</span>
                <strong>{activePlaylist?.name || "Demo visual"}</strong>
              </article>
              <article>
                <span>Status</span>
                <strong>{status}</strong>
              </article>
            </div>
          </div>

          <div className="assist-rails">
            {dashboardRails.map((rail) => (
              <section key={rail.id} className="assist-rail">
                <div className="assist-rail-head">
                  <h2>{rail.title}</h2>
                  <span>{rail.items.length} itens</span>
                </div>
                <div className="assist-rail-track">
                  {rail.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`assist-rail-card ${item.aspect === "wide" ? "wide" : "poster"}`}
                      onClick={() => openHomeRailItem(item)}
                    >
                      <div className="assist-rail-art">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image} alt={item.title} loading="lazy" />
                      </div>
                      <div className="assist-rail-copy">
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

      <section className={`iptv-layout ${isWideCatalogFocus ? "catalog-focus-layout" : ""}`}>
        {!isWideCatalogFocus ? (
        <aside className="iptv-sidebar card">
          <div className="panel-heading">
            <h2>{getPanelTitle(activePanel)}</h2>
            <p>
              {activePanel === "settings"
                ? "Codigo, usuario e senha ficam salvos localmente neste navegador."
                : activePanel === "playlists"
                  ? "Crie, edite, carregue e apague playlists sem depender de demos."
                  : activePanel === "catalog"
                    ? "Favoritos e recentes da aba atual."
                    : "Escolha um card acima para abrir o painel desejado."}
            </p>
          </div>

          {activePanel === "settings" ? (
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
          ) : null}

          {activePanel === "playlists" ? (
          <>

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
                    <button type="button" className="mini-action" onClick={() => openSavedPlaylist(playlist)}>
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
          </>
          ) : null}

          {activePanel === "catalog" ? (
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
          ) : null}

          {activePanel === "none" ? (
            <div className="empty-state">
              <strong>Nenhum painel aberto.</strong>
              <span>Use os cards da home para abrir catalogo, playlists ou settings.</span>
            </div>
          ) : null}
        </aside>
        ) : null}

        <section className={`iptv-main ${isWideCatalogFocus ? "catalog-focus-main" : ""}`}>
          {activePanel === "catalog" ? (
          <>
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

          {currentPlayerChannel && activeTab !== "live" ? (
            <div className="card player-card">
              <IPTVPlayer channel={currentPlayerChannel} />
            </div>
          ) : null}

          {!isWideCatalogFocus ? (
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
          ) : null}

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
                    setLiveGuideFocus({ row: 0, column: 0 });
                  }}
                />
                {activeTab === "live" ? (
                  <div className="view-toggle-group">
                    <button
                      type="button"
                      className={liveViewMode === "browse" ? "active" : ""}
                      onClick={() => {
                        setLiveViewMode("browse");
                        setLiveGuideFocus({ row: 0, column: 0 });
                      }}
                    >
                      Lista
                    </button>
                    <button
                      type="button"
                      className={liveViewMode === "guide" ? "active" : ""}
                      onClick={() => {
                        setLiveViewMode("guide");
                        setLiveGuideFocus({ row: 0, column: 0 });
                      }}
                    >
                      Modo Guia
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`browser-layout ${isWideCatalogFocus ? "browser-layout-movie" : ""} ${
                activeTab === "live" ? "browser-layout-live" : ""
              } ${
                isFocusedMediaDetail ? "browser-layout-detail" : ""
              }`}
            >
              {!isFocusedMediaDetail ? (
              <div className="category-column">
                <div className="browser-titlebar">
                  <strong>Categorias</strong>
                  <span>{categoryBrowserEntries.length}</span>
                </div>

                <div className="category-list">
                  {categoryBrowserEntries.map((entry) => (
                    <button
                      key={entry.group}
                      type="button"
                      className={`category-item ${activeGroup === entry.group ? "active" : ""}`}
                      onClick={() => {
                        setActiveGroup(entry.group);
                        setListScrollTop(0);
                        setLiveGuideFocus({ row: 0, column: 0 });
                      }}
                    >
                      <strong>{entry.group}</strong>
                      <span>{entry.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              <div className="items-column">
                <div className="browser-titlebar">
                  <strong>{activeTab === "live" ? liveCategoryLabel : activeGroup === "all" ? "Todos os grupos" : activeGroup}</strong>
                  <span>{itemBrowserCount}</span>
                </div>

                {activeTab === "live" ? (
                  showLiveGuide ? (
                    <div className="live-guide-shell" tabIndex={0}>
                      <div className="live-guide-header">
                        <div className="live-guide-channel-label">Canais</div>
                        <div className="live-guide-times">
                          {liveGuideSlots.map((slot) => (
                            <span key={slot}>{formatGuideTick(slot)}</span>
                          ))}
                        </div>
                      </div>

                      <div className="live-guide-grid">
                        {liveGuideRows.map((row, rowIndex) => (
                          <div key={row.channel.id} className="live-guide-row">
                            <button type="button" className="live-guide-channel" onClick={() => selectChannel(row.channel)}>
                              {row.channel.logo ? (
                                <span className="media-thumb live-thumb">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={row.channel.logo} alt={row.channel.name} loading="lazy" />
                                </span>
                              ) : null}
                              <div>
                                <strong>{row.channel.name}</strong>
                                <span>{getChannelNumber(row.channel)}</span>
                              </div>
                            </button>

                            <div className="live-guide-program-row">
                              {row.cells.length ? (
                                row.cells.map((cell, cellIndex) => (
                                  <button
                                    key={cell.key}
                                    type="button"
                                    data-guide-cell={`${rowIndex}-${cellIndex}`}
                                    className={`live-guide-program ${
                                      rowIndex === liveGuideFocus.row && cellIndex === liveGuideFocus.column ? "active" : ""
                                    }`}
                                    style={{ gridColumn: `${cell.startIndex + 1} / span ${cell.span}` }}
                                    onClick={() => {
                                      setLiveGuideFocus({ row: rowIndex, column: cellIndex });
                                      selectChannel(row.channel);
                                    }}
                                    onFocus={() => selectChannel(row.channel)}
                                    onKeyDown={(event) => {
                                      if (event.key === "ArrowRight") {
                                        event.preventDefault();
                                        setLiveGuideFocus((current) => ({
                                          row: current.row,
                                          column: Math.min(current.column + 1, row.cells.length - 1)
                                        }));
                                      } else if (event.key === "ArrowLeft") {
                                        event.preventDefault();
                                        setLiveGuideFocus((current) => ({
                                          row: current.row,
                                          column: Math.max(current.column - 1, 0)
                                        }));
                                      } else if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        setLiveGuideFocus((current) => {
                                          const nextRow = Math.min(current.row + 1, liveGuideRows.length - 1);
                                          return {
                                            row: nextRow,
                                            column: Math.min(
                                              current.column,
                                              Math.max(0, (liveGuideRows[nextRow]?.cells.length || 1) - 1)
                                            )
                                          };
                                        });
                                      } else if (event.key === "ArrowUp") {
                                        event.preventDefault();
                                        setLiveGuideFocus((current) => {
                                          const nextRow = Math.max(current.row - 1, 0);
                                          return {
                                            row: nextRow,
                                            column: Math.min(
                                              current.column,
                                              Math.max(0, (liveGuideRows[nextRow]?.cells.length || 1) - 1)
                                            )
                                          };
                                        });
                                      }
                                    }}
                                  >
                                    <strong>{cell.program.title}</strong>
                                    <span>{formatProgramTimeRange(cell.program)}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="live-guide-empty">Sem grade</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {liveGuideRows.length === 0 ? (
                        <div className="empty-state">
                          <strong>Nenhum canal encontrado.</strong>
                          <span>Troque de categoria ou refine a busca.</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                  <div className="channel-list live-channel-list" onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
                  <div style={{ height: topSpacerHeight }} aria-hidden="true" />
                  {visibleChannels.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      className={`channel-item live-channel-item ${channel.id === selectedChannel?.id ? "active" : ""}`}
                      onClick={() => selectChannel(channel)}
                    >
                      <div className="channel-copy">
                        {channel.logo ? (
                          <span className="media-thumb live-thumb">
                            {/* Arbitrary playlist logos come from unknown remote domains. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={channel.logo} alt={channel.name} loading="lazy" />
                          </span>
                        ) : null}
                        <div>
                          <strong>{channel.name}</strong>
                          <span>{channel.group || "Sem categoria"}</span>
                          <small>{getCurrentAndNextPrograms(liveProgramsByChannel.get(channel.id) || []).currentProgram?.title || "Programacao demonstrativa"}</small>
                        </div>
                      </div>
                      <div className="live-channel-meta">
                        <div className="live-now-card">
                          <span>
                            {(() => {
                              const liveNow = getCurrentAndNextPrograms(liveProgramsByChannel.get(channel.id) || []).currentProgram;
                              return liveNow ? formatProgramTimeRange(liveNow) : "Ao vivo";
                            })()}
                          </span>
                          <strong>
                            {(() => {
                              const liveNow = getCurrentAndNextPrograms(liveProgramsByChannel.get(channel.id) || []).currentProgram;
                              return liveNow?.title || channel.name;
                            })()}
                          </strong>
                          <div className="live-progress-bar">
                            <span
                              style={{
                                width: `${getProgramProgress(
                                  getCurrentAndNextPrograms(liveProgramsByChannel.get(channel.id) || []).currentProgram
                                )}%`
                              }}
                            />
                          </div>
                          <small>
                            {(() => {
                              const liveUpcoming = getCurrentAndNextPrograms(liveProgramsByChannel.get(channel.id) || []).upcomingPrograms;
                              return liveUpcoming[0] ? `Proximo: ${liveUpcoming[0].title}` : "EPG mock ativo";
                            })()}
                          </small>
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
                  ) 
                ) : activeTab === "movie" && focusedMovie ? (
                  <div
                    className={`focused-media-screen cinematic-detail-screen ${
                      focusedMovie.logo ? "has-backdrop" : ""
                    }`}
                    style={
                      focusedMovie.logo
                        ? { backgroundImage: `linear-gradient(90deg, rgba(3,5,9,0.96) 0%, rgba(3,5,9,0.82) 38%, rgba(3,5,9,0.36) 100%), linear-gradient(0deg, rgba(3,5,9,0.98) 0%, rgba(3,5,9,0.12) 54%), url(${focusedMovie.logo})` }
                        : undefined
                    }
                  >
                    <button type="button" className="ghost-button focused-back" onClick={closeFocusedCatalogView}>
                      Voltar para filmes
                    </button>
                    {playingChannel?.id === focusedMovie.id ? (
                      <div className="card inline-player-card">
                        <IPTVPlayer channel={playingChannel} />
                      </div>
                    ) : (
                      <div className="cinematic-detail-layout">
                        <div className="cinematic-copy">
                          <span className="cinematic-kicker">Filme em destaque</span>
                          <h1>{focusedMovie.name}</h1>
                          <div className="cinematic-meta">
                            <span>{focusedMovieMeta?.year}</span>
                            <span>{focusedMovieMeta?.duration}</span>
                            <span>{focusedMovieMeta?.rating}+</span>
                            <span>{focusedMovieMeta?.genre}</span>
                          </div>
                          <p className="cinematic-synopsis">{buildMovieSynopsis(focusedMovie)}</p>
                          <div className="cinematic-credits">
                            <small><strong>Elenco:</strong> {focusedMovieMeta?.cast}</small>
                            <small><strong>Direcao:</strong> {focusedMovieMeta?.director}</small>
                          </div>
                          <div className="cinematic-actions">
                            <button type="button" className="cinematic-primary" onClick={openMoviePlayback}>
                              Assistir
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleTrailerIntent(focusedMovie.name)}
                            >
                              Trailer
                            </button>
                            <button
                              type="button"
                              className={`ghost-button ${
                                favoriteIds.includes(getChannelStorageId(focusedMovie)) ? "active-chip" : ""
                              }`}
                              onClick={() => toggleFavorite(focusedMovie)}
                            >
                              + Favoritos
                            </button>
                          </div>
                        </div>

                        <div className="cinematic-poster-rail">
                          <div className={`focused-media-poster compact-poster ${focusedMovie.logo ? "has-image" : ""}`}>
                            {focusedMovie.logo ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={focusedMovie.logo} alt={focusedMovie.name} loading="lazy" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeTab === "series" && focusedSeries ? (
                  <div
                    className={`focused-media-screen focused-series-screen cinematic-detail-screen ${
                      focusedSeries.logo ? "has-backdrop" : ""
                    }`}
                    style={
                      focusedSeries.logo
                        ? { backgroundImage: `linear-gradient(90deg, rgba(3,5,9,0.97) 0%, rgba(3,5,9,0.84) 36%, rgba(3,5,9,0.4) 100%), linear-gradient(0deg, rgba(3,5,9,0.98) 0%, rgba(3,5,9,0.1) 54%), url(${focusedSeries.logo})` }
                        : undefined
                    }
                  >
                    <button type="button" className="ghost-button focused-back" onClick={closeFocusedCatalogView}>
                      Voltar para series
                    </button>
                    {playingChannel?.id === selectedChannel?.id && selectedChannel?.catalog === "series" ? (
                      <div className="card inline-player-card">
                        <IPTVPlayer channel={playingChannel} />
                      </div>
                    ) : (
                      <div className="cinematic-detail-layout cinematic-series-layout">
                        <div className="cinematic-copy">
                          <span className="cinematic-kicker">Serie premium</span>
                          <h1>{focusedSeries.title}</h1>
                          <div className="cinematic-meta">
                            <span>{focusedSeriesMeta?.year}</span>
                            <span>{focusedSeries.seasons.length} temporadas</span>
                            <span>{focusedSeries.episodes.length} episodios</span>
                            <span>{focusedSeriesMeta?.genre}</span>
                          </div>
                          <p className="cinematic-synopsis">{buildSeriesSynopsis(focusedSeries)}</p>
                          <div className="cinematic-credits">
                            <small><strong>Elenco:</strong> {focusedSeriesMeta?.cast}</small>
                            <small><strong>Criacao:</strong> {focusedSeriesMeta?.director}</small>
                          </div>
                          <div className="cinematic-actions">
                            <button
                              type="button"
                              className="cinematic-primary"
                              onClick={openSeriesPlayback}
                              disabled={!selectedChannel}
                            >
                              Assistir
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleTrailerIntent(focusedSeries.title)}
                            >
                              Trailer
                            </button>
                            <button
                              type="button"
                              className={`ghost-button ${
                                selectedChannel && favoriteIds.includes(getChannelStorageId(selectedChannel)) ? "active-chip" : ""
                              }`}
                              onClick={() => toggleFavorite(selectedChannel || focusedSeries.episodes[0] || null)}
                            >
                              + Favoritos
                            </button>
                          </div>
                        </div>

                        <div className="cinematic-poster-rail">
                          <div className={`focused-media-poster compact-poster ${focusedSeries.logo ? "has-image" : ""}`}>
                            {focusedSeries.logo ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={focusedSeries.logo} alt={focusedSeries.title} loading="lazy" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="series-detail-layout luxury-season-layout">
                      <div className="season-selector-panel">
                        <div className="browser-titlebar">
                          <strong>Temporada</strong>
                          <span>{focusedSeries.seasons.length} disponiveis</span>
                        </div>
                        <label className="season-select-shell">
                          <span>Selecione a temporada</span>
                          <select
                            value={String(activeSeasonNumber ?? "")}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setActiveSeasonNumber(nextValue ? Number(nextValue) : null);
                              setSelectedId(null);
                              setPlayingId(null);
                            }}
                          >
                            {focusedSeries.seasons.map((season) => (
                              <option key={season.label} value={season.seasonNumber ?? ""}>
                                {season.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="episode-list-panel">
                        <div className="browser-titlebar">
                          <strong>{focusedSeason?.label || "Episodios"}</strong>
                          <span>{focusedSeason?.episodes.length || 0}</span>
                        </div>
                        <div className="episode-list-luxury">
                          {focusedSeason ? (
                            focusedSeason.episodes.map((episode, index) => (
                              <button
                                key={episode.id}
                                type="button"
                                className={`episode-card ${episode.id === selectedChannel?.id ? "active" : ""}`}
                                onClick={() => selectChannel(episode)}
                              >
                                <div className="episode-thumb">
                                  {episode.logo || focusedSeries.logo ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={episode.logo || focusedSeries.logo} alt={episode.name} loading="lazy" />
                                  ) : null}
                                </div>
                                <div className="episode-copy">
                                  <div className="episode-topline">
                                    <strong>{String(index + 1).padStart(2, "0")}. {episode.name}</strong>
                                    <span>{buildEpisodeRuntime(episode)}</span>
                                  </div>
                                  <small>{getSeriesEpisodeLabel(episode)}</small>
                                  <p>{buildEpisodeSummary(episode, focusedSeries.title)}</p>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="empty-state">
                              <strong>Nenhuma temporada encontrada.</strong>
                              <span>Escolha outra serie para continuar.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeTab === "series" ? (
                  <div className="media-grid-shell">
                    <div
                      className="media-grid media-grid-large"
                      style={{ gridTemplateColumns: `repeat(${mediaGridColumns}, minmax(0, 1fr))` }}
                    >
                      {seriesEntries.map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          className={`media-card media-card-large media-card-featured ${
                            entry.key === activeSeries?.key ? "active" : ""
                          }`}
                          onClick={() => {
                            setActiveSeriesKey(entry.key);
                            setSelectedId(null);
                          }}
                        >
                          <div className="media-card-poster">
                            {entry.logo ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={entry.logo} alt={entry.title} loading="lazy" />
                            ) : (
                              <span className="media-card-fallback">Serie</span>
                            )}
                          </div>
                          <div className="media-card-copy">
                            <strong>{entry.title}</strong>
                            <span>{entry.group || "Sem categoria"}</span>
                            <small>{entry.seasons.length} temporadas</small>
                            <small>{entry.episodes.length} episodios</small>
                          </div>
                        </button>
                      ))}

                      {seriesEntries.length === 0 ? (
                        <div className="empty-state">
                          <strong>Nenhuma serie encontrada.</strong>
                          <span>Troque de categoria ou refine a busca.</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="media-grid-shell" onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}>
                    <div style={{ height: mediaGridTopSpacerHeight }} aria-hidden="true" />
                    <div
                      className="media-grid media-grid-large"
                      style={{ gridTemplateColumns: `repeat(${mediaGridColumns}, minmax(0, 1fr))` }}
                    >
                      {mediaGridVisibleChannels.map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          className={`media-card media-card-large media-card-featured ${
                            channel.id === selectedChannel?.id ? "active" : ""
                          }`}
                          onClick={() => selectChannel(channel)}
                        >
                          <div className="media-card-poster">
                            {channel.logo ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
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

              {!isWideCatalogFocus && !showLiveGuide ? (
              <div className="preview-column">
                <div className="browser-titlebar">
                  <strong>{activeTab === "live" ? "Preview ao vivo" : "Preview"}</strong>
                  <span>{selectedChannel ? getItemLabel(selectedChannel) : "Aguardando"}</span>
                </div>

                {activeTab === "live" && currentPlayerChannel ? (
                  <div className="card live-preview-player">
                    <IPTVPlayer
                      channel={currentPlayerChannel}
                      quickChannels={filteredChannels}
                      onChannelChange={(nextChannel) => selectChannel(nextChannel)}
                    />
                  </div>
                ) : null}

                <div className="preview-summary">
                  <article>
                    <span>{activeTab === "series" ? "Serie" : "Selecionado"}</span>
                    <strong>{activeTab === "series" ? activeSeries?.title || "Nenhuma serie" : selectedChannel?.name || "Nenhum item"}</strong>
                  </article>
                  <article>
                    <span>Categoria</span>
                    <strong>{activeTab === "series" ? activeSeries?.group || "Sem categoria" : selectedChannel?.group || "Sem categoria"}</strong>
                  </article>
                  <article>
                    <span>{activeTab === "series" ? "Temporadas" : "Formato"}</span>
                    <strong>{activeTab === "series" ? String(activeSeries?.seasons.length || 0) : selectedChannel?.type.toUpperCase() || "--"}</strong>
                  </article>
                  <article>
                    <span>{activeTab === "series" ? "Episodio atual" : "Canal"}</span>
                    <strong>{activeTab === "series" ? selectedChannel?.name || "Nenhum episodio" : getChannelNumber(selectedChannel)}</strong>
                  </article>
                </div>

                <div
                  className={`preview-poster ${
                    (activeTab === "series" ? activeSeries?.logo : selectedChannel?.logo) ? "has-image" : ""
                  } ${
                    activeTab === "series" ? (activeSeries ? "" : "is-empty") : selectedChannel ? "" : "is-empty"
                  }`}
                >
                  {activeTab === "series" ? activeSeries?.logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={activeSeries.logo} alt={activeSeries.title} loading="lazy" />
                  ) : null : selectedChannel?.logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={selectedChannel.logo} alt={selectedChannel.name} loading="lazy" />
                  ) : null}
                  <div className="preview-overlay">
                    <span>{activeTab === "series" ? "Serie" : getItemLabel(selectedChannel)}</span>
                    <strong>{activeTab === "series" ? activeSeries?.title || "Nenhuma serie" : selectedChannel?.name || "Nenhum item"}</strong>
                    <small>{activeTab === "series" ? `${activeSeries?.episodes.length || 0} episodios disponiveis` : selectedDescription}</small>
                  </div>
                </div>

                {activeTab === "series" ? (
                  <div className="epg-panel">
                    <div className="browser-titlebar">
                      <strong>Temporadas</strong>
                      <span>{activeSeries?.seasons.length || 0}</span>
                    </div>

                    {activeSeries?.seasons.length ? (
                      <div className="season-chip-row">
                        {activeSeries.seasons.map((season) => (
                          <button
                            key={season.label}
                            type="button"
                            className={`season-chip ${
                              season.episodes.some((episode) => episode.id === selectedChannel?.id) ? "active" : ""
                            }`}
                            onClick={() => selectChannel(season.episodes[0] || null)}
                          >
                            <strong>{season.label}</strong>
                            <span>{season.episodes.length} eps</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="timeline-list">
                      {activeSeries ? (
                        activeSeries.seasons.map((season) => (
                          <article key={season.label} className="series-season-block">
                            <div className="series-season-header">
                              <strong>{season.label}</strong>
                              <span>{season.episodes.length} episodios</span>
                            </div>
                            <div className="series-episode-list">
                              {season.episodes.map((episode) => (
                                <button
                                  key={episode.id}
                                  type="button"
                                  className={`timeline-item ${episode.id === selectedChannel?.id ? "active" : ""}`}
                                  onClick={() => selectChannel(episode)}
                                >
                                  <span className="timeline-dot" />
                                  <div>
                                    <strong>{episode.name}</strong>
                                    <small>{getSeriesEpisodeLabel(episode)}</small>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty-state">
                          <strong>Nenhuma serie selecionada.</strong>
                          <span>Clique em um card para abrir as temporadas dentro dela.</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

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
                      <div className="live-progress-bar">
                        <span style={{ width: `${getProgramProgress(currentProgram)}%` }} />
                      </div>
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
              ) : null}
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
          </>
          ) : (
            <div className="card details-card">
              <div className="detail-grid">
                <article>
                  <span>Painel ativo</span>
                  <strong>{getPanelTitle(activePanel)}</strong>
                </article>
                <article>
                  <span>Playlist ativa</span>
                  <strong>{activePlaylist?.name || "Nenhuma"}</strong>
                </article>
                <article>
                  <span>Status</span>
                  <strong>{status}</strong>
                </article>
                <article>
                  <span>Codigo ativo</span>
                  <strong>{accessProfile.code.trim() || "Nao definido"}</strong>
                </article>
                <article>
                  <span>Favoritos</span>
                  <strong>{favoriteChannels.length}</strong>
                </article>
                <article>
                  <span>Recentes</span>
                  <strong>{recentChannels.length}</strong>
                </article>
              </div>
            </div>
          )}
        </section>
      </section>
      </div>
    </main>
  );
}
