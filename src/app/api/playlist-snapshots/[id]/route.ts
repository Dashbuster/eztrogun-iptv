import { NextResponse } from "next/server";
import { z } from "zod";

import type { IPTVChannel } from "@/lib/iptv";
import {
  deletePlaylistSnapshot,
  getPlaylistSnapshot,
  savePlaylistSnapshot
} from "@/lib/storage";

const channelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.string().min(1),
  logo: z.string().optional(),
  tvgId: z.string().optional(),
  url: z.string().min(1),
  type: z.enum(["hls", "stream"]),
  catalog: z.enum(["live", "movie", "series"])
});

const snapshotSchema = z.object({
  channels: z.array(channelSchema).min(1)
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const snapshot = await getPlaylistSnapshot(id);

  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = await request.json();
    const parsed = snapshotSchema.parse(body);
    const result = await savePlaylistSnapshot(id, parsed.channels as IPTVChannel[]);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Payload invalido para snapshot." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deletePlaylistSnapshot(id);
  return NextResponse.json({ ok: true });
}
