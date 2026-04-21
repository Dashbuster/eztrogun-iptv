import { NextResponse } from "next/server";

import { getConversation, getSettings, upsertConversation } from "@/lib/storage";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    const settings = await getSettings();
    return NextResponse.json({
      messages: [],
      welcomeMessage: settings.welcomeMessage
    });
  }

  const [conversation, settings] = await Promise.all([
    getConversation(sessionId),
    getSettings()
  ]);

  return NextResponse.json({
    messages: conversation?.messages || [],
    welcomeMessage: settings.welcomeMessage
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId obrigatorio." }, { status: 400 });
  }

  await upsertConversation(sessionId, []);
  return NextResponse.json({ ok: true });
}
