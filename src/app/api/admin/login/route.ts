import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSession } from "@/lib/auth";
import { getServerConfig } from "@/lib/config";

const loginSchema = z.object({
  password: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = loginSchema.parse(body);
    const { adminPassword } = getServerConfig();

    if (!adminPassword) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD nao configurada no ambiente." },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: "Senha invalida." }, { status: 401 });
    }

    await createAdminSession();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
}
