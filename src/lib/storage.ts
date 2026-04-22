import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type ConversationRecord,
  type KnowledgeDocument,
  type SettingsRecord
} from "@/lib/types";
import { getServerConfig } from "@/lib/config";
import type { IPTVChannel } from "@/lib/iptv";

const dataRoot = path.join(process.cwd(), "data");
const conversationsRoot = path.join(dataRoot, "conversations");
const knowledgeRoot = path.join(dataRoot, "knowledge");
const knowledgeFilesRoot = path.join(knowledgeRoot, "files");
const playlistSnapshotsRoot = path.join(dataRoot, "iptv-playlist-snapshots");
const settingsFile = path.join(dataRoot, "settings.json");
const knowledgeIndexFile = path.join(knowledgeRoot, "index.json");

function isoNow() {
  return new Date().toISOString();
}

async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

async function ensureDataDirs() {
  await Promise.all([
    ensureDir(dataRoot),
    ensureDir(conversationsRoot),
    ensureDir(knowledgeRoot),
    ensureDir(knowledgeFilesRoot),
    ensureDir(playlistSnapshotsRoot)
  ]);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await ensureDataDirs();
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

type CompactPlaylistChannel = [
  id: string,
  name: string,
  group: string,
  logo: string,
  tvgId: string,
  url: string,
  type: IPTVChannel["type"],
  catalog: IPTVChannel["catalog"]
];

type PlaylistSnapshotRecord = {
  playlistId: string;
  updatedAt: string;
  channels: CompactPlaylistChannel[];
};

function playlistSnapshotFilePath(playlistId: string) {
  const safeId = playlistId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(playlistSnapshotsRoot, `${safeId}.json`);
}

function compactChannel(channel: IPTVChannel): CompactPlaylistChannel {
  return [
    channel.id,
    channel.name,
    channel.group,
    channel.logo || "",
    channel.tvgId || "",
    channel.url,
    channel.type,
    channel.catalog
  ];
}

function expandChannel(channel: CompactPlaylistChannel): IPTVChannel {
  return {
    id: channel[0],
    name: channel[1],
    group: channel[2],
    logo: channel[3] || undefined,
    tvgId: channel[4] || undefined,
    url: channel[5],
    type: channel[6],
    catalog: channel[7]
  };
}

export async function getSettings(): Promise<SettingsRecord> {
  const defaults = getServerConfig();
  const stored = await readJsonFile<Partial<SettingsRecord>>(settingsFile, {});

  return {
    model: stored.model || defaults.model,
    systemPrompt: stored.systemPrompt || defaults.systemPrompt,
    welcomeMessage: stored.welcomeMessage || defaults.welcomeMessage,
    updatedAt: stored.updatedAt || isoNow()
  };
}

export async function saveSettings(
  nextSettings: Pick<SettingsRecord, "model" | "systemPrompt" | "welcomeMessage">
) {
  const record: SettingsRecord = {
    ...nextSettings,
    updatedAt: isoNow()
  };

  await writeJsonFile(settingsFile, record);
  return record;
}

function conversationFilePath(sessionId: string) {
  return path.join(conversationsRoot, `${sessionId}.json`);
}

function buildTitle(content: string) {
  return content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Nova conversa";
}

export async function getConversation(sessionId: string) {
  await ensureDataDirs();
  return readJsonFile<ConversationRecord | null>(
    conversationFilePath(sessionId),
    null
  );
}

export async function saveConversation(conversation: ConversationRecord) {
  await writeJsonFile(conversationFilePath(conversation.id), conversation);
  return conversation;
}

export async function upsertConversation(
  sessionId: string,
  messages: ConversationRecord["messages"]
) {
  const current = await getConversation(sessionId);
  const firstUserMessage = messages.find((message) => message.role === "user");
  const createdAt = current?.createdAt || isoNow();
  const title = current?.title || buildTitle(firstUserMessage?.content || "");

  const record: ConversationRecord = {
    id: sessionId,
    title,
    createdAt,
    updatedAt: isoNow(),
    messages
  };

  return saveConversation(record);
}

export async function listRecentConversations(limit = 12) {
  await ensureDataDirs();
  const files = await readdir(conversationsRoot);
  const conversations = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) =>
        readJsonFile<ConversationRecord | null>(
          path.join(conversationsRoot, file),
          null
        )
      )
  );

  return conversations
    .filter((entry): entry is ConversationRecord => Boolean(entry))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

