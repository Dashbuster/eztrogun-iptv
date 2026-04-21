import { parseM3U } from "@/lib/iptv";

type ParseRequest = {
  content: string;
};

type ParseResponse =
  | {
      ok: true;
      channels: ReturnType<typeof parseM3U>;
    }
  | {
      ok: false;
      error: string;
    };

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  try {
    const channels = parseM3U(event.data.content);
    const response: ParseResponse = { ok: true, channels };
    self.postMessage(response);
  } catch (error) {
    const response: ParseResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao processar playlist."
    };
    self.postMessage(response);
  }
};

export {};
