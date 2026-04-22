"use client";

import Hls from "hls.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import type { IPTVChannel } from "@/lib/iptv";

type IPTVPlayerProps = {
  channel: IPTVChannel | null;
  quickChannels?: IPTVChannel[];
  onChannelChange?: (channel: IPTVChannel) => void;
};

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function IPTVPlayer({ channel, quickChannels = [], onChannelChange }: IPTVPlayerProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [playerMessage, setPlayerMessage] = useState("Selecione um item e pressione play para iniciar.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [showQuickList, setShowQuickList] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isLive = channel?.catalog === "live";
  const canSeek = !isLive && Number.isFinite(duration) && duration > 0;

  const quickChannelItems = useMemo(() => {
    return quickChannels.filter((item) => item.catalog === "live").slice(0, 14);
  }, [quickChannels]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !channel) {
      return;
    }

    let hls: Hls | null = null;
    const streamUrl = channel.url;
    const isHlsStream = streamUrl.includes(".m3u8") || channel.type === "hls";

    video.pause();
    video.currentTime = 0;
    video.muted = false;
    video.volume = volume;
    setIsMuted(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setShowQuickList(false);
    setPlayerMessage(`Carregando ${channel.name}...`);

    if (isHlsStream && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = streamUrl;
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      void video.play()
        .then(() => {
          setIsPlaying(true);
          setPlayerMessage(isLive ? `Ao vivo em ${channel.name}.` : `Reproduzindo ${channel.name}.`);
        })
        .catch(() => {
          setPlayerMessage(`Pronto para reproduzir ${channel.name}. Pressione play no player.`);
        });
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleError = () => {
      setPlayerMessage(
        "O navegador nao conseguiu reproduzir este stream. Verifique formato, autenticacao ou CORS do provedor."
      );
      setIsPlaying(false);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("volumechange", handleVolumeChange);
    video.addEventListener("error", handleError);

    return () => {
      video.pause();
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("volumechange", handleVolumeChange);
      video.removeEventListener("error", handleError);

      if (hls) {
        hls.destroy();
      } else {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [channel, isLive, volume]);

  useEffect(() => {
    if (!showOverlay) {
      return;
    }

    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = window.setTimeout(() => {
      setShowOverlay(false);
      setShowVolume(false);
    }, 4000);

    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [showOverlay, currentTime, isPlaying]);

  function wakeOverlay() {
    setShowOverlay(true);

    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = window.setTimeout(() => {
      setShowOverlay(false);
      setShowVolume(false);
    }, 4000);
  }

  function togglePlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    wakeOverlay();

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  function seekBy(delta: number) {
    const video = videoRef.current;

    if (!video || !canSeek) {
      return;
    }

    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    wakeOverlay();
  }

  function handleTimelineChange(nextValue: number) {
    const video = videoRef.current;

    if (!video || !canSeek) {
      return;
    }

    video.currentTime = nextValue;
    setCurrentTime(nextValue);
    wakeOverlay();
  }

  function handleVolumeChange(nextValue: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.volume = nextValue;
    video.muted = nextValue === 0;
    setVolume(nextValue);
    setIsMuted(nextValue === 0);
    wakeOverlay();
  }

  function toggleMute() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);
    wakeOverlay();
  }

  async function toggleFullscreen() {
    wakeOverlay();

    if (!shellRef.current) {
      return;
    }

    if (!document.fullscreenElement) {
      await shellRef.current.requestFullscreen();
      return;
    }

    await document.exitFullscreen();
  }

  function handleShellKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    wakeOverlay();

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();

      if (isLive) {
        setShowQuickList((current) => !current);
      } else {
        togglePlayback();
      }
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekBy(-10);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekBy(10);
    }

    if (event.key.toLowerCase() === "f") {
      void toggleFullscreen();
    }
  }

  function handleSurfaceClick() {
    wakeOverlay();

    if (isLive) {
      setShowQuickList((current) => !current);
      return;
    }

    togglePlayback();
  }

  return (
    <div
      ref={shellRef}
      className={`player-shell osd-shell ${showOverlay ? "overlay-visible" : "overlay-hidden"} ${isFullscreen ? "is-fullscreen" : ""}`}
      onMouseMove={wakeOverlay}
      onKeyDown={handleShellKeyDown}
      tabIndex={0}
    >
      <div className="player-copy">
        <p className="eyebrow">Agora tocando</p>
        <h2>{channel?.name || "Nenhum canal selecionado"}</h2>
        <p>
          {channel
            ? `${channel.catalog === "live" ? "Canal ao vivo" : channel.catalog === "movie" ? "Filme" : "Serie"} • ${channel.group}`
            : "Selecione uma playlist e escolha um item na lista."}
        </p>
      </div>

      <div className="video-frame osd-video-frame" onClick={handleSurfaceClick}>
        <video ref={videoRef} playsInline preload="metadata" poster="" />

        <div className={`player-osd ${showOverlay ? "visible" : "hidden"}`}>
          <div className="player-osd-top">
            <div className="player-title-glass">
              <strong>{channel?.name || "Sem selecao"}</strong>
              <span>{playerMessage}</span>
            </div>
          </div>

          {isLive && showQuickList && quickChannelItems.length ? (
            <aside className="player-quick-list">
              <div className="player-quick-head">
                <strong>Troca rapida</strong>
                <span>{quickChannelItems.length} canais</span>
              </div>
              <div className="player-quick-items">
                {quickChannelItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`player-quick-item ${item.id === channel?.id ? "active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChannelChange?.(item);
                      setShowQuickList(false);
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.group || "Ao vivo"}</span>
                  </button>
                ))}
              </div>
            </aside>
          ) : null}

          <div className="player-osd-bottom">
            <div className="player-timeline-shell">
              <input
                type="range"
                min={0}
                max={canSeek ? duration : 100}
                step={1}
                value={canSeek ? Math.min(currentTime, duration || 0) : 100}
                onChange={(event) => handleTimelineChange(Number(event.target.value))}
                disabled={!canSeek}
                className="player-timeline"
                style={
                  {
                    "--progress": `${canSeek && duration > 0 ? (currentTime / duration) * 100 : 100}%`
                  } as CSSProperties
                }
              />
            </div>

            <div className="player-controls-row">
              <div className="player-controls-left">
                <button type="button" className="player-icon-button" onClick={togglePlayback}>
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <button type="button" className="player-icon-button" onClick={() => seekBy(-10)} disabled={!canSeek}>
                  -10
                </button>
                <button type="button" className="player-icon-button" onClick={() => seekBy(10)} disabled={!canSeek}>
                  +10
                </button>
                <div
                  className="player-volume-shell"
                  onMouseEnter={() => {
                    setShowVolume(true);
                    wakeOverlay();
                  }}
                  onMouseLeave={() => setShowVolume(false)}
                >
                  <button type="button" className="player-icon-button" onClick={toggleMute}>
                    {isMuted || volume === 0 ? "🔇" : "🔊"}
                  </button>
                  {showVolume ? (
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={isMuted ? 0 : volume}
                      onChange={(event) => handleVolumeChange(Number(event.target.value))}
                      className="player-volume-slider"
                    />
                  ) : null}
                </div>
                <span className="player-time-readout">
                  {isLive ? "AO VIVO" : `${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`}
                </span>
              </div>

              <div className="player-controls-right">
                <button type="button" className="player-icon-button" onClick={wakeOverlay}>
                  CC
                </button>
                <button type="button" className="player-icon-button" onClick={wakeOverlay}>
                  HD
                </button>
                <button type="button" className="player-icon-button" onClick={() => void toggleFullscreen()}>
                  {isFullscreen ? "⤢" : "⤢"}
                </button>
              </div>
            </div>
          </div>
        </div>
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
