# Album-page performance audit — 19 September 2026

## Conclusion

Bandkit has measurable main-thread overhead on a desktop album page even without playback. The strongest live evidence points to repeated DOM traversal and header-related style recalculation, not an actively drawing visualizer. This is a credible contributor to sluggish interaction, but this audit did not reproduce the tester's indefinite audio-loading failure or measure click-to-audible latency.

This was a diagnostic pass. No production source or build changes were made, and no performance fix is claimed.

## Live desktop measurement

- Real page: https://ladytron.bandcamp.com/album/velocifero
- Actual installed unpacked Bandkit enabled, loaded from this checkout's `dist/unpacked` (extension details reported version 0.8.5).
- Chrome desktop mode; device emulation disabled; no CPU throttling.
- Cart panel closed; playback idle; player empty and visualizer hidden.
- Chrome DevTools Performance recording: **34,274 ms**.

| Trace category | Time | Share of recording duration |
| --- | ---: | ---: |
| Scripting | 6,981 ms | 20.4% |
| Rendering | 3,188 ms | 9.3% |
| System | 1,087 ms | 3.2% |
| Painting | 255 ms | 0.7% |
| Messaging | 31 ms | 0.1% |

These are trace-category times, not whole-machine CPU percentages. Not every millisecond belongs to Bandkit. DevTools explicitly attributed 3,004.9 ms of main-thread time to Bandkit; unattributed browser work includes style/layout work, and Sentry also appears. Other extensions remained installed. This is a single diagnostic recording, not a statistically controlled benchmark.

Bottom-up highlights (self and total times overlap and must not be added):

- **Recalculate style: 3,110.0 ms self time**, linked to Bandkit `content.js:23075:46`. The generated source maps this to the computed-style read in `mountLauncherInHeader`, following inline-style/class writes. Source: `src/content/runtime/lifecycle.js:273`.
- **`visit`: 1,325.4 ms self / 1,613.2 ms total**, linked to Bandkit `content.js:6168:21`. This is the recursive `querySelectorAll("*")` shadow-root traversal. Source: `src/content/runtime/appearance.js:911`.
- **`querySelectorAll`: 1,029.7 ms self** across the recording.
- The top-level function-call entry linked to `content.js:6195:56` (the corner synchronization animation-frame callback) showed **9,666.1 ms total**. Use the specific self-time entries above for attribution rather than treating this aggregate as an additional cost.

## Source findings

### 1. Broad mutation-driven corner scans — first optimization target

`appearance.js:948` observes every child-list mutation under the body, then schedules a complete document/shadow-tree traversal on the next animation frame. It also observes discovered shadow roots. There is no mutation relevance filter; normal text/control updates can trigger another global scan. Animation-frame coalescing limits frequency, but does not make the traversal incremental.

Recommended change: discover hosts once, inspect only newly inserted subtrees, ignore extension-owned rendering/style mutations, and retain cleanup for removed roots. Verify dynamic Bandcamp headers still receive the corner rules.

### 2. Header writes followed by computed-style reads — first optimization target

`lifecycle.js:290` rewrites root style/class state before reading the native icon's computed style at line 298. The trace associates substantial style recalculation with that read. Repeated header synchronization needs investigation, even though `header-mutations.js` already filters some extension-owned changes.

Recommended change: avoid work when the launcher remains correctly mounted; make writes conditional; separate style reads from writes; determine which mutations still schedule repeated header updates.

### 3. Analysis scheduling — secondary contention risk, not proven live cause

`page-commerce-analysis.js:453` starts up to three page analysis loops. Each sends a separate single-track `ANALYZE_TRACKS` request. `offscreen/index.js:356` caps concurrency at one *within a request*, not globally across requests/tabs. Audio downloads and decoding can therefore overlap even though the calculation worker serializes jobs.

`offscreen/analysis.js:606` compacts decoded samples on the offscreen main thread before sending them to the worker. Fetching also reads the complete response before truncating to the requested range, so a server ignoring Range could cause excess transfer. Existing playback-priority cancellation and headroom checks are useful safeguards, but do not establish that all contention is eliminated.

Recommended follow-up: a global, deduplicated analysis queue with playing-track priority, bounded fetch/decode concurrency, and cancellation of obsolete work. Measure cold-cache track switching separately.

### 4. Visualizer

The live idle player was empty. Its visualizer was `display:none`; glow animation was paused. The trace therefore does not establish an active visualizer drawing bottleneck.

Source already coalesces content frames and skips hidden-page/empty-player rendering. The offscreen producer still sends 320-band samples approximately every 33 ms while playing and every 240 ms while idle, without a visible-consumer subscription. That is an optimization opportunity, not a measured cause of the desktop trace above.

## Supplemental worker test

`node tests/analysis-worker-smoke.mjs` passed:

```json
{"blockingAnalysisMs":119,"workerTimerTicks":14,"workerTimerMaxGapMs":17}
```

This synthetic Node test supports the worker scheduling behavior (a 16 ms timer had a 17 ms maximum gap), not a claim that decoding/networking or real-browser analysis is free.

## Excluded preliminary comparison

An earlier on/off test used Bandcamp's mobile layout with Chrome's responsive device toolbar enabled; the Bandkit-on sample also had the cart panel open. It showed extra rendering/compositing, but **must not be used as a native-vs-Bandkit desktop comparison**. The desktop findings above supersede it. There is not yet a matching extension-disabled desktop baseline or a before/after optimization measurement.

## Verification and next acceptance checks

- The visible console error was a Stripe font CSP violation, not a Bandkit exception. A separate extension also logged a 50 ms interval warning.
- Bandkit was re-enabled after the preliminary toggle test and remained enabled for the desktop trace.
- Next: fix the measured scan/header hot paths, rebuild this checkout, reload the actual unpacked extension, and repeat desktop idle/playing/rapid-track-switch traces against an extension-disabled desktop baseline.
- Also verify header mounting, theme/corner changes, album controls, paused/hidden-tab behavior, and visualizers on the real site. No fix is complete until that live verification succeeds.
