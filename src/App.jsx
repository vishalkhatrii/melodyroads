import { useEffect, useRef, useState } from "react";
import "./App.css";

const PLAYLIST_ID = "PLLJOKBQMpmd8";

// Firebase Realtime Database URL for Live Presence
const PRESENCE_DB_URL = "https://melodyroads-906d4-default-rtdb.asia-southeast1.firebasedatabase.app";

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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

function readSavedIndex() {
  try {
    const saved = Number(localStorage.getItem("melodyroads_index"));
    return Number.isInteger(saved) && saved >= 0 ? saved : 0;
  } catch {
    return 0;
  }
}

function saveIndex(index) {
  try {
    localStorage.setItem("melodyroads_index", String(index));
  } catch {
    /* ignore */
  }
}

export default function App() {
  const playerRef = useRef(null);
  const playerHostRef = useRef(null);
  const allowPlayRef = useRef(false);

  const [clock, setClock] = useState(new Date());
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(75);
  const [liveCount, setLiveCount] = useState(1);
  const [playlistIndex, setPlaylistIndex] = useState(readSavedIndex);
  const [error, setError] = useState("");

  const [song, setSong] = useState({
    title: "Tap Play to start...",
    channel: "MelodyRoads Radio",
    thumbnail: "",
  });

  // Clock
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Live users count (heartbeat based)
  useEffect(() => {
    if (!PRESENCE_DB_URL) {
      console.warn("PRESENCE_DB_URL khaali hai, live count kaam nahi karega.");
      return;
    }

    const base = PRESENCE_DB_URL.trim().replace(/\/+$/, "");
    const id = makeId();
    const myUrl = `${base}/presence/${id}.json`;
    let stopped = false;

    async function beat() {
      try {
        const put = await fetch(myUrl, {
          method: "PUT",
          body: JSON.stringify({ ".sv": "timestamp" }),
        });
        if (!put.ok) {
          console.warn("Presence write fail:", put.status, await put.text());
          return;
        }

        const res = await fetch(`${base}/presence.json`);
        if (!res.ok) {
          console.warn("Presence read fail:", res.status);
          return;
        }
        const data = await res.json();
        if (stopped || !data) return;

        const entries = Object.entries(data).filter(
          ([, t]) => typeof t === "number"
        );
        if (!entries.length) return;

        const newest = Math.max(...entries.map(([, t]) => t));
        const alive = entries.filter(([, t]) => newest - t < 60000);
        setLiveCount(Math.max(1, alive.length));

        entries
          .filter(([, t]) => newest - t > 300000)
          .slice(0, 10)
          .forEach(([key]) => {
            fetch(`${base}/presence/${key}.json`, { method: "DELETE" }).catch(
              () => {}
            );
          });
      } catch (err) {
        console.warn("Presence error:", err);
      }
    }

    function leave() {
      fetch(myUrl, { method: "DELETE", keepalive: true }).catch(() => {});
    }

    function onVisible() {
      if (document.visibilityState === "visible") beat();
    }

    beat();
    const timer = window.setInterval(beat, 15000);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisible);
      leave();
    };
  }, []);

  // YouTube player
  useEffect(() => {
    let cancelled = false;
    let endTimer = null;

    async function initializePlayer() {
      try {
        const YT = await loadYouTubeAPI();

        if (cancelled || !playerHostRef.current) return;

        playerRef.current?.destroy();
        playerHostRef.current.innerHTML = "";

        const mount = document.createElement("div");
        mount.id = "melodyroads-youtube-player";
        playerHostRef.current.appendChild(mount);

        const initialIndex = readSavedIndex();

        playerRef.current = new YT.Player(mount, {
          width: "200",
          height: "200",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;

              setPlayerReady(true);
              event.target.setVolume(75);
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
                const currentIndex = player.getPlaylistIndex?.();

                setSong({
                  title: video.title || "YouTube playlist song",
                  channel: video.author || "YouTube",
                  thumbnail: video.video_id
                    ? `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`
                    : "",
                });

                if (typeof currentIndex === "number" && currentIndex >= 0) {
                  setPlaylistIndex(currentIndex);
                  saveIndex(currentIndex);
                }
                setDuration(player.getDuration?.() || 0);
              }

              if (state === YT.PlayerState.ENDED) {
                setCurrentTime(0);
                window.clearTimeout(endTimer);

                endTimer = window.setTimeout(() => {
                  if (cancelled) return;
                  if (player.getPlayerState?.() !== YT.PlayerState.ENDED) return;

                  const list = player.getPlaylist?.() || [];
                  const idx = player.getPlaylistIndex?.() ?? 0;

                  allowPlayRef.current = true;

                  if (list.length && idx >= list.length - 1) {
                    player.playVideoAt(0);
                  } else {
                    player.nextVideo();
                  }
                }, 600);
              }
            },

            onError: () => {
              if (!cancelled) {
                setError("Playlist load nahi hui. Check connection.");
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
      window.clearTimeout(endTimer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  // Progress updates
  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;

      if (player?.getCurrentTime && player?.getDuration) {
        setCurrentTime(player.getCurrentTime() || 0);
        setDuration(player.getDuration() || 0);
        const idx = player.getPlaylistIndex?.();
        if (typeof idx === "number" && idx >= 0) {
          setPlaylistIndex(idx);
          saveIndex(idx);
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  // Volume
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
      allowPlayRef.current = true;
      player.playVideo();
      player.unMute?.();
      player.setVolume(volume);
    }
  }

  function cueIndex(newIndex) {
    const player = playerRef.current;
    if (!player) return;

    allowPlayRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaylistIndex(newIndex);
    saveIndex(newIndex);

    player.cuePlaylist({
      list: PLAYLIST_ID,
      listType: "playlist",
      index: newIndex,
    });
  }

  function previousSong() {
    const player = playerRef.current;
    if (!playerReady || !player) return;

    const list = player.getPlaylist?.() || [];
    const current = player.getPlaylistIndex?.() ?? playlistIndex;

    let newIndex = current - 1;
    if (newIndex < 0) newIndex = list.length ? list.length - 1 : 0;

    cueIndex(newIndex);
  }

  function nextSong() {
    const player = playerRef.current;
    if (!playerReady || !player) return;

    const list = player.getPlaylist?.() || [];
    const current = player.getPlaylistIndex?.() ?? playlistIndex;

    let newIndex = current + 1;
    if (list.length && newIndex >= list.length) newIndex = 0;

    cueIndex(newIndex);
  }

  function seekSong(event) {
    const value = Number(event.target.value);
    setCurrentTime(value);
    playerRef.current?.seekTo(value, true);
  }

  const progress = duration > 0 ? `${(currentTime / duration) * 100}%` : "0%";

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
          <i /> {liveCount ?? 1} ON ROAD
        </span>

        <a
          href={`https://www.youtube.com/playlist?list=${PLAYLIST_ID}`}
          target="_blank"
          rel="noreferrer"
          className="youtube-link"
        >
          YouTube
        </a>
      </header>

      {/* START ENGINE BUTTON */}
      <div className="engine-container">
        <button
          onClick={handleStartEngine}
          disabled={!playerReady}
          className="engine-btn"
        >
          <span>⏻</span> START ENGINE
        </button>
      </div>

      {/* BRAND BLOCK */}
      <section className="brand-block">
        <h1>MelodyRoads</h1>
        <p className="brand-hindi">रास्ते भी गुनगुनाते हैं</p>
        <p className="brand-caption">
          Purane gaane. Khule raaste.
          <br />
          Aur safar jo yaad reh jaaye.
        </p>
      </section>

      {/* MUSIC DOCK */}
      <section className="music-dock" aria-label="MelodyRoads music player">
        <div className="song-info">
          <div className="song-art">
            {song.thumbnail ? (
              <img src={song.thumbnail} alt="" />
            ) : (
              <span>♫</span>
            )}
          </div>

          <div className="song-details">
            <small>{isPlaying ? "NOW PLAYING" : "MELODYROADS RADIO"}</small>
            <strong>{song.title}</strong>
            <span>{song.channel}</span>
          </div>
        </div>

        <div className="player-controls">
          <div className="progress-row">
            <span>{formatTime(currentTime)}</span>
            <input
              className="progress-slider"
              type="range"
              min="0"
              max={Math.max(duration, 1)}
              value={Math.min(currentTime, duration || 0)}
              onChange={seekSong}
              disabled={!playerReady || !duration}
              style={{ "--progress": progress }}
              aria-label="Song progress"
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="control-buttons">
            <button
              onClick={previousSong}
              disabled={!playerReady}
              aria-label="Previous song"
            >
              |◀
            </button>
            <button
              className="play-button"
              onClick={togglePlayback}
              disabled={!playerReady}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
            <button
              onClick={nextSong}
              disabled={!playerReady}
              aria-label="Next song"
            >
              ▶|
            </button>
          </div>

          <div className="volume-row">
            <span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#e6cbab"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
                background: `linear-gradient(to right, #e6cbab ${volume}%, rgba(255, 255, 255, 0.2) ${volume}%)`,
              }}
            />
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            opacity: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
          ref={playerHostRef}
        />
        {error && <p className="player-message">{error}</p>}

        <div className="dock-footer">
          <span>✦ OLD SONGS · NEW JOURNEYS ✦</span>
          <span>TRACK {playlistIndex + 1}</span>
        </div>
      </section>

      <footer className="road-footer">
        <span>HEADPHONES ON · DUNIYA OFF</span>
        <span>✦ MELODYROADS ✦</span>
      </footer>
    </main>
  );
}