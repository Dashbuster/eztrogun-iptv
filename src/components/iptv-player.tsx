"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

import type { IPTVChannel } from "@/lib/iptv";

type IPTVPlayerProps = {
  channel: IPTVChannel | null;
};

export function IPTVPlayer({ channel }: IPTVPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerMessage, setPlayerMessage] = useState("Selecione um canal para iniciar.");

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !channel) {
      return;
    }

    let hls: Hls | null = null;

    const streamUrl = channel.url;
    const isHlsStream = streamUrl.includes(".m3u8") || channel.type === "hls";

    setPlayerMessage(`Reproduzindo ${channel.name}.`);

    if (isHlsStream && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = streamUrl;
    }

    const handleError = () => {
      setPlayerMessage(
        "O navegador nao conseguiu reproduzir este stream. Verifique formato, autenticacao ou CORS do provedor."
      );
    };

    video.addEventListener("error", handleError);
    video.play().catch(() => {
      setPlayerMessage("Pronto para reproduzir. Se o autoplay falhar, clique no botao play.");
    });

    return () => {
      video.pause();
      video.removeEventListener("error", handleError);
      if (hls) {
        hls.destroy();
      } else {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [channel]);

  return (
    <div className="player-shell">
      <div className="player-copy">
        <p className="eyebrow">Agora tocando</p>
        <h2>{channel?.name || "Nenhum canal selecionado"}</h2>
        <p>{channel?.group || "Selecione uma playlist e escolha um canal na lista."}</p>
      </div>

      <div className="video-frame">
        <video ref={videoRef} controls playsInline poster="" />
      </div>

      <div className="player-footer">
        <span>{playerMessage}</span>
        {channel ? (
          <a href={channel.url} target="_blank" rel="noreferrer">
            Abrir stream bruto
          </a>
        ) : null}
      </div>
    </div>
  );
}
