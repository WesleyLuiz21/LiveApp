import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import './streaming.css';

const STREAM_STATES = {
  CONNECTING: 'connecting',
  PLAYING: 'playing',
  TEAMS: 'teams',
  HOLD: 'hold',
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 4000;
const STALL_TIMEOUT = 20000;
const BUFFER_ERROR_THRESHOLD = 5;
const BACKGROUND_RETRY_DELAY = 30000;
const STABILITY_WINDOW = 15000;
const PROBE_MIN_FRAGS = 3;

function Streaming({ primaryUrl, secondaryUrl, teamsUrl, showDebug = true }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryCountRef = useRef(0);
  const currentSourceRef = useRef('primary');
  const stallTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const streamStateRef = useRef(STREAM_STATES.CONNECTING);
  const bufferErrorCountRef = useRef(0);
  const lastFragLoadTimeRef = useRef(Date.now());
  const probeHlsRef = useRef(null);
  const playbackStartTimeRef = useRef(null);
  const probeTimerRef = useRef(null);

  const [streamState, setStreamState] = useState(STREAM_STATES.CONNECTING);
  const [currentSource, setCurrentSource] = useState('primary');
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [isDebugExpanded, setIsDebugExpanded] = useState(true);
  const [logs, setLogs] = useState([]);
  const [retryDisplay, setRetryDisplay] = useState(0);

  const updateStreamState = (state) => {
    streamStateRef.current = state;
    setStreamState(state);
  };

  const updateSource = (source) => {
    currentSourceRef.current = source;
    setCurrentSource(source);
  };

  const addLog = (message, type = 'info') => {
    const time = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setLogs(prev => [...prev.slice(-19), { time, message, type }]);
  };

  const clearTimers = () => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const destroyHls = () => {
    clearTimers();
    destroyProbe();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  const attemptPlayback = async () => {
    if (!videoRef.current) return false;

    try {
      await videoRef.current.play();
      setNeedsUserInteraction(false);
      updateStreamState(STREAM_STATES.PLAYING);
      addLog('Stream playing successfully', 'success');
      return true;
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        setNeedsUserInteraction(true);
        updateStreamState(STREAM_STATES.PLAYING);
        addLog('Click required to start playback', 'warning');
        return true;
      }
      addLog(`Playback failed: ${error.message}`, 'error');
      return false;
    }
  };

  const destroyProbe = () => {
    if (probeTimerRef.current) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
    if (probeHlsRef.current) {
      probeHlsRef.current.destroy();
      probeHlsRef.current = null;
    }
  };

  const scheduleBackgroundRetry = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    retryTimerRef.current = setTimeout(() => {
      addLog('Probing primary stream in background...', 'info');
      destroyProbe();

      if (!Hls.isSupported()) {
        scheduleBackgroundRetry();
        return;
      }

      const probe = new Hls({
        enableWorker: false,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 1,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 2,
      });
      probeHlsRef.current = probe;

      const probeVideo = document.createElement('video');
      let probeFragCount = 0;
      let probeManifestLoaded = false;

      probe.loadSource(primaryUrl);
      probe.attachMedia(probeVideo);

      probe.on(Hls.Events.MANIFEST_PARSED, () => {
        probeManifestLoaded = true;
        addLog('Probe: manifest loaded, verifying stability...', 'info');

        // Start the stability window — after STABILITY_WINDOW ms, check fragment count
        probeTimerRef.current = setTimeout(() => {
          if (probeFragCount >= PROBE_MIN_FRAGS) {
            addLog(`Primary stream stable (${probeFragCount} fragments). Switching over...`, 'success');
            destroyProbe();
            retryCountRef.current = 0;
            setRetryDisplay(0);
            updateSource('primary');
            updateStreamState(STREAM_STATES.CONNECTING);
            initStream(primaryUrl, 'primary');
          } else {
            addLog(`Probe: only ${probeFragCount} fragments in ${STABILITY_WINDOW / 1000}s — not stable enough`, 'warning');
            destroyProbe();
            scheduleBackgroundRetry();
          }
        }, STABILITY_WINDOW);
      });

      probe.on(Hls.Events.FRAG_LOADED, () => {
        probeFragCount += 1;
      });

      probe.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          addLog(probeManifestLoaded
            ? 'Probe: stream failed during stability check'
            : 'Primary stream still unavailable', 'warning');
          destroyProbe();
          scheduleBackgroundRetry();
        }
      });
    }, BACKGROUND_RETRY_DELAY);
  };

  const switchToTeams = () => {
    destroyHls();
    addLog('Switching to Teams backup stream...', 'warning');
    updateSource('teams');
    updateStreamState(STREAM_STATES.TEAMS);
    scheduleBackgroundRetry();
  };

  const switchToHold = () => {
    destroyHls();
    addLog('All streams unavailable. Showing hold screen.', 'error');
    updateSource('hold');
    updateStreamState(STREAM_STATES.HOLD);
    scheduleBackgroundRetry();
  };

  const handleStreamError = (errorMessage, isFatal = true) => {
    addLog(errorMessage, 'error');

    if (!isFatal) return;

    const source = currentSourceRef.current;
    const retries = retryCountRef.current;

    if (retries < MAX_RETRIES) {
      retryCountRef.current += 1;
      setRetryDisplay(retryCountRef.current);
      addLog(`Retrying ${source} stream (attempt ${retries + 1}/${MAX_RETRIES})...`, 'warning');
      updateStreamState(STREAM_STATES.CONNECTING);

      clearTimers();
      retryTimerRef.current = setTimeout(() => {
        const url = source === 'primary' ? primaryUrl : secondaryUrl;
        initStream(url, source);
      }, RETRY_DELAY);
    } else if (source === 'primary' && secondaryUrl) {
      addLog('Primary stream failed. Switching to backup (MUX)...', 'warning');
      retryCountRef.current = 0;
      setRetryDisplay(0);
      updateSource('secondary');
      updateStreamState(STREAM_STATES.CONNECTING);
      initStream(secondaryUrl, 'secondary');
    } else if (source === 'secondary' && teamsUrl) {
      retryCountRef.current = 0;
      setRetryDisplay(0);
      switchToTeams();
    } else if (teamsUrl && source !== 'teams') {
      retryCountRef.current = 0;
      setRetryDisplay(0);
      switchToTeams();
    } else {
      switchToHold();
    }
  };

  const initStream = (url, source) => {
    destroyHls();
    bufferErrorCountRef.current = 0;
    lastFragLoadTimeRef.current = Date.now();
    playbackStartTimeRef.current = null;

    const videoElement = videoRef.current;
    if (!videoElement) return;

    addLog(`Connecting to ${source} stream...`, 'info');

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 1.0,
        startLevel: -1,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.4,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 2000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 4,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        addLog('Stream manifest loaded', 'success');
        playbackStartTimeRef.current = Date.now();
        attemptPlayback();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        addLog(`Quality: Level ${data.level}`, 'info');
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        const isBufferStall = data.details === 'bufferStalledError' ||
                              data.details === 'bufferNudgeOnStall';

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              handleStreamError(`Network error: ${data.details}`, true);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              addLog('Media error - attempting recovery...', 'warning');
              hls.recoverMediaError();
              break;
            default:
              handleStreamError(`Stream error: ${data.details}`, true);
          }
        } else if (isBufferStall) {
          const timeSinceStart = playbackStartTimeRef.current
            ? Date.now() - playbackStartTimeRef.current
            : 0;

          // Grace period: don't trigger fallback during the first STABILITY_WINDOW
          if (timeSinceStart < STABILITY_WINDOW) {
            addLog(`Buffer stall (stabilising, ${Math.round((STABILITY_WINDOW - timeSinceStart) / 1000)}s grace remaining)`, 'warning');
            return;
          }

          bufferErrorCountRef.current += 1;
          const timeSinceLastFrag = Date.now() - lastFragLoadTimeRef.current;

          addLog(`Buffer stall (${bufferErrorCountRef.current}/${BUFFER_ERROR_THRESHOLD})`, 'warning');

          if (bufferErrorCountRef.current >= BUFFER_ERROR_THRESHOLD || timeSinceLastFrag > STALL_TIMEOUT) {
            bufferErrorCountRef.current = 0;
            handleStreamError('Stream unresponsive - too many buffer stalls', true);
          }
        } else {
          addLog(`Minor issue: ${data.details}`, 'warning');
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        bufferErrorCountRef.current = 0;
        lastFragLoadTimeRef.current = Date.now();

        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
        }
        stallTimerRef.current = setTimeout(() => {
          if (streamStateRef.current !== STREAM_STATES.PLAYING) return;

          const timeSinceStart = playbackStartTimeRef.current
            ? Date.now() - playbackStartTimeRef.current
            : 0;
          if (timeSinceStart < STABILITY_WINDOW) return;

          handleStreamError('Stream stalled - no data received', true);
        }, STALL_TIMEOUT);
      });

    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = url;

      const handleMetadata = () => {
        addLog('Stream metadata loaded (native HLS)', 'success');
        attemptPlayback();
      };

      const handleError = () => {
        handleStreamError('Native playback error', true);
      };

      videoElement.addEventListener('loadedmetadata', handleMetadata);
      videoElement.addEventListener('error', handleError);
    } else {
      handleStreamError('HLS not supported in this browser', true);
    }
  };

  useEffect(() => {
    addLog('Initializing stream player...', 'info');
    initStream(primaryUrl, 'primary');

    return () => {
      destroyHls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayClick = () => {
    attemptPlayback();
  };

  const getStatusLabel = () => {
    switch (streamState) {
      case STREAM_STATES.CONNECTING:
        return 'Connecting...';
      case STREAM_STATES.PLAYING:
        return needsUserInteraction ? 'Ready' : 'Live';
      case STREAM_STATES.TEAMS:
        return 'Live (Teams)';
      case STREAM_STATES.HOLD:
        return 'Standby';
      default:
        return 'Unknown';
    }
  };

  const getStatusClass = () => {
    switch (streamState) {
      case STREAM_STATES.CONNECTING:
        return 'status-connecting';
      case STREAM_STATES.PLAYING:
        return 'status-connected';
      case STREAM_STATES.TEAMS:
        return 'status-teams';
      case STREAM_STATES.HOLD:
        return 'status-hold';
      default:
        return '';
    }
  };

  const getSourceLabel = () => {
    switch (currentSource) {
      case 'primary':
        return 'Primary (Amazon IVS)';
      case 'secondary':
        return 'Backup (MUX)';
      case 'teams':
        return 'Fallback (Teams)';
      case 'hold':
        return 'None active';
      default:
        return currentSource;
    }
  };

  const showPlayer = streamState === STREAM_STATES.PLAYING;
  const showTeams = streamState === STREAM_STATES.TEAMS;
  const showHold = streamState === STREAM_STATES.HOLD;
  const showConnecting = streamState === STREAM_STATES.CONNECTING;

  return (
    <>
      <div className="streaming-wrapper">
        <video
          ref={videoRef}
          controls
          playsInline
          className={showPlayer ? '' : 'hidden'}
        />

        {showTeams && teamsUrl && (
          <div className="teams-container">
            <iframe
              src={teamsUrl}
              title="Teams Live Stream"
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              allowFullScreen
              allow="autoplay; camera; microphone"
            />
          </div>
        )}

        <div className={`hold-screen ${showHold ? '' : 'hidden'}`}>
          <div className="diagonal-lines">
            <div className="diagonal-line line-cyan-1" />
            <div className="diagonal-line line-purple" />
            <div className="diagonal-line line-lime" />
            <div className="diagonal-line line-teal" />
            <div className="diagonal-line line-red" />
            <div className="diagonal-line line-cyan-2" />
          </div>
          <div className="hold-branding">
            <div className="hold-tagline">Innovating to Impact</div>
            <div className="hold-logo">dentsu</div>
          </div>
        </div>

        <div className={`connecting-overlay ${showConnecting ? '' : 'hidden'}`}>
          <div className="spinner" />
          <div className="connecting-text">
            {currentSource === 'primary' && 'Connecting to stream...'}
            {currentSource === 'secondary' && 'Switching to backup stream...'}
          </div>
        </div>

        {needsUserInteraction && streamState === STREAM_STATES.PLAYING && (
          <button
            className="streaming-play-button"
            onClick={handlePlayClick}
            type="button"
          >
            Start Stream
          </button>
        )}
      </div>

      {showDebug && (
        <div className="debug-panel">
          <div className="debug-header">
            <span className="debug-title">Stream Status</span>
            <button
              className="debug-toggle"
              onClick={() => setIsDebugExpanded(!isDebugExpanded)}
              type="button"
            >
              {isDebugExpanded ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          <div className="debug-content">
            <div className="debug-item">
              <span className="debug-label">Status</span>
              <span className={`debug-value ${getStatusClass()}`}>
                {getStatusLabel()}
              </span>
            </div>
            <div className="debug-item">
              <span className="debug-label">Stream Source</span>
              <span className="debug-value">{getSourceLabel()}</span>
            </div>
            <div className="debug-item">
              <span className="debug-label">Connection Attempts</span>
              <span className="debug-value">
                {retryDisplay} / {MAX_RETRIES}
              </span>
            </div>
          </div>

          {isDebugExpanded && logs.length > 0 && (
            <div className="debug-log">
              <div className="debug-log-title">Activity Log</div>
              {logs.map((log, index) => (
                <div key={index} className={`log-entry ${log.type}`}>
                  <span className="log-time">{log.time}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default Streaming;
