# LiveApp

Testing environment for a resilient live stream player with multi-source fallback, built for the Dentsu platform.

## Architecture

The player uses a 4-tier fallback system to maximise uptime:

```
Primary (Amazon IVS) → Secondary (MUX) → Teams (iframe) → Hold Screen
```

Each HLS source gets 3 retry attempts before the player moves to the next tier. When on Teams or Hold, a silent background probe checks if the primary stream has recovered every 30 seconds — without interrupting what's currently showing.

## Stream Sources

| Tier | Source | Type |
|------|--------|------|
| Primary | Amazon IVS | HLS via hls.js |
| Secondary | MUX | HLS via hls.js |
| Tertiary | Microsoft Teams Town Hall | iframe embed |
| Fallback | Hold screen | Static branded screen |

## Key Features

- **Stability-verified switching**: Background probe must confirm 3+ fragments over 15 seconds before switching back to primary
- **15-second grace period**: New streams get breathing room before stall detection kicks in
- **Buffer stall detection**: 5 consecutive stalls or 20s without data triggers fallback
- **No UI flashing**: Player stays hidden during reconnection; Teams iframe stays mounted during probes
- **Dentsu-branded hold screen**: Diagonal colour lines matching brand guidelines
- **Debug panel**: Live status, source info, retry count, and activity log

## Bug Fixes

- **Audio looping**: Fixed HLS instance not being properly destroyed on source change, causing duplicate playback (`80f6fbc`)
- **Buffer stalls not triggering fallback**: `bufferStalledError` and `bufferNudgeOnStall` were non-fatal HLS events — added counter-based detection to treat repeated stalls as fatal
- **Too aggressive on 3G**: Initial HLS.js timeouts and buffer settings were too tight for slow networks. Increased `fragLoadingTimeOut` to 20s, `maxBufferLength` to 30s, retries to 6
- **Teams iframe jumping in/out**: Background retry was unmounting Teams every 30s to test primary. Replaced with silent probe using a disposable HLS instance and hidden video element
- **Premature fallback on stream start**: Added 15-second grace period after playback begins — buffer stalls during stabilisation are logged but don't trigger fallback

## Known Issues / Current Bugs

- Primary and secondary HLS streams struggle under very poor network conditions (3G profile via Network Link Conditioner) — Teams iframe is more resilient by design since the server handles adaptive delivery
- On initial page load, browser autoplay policy may require a user click to start playback (expected behaviour, "Start Stream" button is shown)
- Teams iframe depends on the Town Hall event being active — if the event has ended, the iframe shows a generic Teams page

## Tech Stack

- React (Create React App)
- [hls.js](https://github.com/video-dev/hls.js/) for HLS playback
- Amazon IVS for primary stream ingest
- MUX for secondary stream ingest
- Microsoft Teams Town Hall for iframe fallback

## Testing with Network Link Conditioner

1. Open **System Preferences → Network Link Conditioner** (macOS)
2. Select a profile (3G, Edge, Wi-Fi, etc.)
3. Toggle on and observe the debug panel activity log
4. Verify fallback chain: Primary → Secondary → Teams → Hold
5. Disable the conditioner and verify the probe recovers back to primary

## Changelog

### player-testing branch (`ca40462`)
- Rebuilt `Streaming.js` with 4-tier fallback (Primary → Secondary → Teams → Hold)
- Added silent background probe with 15-second stability verification
- Added 15-second grace period for new stream connections
- Tuned HLS.js config for poor network tolerance
- Added debug panel with status, source, retry count, and activity log
- Dentsu-branded hold screen with diagonal colour lines
- Responsive layout with dark header

### main branch
- `80f6fbc` — Fixed audio looping bug on HLS source change
- `0520ed4` — Initial HLS.js integration with Amazon IVS
- `1948c9c` — Initial page and API setup
