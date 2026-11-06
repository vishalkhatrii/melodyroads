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
  const allowPlayRef = useRef(false);

  const [clock, setClock] = useState(new Date());
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(75);
  
  // Fresh v2 Visitor Counter (Starts at 1, doesn't increase on refresh)
  const [visitorCount] = useState(() => {
    const hasVisited = sessionStorage.getItem("melodyroads_visited_v2");
    let total = Number(localStorage.getItem("melodyroads_v2_count") || 0);
    
    if (!hasVisited) {
      total += 1;
      localStorage.setItem("melodyroads_v2_count", total);
      sessionStorage.setItem("melodyroads_visited_v2", "true");
    }
    return total;
  });
  
  const [playlistIndex, setPlaylistIndex] = useState(() => {
    const saved = localStorage.getItem("melodyroads_index");
    return saved !== null ? Number(saved) : 0;
  });

  const [error, setError] = useState("");

  const [song, setSong] = useState({
    title: "Tap Play to start...",
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
      allowPlayRef.current = true;
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

    allowPlayRef.current = false;
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

    allowPlayRef.current = false;
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
          <i /> {visitorCount} ON ROAD
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
            <button onClick={previousSong} disabled={!playerReady} aria-label="Previous song">|◀</button>
            <button className="play-button" onClick={togglePlayback} disabled={!playerReady} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
            <button onClick={nextSong} disabled={!playerReady} aria-label="Next song">▶|</button>
          </div>

          <div className="volume-row">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e6cbab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                background: `linear-gradient(to right, #e6cbab ${volume}%, rgba(255, 255, 255, 0.2) ${volume}%)`
              }}
            />
          </div>
        </div>

        <div style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", overflow: "hidden" }} ref={playerHostRef} />
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