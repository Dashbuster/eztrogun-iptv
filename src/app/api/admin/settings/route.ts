import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminAuthenticated } from "@/lib/auth";
import { getSettings, saveSettings } from "@/lib/storage";

const settingsSchema = z.object({
  model: z.string().min(1).max(120),
  systemPrompt: z.string().min(20).max(20000),
  welcomeMessage: z.string().min(10).max(3000)
});

async function assertAdmin() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  return null;
}

export async function GET() {
  const blocked = await assertAdmin();

  if (blocked) {
    return blocked;
  }

  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: Request) {
  const blocked = await assertAdmin();

  if (blocked) {
    return blocked;
  }

  try {
    const body = await request.json();
    const parsed = settingsSchema.parse(body);
    const settings = await saveSettings(parsed);

    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
}
