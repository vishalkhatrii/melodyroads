import { useEffect, useRef, useState } from "react";
import "./App.css";

const PLAYLIST_ID = "PLLJOKBQMpmd8";

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.youtubeApiPromise) return window.youtubeApiPromise;

  window.youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    let script = document.querySelector("#youtube-iframe-api");

    if (!script) {
      script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.youtubeApiPromise = null;
        reject(new Error("YouTube API load nahi hui."));
      };
      document.head.appendChild(script);
    }
  });

  return window.youtubeApiPromise;
}

export default function App() {
  const playerRef = useRef(null);
  const playerHostRef = useRef(null);
  const allowPlayRef = useRef(false); // Yeh track karega ki user ne khud play dabaya ya nahi

  const [clock, setClock] = useState(new Date());
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(75);
  
  const [playlistIndex, setPlaylistIndex] = useState(() => {
    const saved = localStorage.getItem("melodyroads_index");
    return saved !== null ? Number(saved) : 0;
  });

  const [error, setError] = useState("");

  const [song, setSong] = useState({
    title: "Loading your playlist...",
    channel: "MelodyRoads Radio",
    thumbnail: "",
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializePlayer() {
      try {
        const YT = await loadYouTubeAPI();

        if (cancelled || !playerHostRef.current) return;

        playerRef.current?.destroy();
        playerHostRef.current.innerHTML = "";

        const mount = document.createElement("div");
        mount.id = "melodyroads-youtube-player";
        playerHostRef.current.appendChild(mount);

        const initialIndex = Number(localStorage.getItem("melodyroads_index") || 0);

        playerRef.current = new YT.Player(mount, {
          width: "200",
          height: "200",
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;

              setPlayerReady(true);
              event.target.setVolume(volume);
              allowPlayRef.current = false;
              
              event.target.cuePlaylist({
                list: PLAYLIST_ID,
                listType: "playlist",
                index: initialIndex,
              });
            },

            onStateChange: (event) => {
              if (cancelled) return;

              const player = event.target;
              const state = event.data;

              // Agar user ne khud play nahi dabaya aur state PLAYING ho gayi, toh turant pause kar do!
              if (state === YT.PlayerState.PLAYING && !allowPlayRef.current) {
                player.pauseVideo();
                setIsPlaying(false);
                return;
              }

              setIsPlaying(state === YT.PlayerState.PLAYING);

              if (
                state === YT.PlayerState.PLAYING ||
                state === YT.PlayerState.PAUSED ||
                state === YT.PlayerState.CUED
              ) {
                const video = player.getVideoData?.() || {};
                const currentIndex = player.getPlaylistIndex?.() ?? 0;

                setSong({
                  title: video.title || "YouTube playlist song",
                  channel: video.author || "YouTube",
                  thumbnail: video.video_id
                    ? `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`
                    : "",
                });

                if (!isNaN(currentIndex)) {
                  setPlaylistIndex(currentIndex);
                  localStorage.setItem("melodyroads_index", currentIndex);
                }
                setDuration(player.getDuration?.() || 0);
              }

              if (state === YT.PlayerState.ENDED) {
                setCurrentTime(0);
              }
            },

            onError: () => {
              if (!cancelled) {
                setError(
                  "Playlist load nahi hui. Playlist availability aur embedding settings check karo."
                );
              }
            },
          },
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "YouTube player load nahi hua.");
        }
      }
    }

    initializePlayer();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;

      if (player?.getCurrentTime && player?.getDuration) {
        setCurrentTime(player.getCurrentTime() || 0);
        setDuration(player.getDuration() || 0);
        const idx = player.getPlaylistIndex?.();
        if (idx !== undefined && !isNaN(idx)) {
          setPlaylistIndex(idx);
          localStorage.setItem("melodyroads_index", idx);
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    if (playerReady && playerRef.current?.setVolume) {
      playerRef.current.setVolume(volume);
    }
  }, [volume, playerReady]);

  function handleStartEngine() {
    const truckAudio = new Audio("/truck.mp3");
    truckAudio.volume = 1.0;
    truckAudio.play().catch((e) => {
      console.log("Truck audio play error:", e);
    });
  }

  function togglePlayback() {
    const player = playerRef.current;
    if (!playerReady || !player) return;

    if (isPlaying) {
      allowPlayRef.current = false;
      player.pauseVideo();
    } else {
      allowPlayRef.current = true; // User ne explicit play kiya
      player.playVideo();
      player.unMute?.();
      player.setVolume(volume);
    }
  }

  function previousSong() {
    if (!playerReady || !playerRef.current) return;
    const player = playerRef.current;
    
    let newIndex = playlistIndex - 1;
    if (newIndex < 0) newIndex = 0;

    allowPlayRef.current = false; // Auto-play block flag ON
    setPlaylistIndex(newIndex);
    localStorage.setItem("melodyroads_index", newIndex);
    setIsPlaying(false);

    player.cuePlaylist({
      list: PLAYLIST_ID,
      listType: "playlist",
      index: newIndex,
    });
  }

  function nextSong() {
    if (!playerReady || !playerRef.current) return;
    const player = playerRef.current;
    
    let newIndex = playlistIndex + 1;

    allowPlayRef.current = false; // Auto-play block flag ON
    setPlaylistIndex(newIndex);
    localStorage.setItem("melodyroads_index", newIndex);
    setIsPlaying(false);

    player.cuePlaylist({
      list: PLAYLIST_ID,
      listType: "playlist",
      index: newIndex,
    });
  }

  function seekSong(event) {
    const value = Number(event.target.value);
    setCurrentTime(value);
    playerRef.current?.seekTo(value, true);
  }

  const progress =
    duration > 0 ? `${(currentTime / duration) * 100}%` : "0%";

  return (
    <main className="road-page">
      <div className="background-shade" />

      <header className="road-topbar">
        <span className="road-clock">
          {clock.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>

        <span className="road-status">
          <i /> ON ROAD
        </span>

        <a
          href={`https://www.youtube.com/playlist?list=${PLAYLIST_ID}`}
          target="_blank"
          rel="noreferrer"
          style={{
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 1000,
            position: "relative",
            color: "#e6cbab",
            textDecoration: "none",
            fontWeight: "600"
          }}
        >
          YouTube
        </a>
      </header>

      {/* START ENGINE BUTTON */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "30px", zIndex: 10 }}>
        <button
          onClick={handleStartEngine}
          disabled={!playerReady}
          style={{
            background: "rgba(50, 35, 24, 0.9)",
            border: "1px solid rgba(212, 175, 55, 0.5)",
            color: "#e6cbab",
            padding: "8px 28px",
            borderRadius: "30px",
            fontSize: "13px",
            fontWeight: "600",
            letterSpacing: "1px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>⏻</span> START ENGINE
        </button>
      </div>

      {/* BRAND BLOCK (Top Right) */}
      <section className="brand-block">
        <h1>MelodyRoads</h1>
        <p className="brand-hindi">रास्ते भी गुनगुनाते हैं</p>
        <p className="brand-caption">
          Purane gaane. Khule raaste.
          <br />
          Aur safar jo yaad reh jaaye.
        </p>
      </section>

      {/* MUSIC DOCK (BOTTOM CENTER) */}
      <section 
        className="music-dock" 
        aria-label="MelodyRoads music player"
        style={{
          position: "fixed",
          bottom: "30px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          background: "transparent",
          border: "none",
          boxShadow: "none",
          backdropFilter: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 30px",
          width: "100%",
          maxWidth: "1050px",
          boxSizing: "border-box",
          gap: "25px"
        }}
      >
        <div className="song-info" style={{ display: "flex", alignItems: "center", gap: "15px", minWidth: "260px" }}>
          <div className="song-art" style={{ width: "60px", height: "60px", borderRadius: "50%", overflow: "hidden", background: "rgba(255, 255, 255, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
            {song.thumbnail ? (
              <img src={song.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span>♫</span>
            )}
          </div>

          <div className="song-details" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <small style={{ fontSize: "11px", letterSpacing: "1px", opacity: "0.8" }}>{isPlaying ? "NOW PLAYING" : "MELODYROADS RADIO"}</small>
            <strong style={{ fontSize: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "220px" }}>{song.title}</strong>
            <span style={{ fontSize: "12px", opacity: "0.9" }}>{song.channel}</span>
          </div>
        </div>

        <div className="player-controls" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "500px" }}>
          <div className="progress-row" style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", opacity: "0.9" }}>
            <span>{formatTime(currentTime)}</span>
            <input
              className="progress-slider"
              type="range"
              min="0"
              max={Math.max(duration, 1)}
              value={Math.min(currentTime, duration || 0)}
              onChange={seekSong}
              disabled={!playerReady || !duration}
              style={{ "--progress": progress, flex: 1, height: "5px", cursor: "pointer" }}
              aria-label="Song progress"
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="control-buttons" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "20px" }}>
            <button onClick={previousSong} disabled={!playerReady} aria-label="Previous song" style={{ background: "none", border: "none", color: "#e6cbab", fontSize: "16px", cursor: "pointer" }}>|◀</button>
            <button className="play-button" onClick={togglePlayback} disabled={!playerReady} aria-label={isPlaying ? "Pause" : "Play"} style={{ width: "42px", height: "42px", background: "#e6cbab", color: "#1a140f", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "bold", cursor: "pointer", border: "none" }}>
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
            <button onClick={nextSong} disabled={!playerReady} aria-label="Next song" style={{ background: "none", border: "none", color: "#e6cbab", fontSize: "16px", cursor: "pointer" }}>▶|</button>
          </div>

          <div className="volume-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "4px" }}>
            <span style={{ display: "flex", alignItems: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e6cbab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Volume"
              style={{
                cursor: "pointer",
                height: "4px",
                background: `linear-gradient(to right, #e6cbab ${volume}%, rgba(255, 255, 255, 0.2) ${volume}%)`
              }}
            />
          </div>
        </div>

        <div style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", overflow: "hidden" }} ref={playerHostRef} />
        {error && <p className="player-message">{error}</p>}

        <div className="dock-footer" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: "10px", letterSpacing: "1px", opacity: "0.7", gap: "3px" }}>
          <span>✦ OLD SONGS · NEW JOURNEYS ✦</span>
          <span>PLAYLIST TRACK {playlistIndex + 1}</span>
        </div>
      </section>

      <footer className="road-footer">
        <span>HEADPHONES ON · DUNIYA OFF</span>
        <span>✦ MELODYROADS ✦</span>
      </footer>
    </main>
  );
}
