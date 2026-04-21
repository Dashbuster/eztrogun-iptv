export type IPTVChannel = {
  id: string;
  name: string;
  group: string;
  logo?: string;
  url: string;
  type: "hls" | "stream";
  catalog: "live" | "movie" | "series";
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseAttributes(line: string) {
  const attributes: Record<string, string> = {};
  const regex = /([\w-]+)="([^"]*)"/g;

  for (const match of line.matchAll(regex)) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function inferCatalog(input: {
  name: string;
  group: string;
  url: string;
  attributes: Record<string, string>;
}): IPTVChannel["catalog"] {
  const haystack = `${input.name} ${input.group} ${input.url} ${Object.values(input.attributes).join(" ")}`.toLowerCase();

  if (
    haystack.includes("series") ||
    haystack.includes("temporada") ||
    haystack.includes("season") ||
    haystack.includes("episodio") ||
    haystack.includes("episode")
  ) {
    return "series";
  }

  if (
    haystack.includes("filme") ||
    haystack.includes("filmes") ||
    haystack.includes("movie") ||
    haystack.includes("vod") ||
    haystack.includes("/movie/")
  ) {
    return "movie";
  }

  return "live";
}

export function parseM3U(content: string): IPTVChannel[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const channels: IPTVChannel[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    const attributes = parseAttributes(line);
    const name = line.split(",").slice(1).join(",").trim() || `Canal ${channels.length + 1}`;

    let url = "";
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (!nextLine.startsWith("#")) {
        url = nextLine;
        index = cursor;
        break;
      }
    }

    if (!url) {
      continue;
    }

    const resolvedName = attributes["tvg-name"]?.trim() || name;
    const group = attributes["group-title"]?.trim() || "Geral";

    channels.push({
      id: `${channels.length + 1}-${slugify(resolvedName || `canal-${channels.length + 1}`)}`,
      name: resolvedName,
      group,
      logo: attributes["tvg-logo"],
      url,
      type: url.includes(".m3u8") ? "hls" : "stream",
      catalog: inferCatalog({ name: resolvedName, group, url, attributes })
    });
  }

  return channels;
}

export function buildM3U(channels: IPTVChannel[]) {
  const lines = ["#EXTM3U"];

  for (const channel of channels) {
    const attributes = [
      `tvg-name="${channel.name.replace(/"/g, "")}"`,
      `group-title="${channel.group.replace(/"/g, "")}"`
    ];

    if (channel.logo) {
      attributes.push(`tvg-logo="${channel.logo.replace(/"/g, "")}"`);
    }

    lines.push(`#EXTINF:-1 ${attributes.join(" ")},${channel.name}`);
    lines.push(channel.url);
  }

  return lines.join("\n");
}

export const samplePlaylist = `#EXTM3U
#EXTINF:-1 tvg-id="bbb" tvg-name="Big Buck Bunny" group-title="Demo",Big Buck Bunny
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-id="tears" tvg-name="Tears of Steel" group-title="Demo",Tears of Steel
https://test-streams.mux.dev/tears-of-steel/playlist.m3u8
#EXTINF:-1 tvg-id="sintel" tvg-name="Sintel" group-title="Filmes",Sintel
https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8`;
