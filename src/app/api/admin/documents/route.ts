import { randomUUID } from "node:crypto";
import path from "node:path";

import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth";
import { listKnowledgeDocuments, saveKnowledgeDocument } from "@/lib/storage";

const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json"]);
const MAX_FILE_SIZE = 1024 * 1024 * 2;

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

  const documents = await listKnowledgeDocuments();
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const blocked = await assertAdmin();

  if (blocked) {
    return blocked;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo nao enviado." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo excede 2 MB." },
        { status: 400 }
      );
    }

    const extension = path.extname(file.name).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Formato permitido: txt, md, csv ou json." },
        { status: 400 }
      );
    }

    const content = await file.text();

    if (!content.trim()) {
      return NextResponse.json(
        { error: "Arquivo vazio ou sem texto legivel." },
        { status: 400 }
      );
    }

    const document = await saveKnowledgeDocument({
      id: randomUUID(),
      name: file.name,
      type: file.type || "text/plain",
      content
    });

    return NextResponse.json({ document });
  } catch {
    return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
  }
}
