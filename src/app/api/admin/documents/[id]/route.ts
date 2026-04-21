import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth";
import { deleteKnowledgeDocument } from "@/lib/storage";

async function assertAdmin() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  return null;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await assertAdmin();

  if (blocked) {
    return blocked;
  }

  const { id } = await params;
  const removed = await deleteKnowledgeDocument(id);

  if (!removed) {
    return NextResponse.json({ error: "Documento nao encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