type KnowledgeIndex = {
  documents: KnowledgeDocument[];
};

async function getKnowledgeIndex() {
  return readJsonFile<KnowledgeIndex>(knowledgeIndexFile, { documents: [] });
}

async function saveKnowledgeIndex(index: KnowledgeIndex) {
  await writeJsonFile(knowledgeIndexFile, index);
}

export async function listKnowledgeDocuments() {
  const index = await getKnowledgeIndex();
  return index.documents.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function saveKnowledgeDocument(input: {
  id: string;
  name: string;
  type: string;
  content: string;
}) {
  await ensureDataDirs();

  const safeContent = input.content.trim();
  const fileName = `${input.id}.txt`;
  const fullPath = path.join(knowledgeFilesRoot, fileName);

  await writeFile(fullPath, safeContent, "utf8");

  const doc: KnowledgeDocument = {
    id: input.id,
    name: input.name,
    uploadedAt: isoNow(),
    size: Buffer.byteLength(safeContent, "utf8"),
    type: input.type,
    excerpt: safeContent.slice(0, 180),
    path: fullPath
  };

  const index = await getKnowledgeIndex();
  index.documents = [doc, ...index.documents.filter((entry) => entry.id !== doc.id)];
  await saveKnowledgeIndex(index);

  return doc;
}

export async function deleteKnowledgeDocument(id: string) {
  const index = await getKnowledgeIndex();
  const target = index.documents.find((entry) => entry.id === id);

  if (!target) {
    return false;
  }

  await rm(target.path, { force: true });
  index.documents = index.documents.filter((entry) => entry.id !== id);
  await saveKnowledgeIndex(index);
  return true;
}

export async function getKnowledgeDocumentContent(id: string) {
  const index = await getKnowledgeIndex();
  const target = index.documents.find((entry) => entry.id === id);

  if (!target) {
    return null;
  }

  const content = await readFile(target.path, "utf8");
  return {
    ...target,
    content
  };
}

function scoreContent(query: string, content: string) {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 2);

  if (!tokens.length) {
    return 0;
  }

  const haystack = content.toLowerCase();
  return tokens.reduce(
    (score, token) => score + (haystack.includes(token) ? 1 : 0),
    0
  );
}

export async function findRelevantKnowledge(query: string, limit = 4) {
  const docs = await listKnowledgeDocuments();
  const ranked = await Promise.all(
    docs.map(async (doc) => {
      const content = await readFile(doc.path, "utf8");

      return {
        doc,
        content,
        score: scoreContent(query, content)
      };
    })
  );

  return ranked
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      id: entry.doc.id,
      name: entry.doc.name,
      excerpt: entry.content.slice(0, 2200)
    }));
}

export async function getStorageStats() {
  await ensureDataDirs();
  const [documents, conversations] = await Promise.all([
    listKnowledgeDocuments(),
    listRecentConversations(999)
  ]);

  const totalKnowledgeBytes = (
    await Promise.all(
      documents.map(async (doc) => {
        try {
          const fileStats = await stat(doc.path);
          return fileStats.size;
        } catch {
          return 0;
        }
      })
    )
  ).reduce((sum, size) => sum + size, 0);

  return {
    documents: documents.length,
    conversations: conversations.length,
    knowledgeBytes: totalKnowledgeBytes
  };
}

export async function savePlaylistSnapshot(playlistId: string, channels: IPTVChannel[]) {
  const record: PlaylistSnapshotRecord = {
    playlistId,
    updatedAt: isoNow(),
    channels: channels.map(compactChannel)
  };

  await writeJsonFile(playlistSnapshotFilePath(playlistId), record);
  return {
    playlistId,
    updatedAt: record.updatedAt,
    count: channels.length
  };
}

export async function getPlaylistSnapshot(playlistId: string) {
  const snapshot = await readJsonFile<PlaylistSnapshotRecord | null>(
    playlistSnapshotFilePath(playlistId),
    null
  );

  if (!snapshot) {
    return null;
  }

  return {
    playlistId: snapshot.playlistId,
    updatedAt: snapshot.updatedAt,
    channels: snapshot.channels.map(expandChannel)
  };
}

export async function deletePlaylistSnapshot(playlistId: string) {
  await ensureDataDirs();
  await rm(playlistSnapshotFilePath(playlistId), { force: true });
  return true;
}
