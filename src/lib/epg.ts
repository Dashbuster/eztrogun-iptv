export type EPGProgram = {
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  start: number;
  end: number;
};

export type EPGIndex = {
  byChannelId: Map<string, EPGProgram[]>;
  byChannelName: Map<string, EPGProgram[]>;
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseXmltvDate(value: string) {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4}|Z)?$/);

  if (!match) {
    return Number.NaN;
  }

  const [, year, month, day, hour, minute, second, timezone] = match;
  const baseUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  if (!timezone || timezone === "Z") {
    return baseUtc;
  }

  const signal = timezone.startsWith("-") ? -1 : 1;
  const offsetHours = Number(timezone.slice(1, 3));
  const offsetMinutes = Number(timezone.slice(3, 5));
  const offsetMs = signal * ((offsetHours * 60 + offsetMinutes) * 60 * 1000);

  return baseUtc - offsetMs;
}

export function parseXmltv(content: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(content, "text/xml");
  const parserError = xml.querySelector("parsererror");

  if (parserError) {
    throw new Error("Nao foi possivel interpretar o XMLTV/EPG informado.");
  }

  const programs: EPGProgram[] = [];

  for (const programme of xml.querySelectorAll("programme")) {
    const channelId = programme.getAttribute("channel")?.trim() || "";
    const title = programme.querySelector("title")?.textContent?.trim() || "";
    const description = programme.querySelector("desc")?.textContent?.trim() || "";
    const channelName = programme.querySelector("display-name")?.textContent?.trim() || "";
    const start = parseXmltvDate(programme.getAttribute("start") || "");
    const end = parseXmltvDate(programme.getAttribute("stop") || "");

    if (!channelId || !title || Number.isNaN(start) || Number.isNaN(end)) {
      continue;
    }

    programs.push({
      channelId,
      channelName,
      title,
      description,
      start,
      end
    });
  }

  return programs.sort((left, right) => left.start - right.start);
}

export function createEPGIndex(programs: EPGProgram[]): EPGIndex {
  const byChannelId = new Map<string, EPGProgram[]>();
  const byChannelName = new Map<string, EPGProgram[]>();

  for (const program of programs) {
    const normalizedId = normalizeKey(program.channelId);
    const normalizedName = normalizeKey(program.channelName);

    if (normalizedId) {
      byChannelId.set(normalizedId, [...(byChannelId.get(normalizedId) || []), program]);
    }

    if (normalizedName) {
      byChannelName.set(normalizedName, [...(byChannelName.get(normalizedName) || []), program]);
    }
  }

  return {
    byChannelId,
    byChannelName
  };
}

export function getProgramsForChannel(index: EPGIndex | null, channelId?: string, channelName?: string) {
  if (!index) {
    return [];
  }

  const normalizedId = channelId ? normalizeKey(channelId) : "";
  const normalizedName = channelName ? normalizeKey(channelName) : "";

  if (normalizedId && index.byChannelId.has(normalizedId)) {
    return index.byChannelId.get(normalizedId) || [];
  }

  if (normalizedName && index.byChannelName.has(normalizedName)) {
    return index.byChannelName.get(normalizedName) || [];
  }

  return [];
}

export function formatProgramTimeRange(program: EPGProgram) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${formatter.format(program.start)} - ${formatter.format(program.end)}`;
}

export function getCurrentAndNextPrograms(programs: EPGProgram[], now = Date.now()) {
  const currentProgram =
    programs.find((program) => program.start <= now && program.end > now) ||
    programs.find((program) => program.start > now) ||
    null;

  if (!currentProgram) {
    return {
      currentProgram: null,
      upcomingPrograms: []
    };
  }

  const currentIndex = programs.findIndex((program) => program === currentProgram);

  return {
    currentProgram,
    upcomingPrograms: programs.slice(currentIndex + 1, currentIndex + 5)
  };
}
