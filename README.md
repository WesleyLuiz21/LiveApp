# LiveApp

Testing environment for a resilient live stream player with multi-source fallback, built for the Dentsu platform.

## Architecture

The player uses a stability-based fallback system to maximise uptime:

```
Primary (Amazon IVS) → Secondary (MUX) → Tertiary (MediaPackage) → Hold Screen
```

Each HLS source gets 3 retry attempts before the player moves to the next source. When all sources fail, the player shows a branded hold screen and probes all streams in the background every 30 seconds — switching to whichever source proves stable first.

Fallback order is **dynamic**: the system tracks how long each source has played successfully and prefers sources with >60 seconds of proven uptime. On first load (no history), sources are tried in priority order.

## Stream Sources

| Priority | Source | Type |
|----------|--------|------|
| Primary | Amazon IVS | HLS via hls.js |
| Secondary | MUX | HLS via hls.js |
| Tertiary | AWS MediaPackage | HLS via hls.js |
| Fallback | Hold screen | Static branded screen |

## Key Features

- **Stability-based fallback**: System tracks per-source uptime and prefers streams with >60s proven stability when switching
- **Parallel background probing**: When on hold, all HLS sources are probed simultaneously — the most stable one (10+ fragments in 60s) wins
- **15-second grace period**: New streams get breathing room before stall detection kicks in
- **Buffer stall detection**: 5 consecutive stalls or 20s without data triggers fallback
- **No UI flashing**: Player stays hidden during reconnection attempts
- **Dentsu-branded hold screen**: Diagonal colour lines matching brand guidelines
- **Debug panel**: Live status, source info, retry count, stability data, and activity log

## Bug Fixes

- **Audio looping**: Fixed HLS instance not being properly destroyed on source change, causing duplicate playback (`80f6fbc`)
- **Buffer stalls not triggering fallback**: `bufferStalledError` and `bufferNudgeOnStall` were non-fatal HLS events — added counter-based detection to treat repeated stalls as fatal
- **Too aggressive on 3G**: Initial HLS.js timeouts and buffer settings were too tight for slow networks. Increased `fragLoadingTimeOut` to 20s, `maxBufferLength` to 30s, retries to 6
- **Teams iframe jumping in/out**: Background retry was unmounting Teams every 30s to test primary. Replaced with silent probe using a disposable HLS instance and hidden video element
- **Premature fallback on stream start**: Added 15-second grace period after playback begins — buffer stalls during stabilisation are logged but don't trigger fallback
- **Teams fallback when no meeting live**: Removed Teams from automatic fallback chain — can't reliably detect if a Town Hall is active, so it showed a blank page. Replaced with stability-ranked HLS-only fallback

## Known Issues / Current Bugs

- HLS streams struggle under very poor network conditions (3G profile via Network Link Conditioner) — server-side adaptive delivery (e.g. Teams) handles this better by design
- On initial page load, browser autoplay policy may require a user click to start playback (expected behaviour, "Start Stream" button is shown)
- First fallback cycle has no stability history, so sources are tried in fixed priority order — stability-based ranking only kicks in after sources have been tested
- Background probe runs 3 parallel HLS instances for 60s — modest bandwidth usage on poor networks

## Tech Stack

- React (Create React App)
- [hls.js](https://github.com/video-dev/hls.js/) for HLS playback
- Amazon IVS for primary stream ingest
- MUX for secondary stream ingest
- AWS MediaPackage for tertiary stream ingest

## Testing with Network Link Conditioner

1. Open **System Preferences → Network Link Conditioner** (macOS)
2. Select a profile (3G, Edge, Wi-Fi, etc.)
3. Toggle on and observe the debug panel activity log
4. Verify fallback chain: Primary → Secondary → Tertiary → Hold
5. Disable the conditioner and verify the probe recovers to the most stable source

## Changelog

### `ae00fc9` — Stability-based fallback + MediaPackage
- Added AWS MediaPackage as tertiary HLS source
- Removed Teams from automatic fallback chain (can't detect if meeting is live)
- Replaced fixed cascade with stability-ranked fallback — prefers sources with >60s proven uptime
- Background probe now tests all HLS sources in parallel with 60s stability window (10+ fragments required)
- Tracks per-source stability history across failures for smarter recovery

### `ca40462` — Resilient multi-source player
- Rebuilt `Streaming.js` with multi-tier fallback (Primary → Secondary → Teams → Hold)
- Added silent background probe with 15-second stability verification
- Added 15-second grace period for new stream connections
- Tuned HLS.js config for poor network tolerance
- Added debug panel with status, source, retry count, and activity log
- Dentsu-branded hold screen with diagonal colour lines
- Responsive layout with dark header

### Earlier commits
- `80f6fbc` — Fixed audio looping bug on HLS source change
- `0520ed4` — Initial HLS.js integration with Amazon IVS
- `1948c9c` — Initial page and API setup
