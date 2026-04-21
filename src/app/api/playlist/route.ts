import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const mode = request.nextUrl.searchParams.get("mode") || "m3u";

  if (!url) {
    return NextResponse.json({ error: "Informe a URL da playlist." }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 IPTV Web Player"
      },
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `O servidor remoto respondeu com status ${response.status}.` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const content = await response.text();

    if (mode !== "raw" && !content.includes("#EXTM3U") && !content.includes("#EXTINF")) {
      return NextResponse.json(
        { error: `Conteudo remoto invalido para M3U. Content-Type: ${contentType || "desconhecido"}.` },
        { status: 422 }
      );
    }

    return NextResponse.json({ content });
  } catch {
    return NextResponse.json(
      { error: "Falha ao buscar a playlist remota. Verifique se a URL exige autenticacao ou bloqueia acesso externo." },
      { status: 500 }
    );
  }
}
