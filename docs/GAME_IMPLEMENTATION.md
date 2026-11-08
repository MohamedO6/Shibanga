# Delta Dispatch — delivered playable adventure

Implemented **7 November 2026** in the existing Fringe checkout. English-only web feature; no public deployment or iOS changes.

## The playable mission

Control an original field scout with **Echo**, a small floating radar companion. Explore a 40 × 28-tile Delta-inspired training
world with collision, paths, canals, bridges, crop fields, palms, buildings and optional field-note discoveries.

1. Head north-west and use a radar pulse to reveal the lost relay under the clouds. Approach and reconnect it.
2. Walk to the time relay. Capture survey A and survey B at the same location; duplicate captures cannot power the bridge.
   Switching survey changes the north-east field. The paired-date relay restores the north bridge.
3. Cross east and collect the independent field record at the gauge.
4. Return to the research station and deliver all three evidence items. Optional notes are never required for completion.

This is a real movement-and-interaction game: collision blocks water/buildings, the mission has dependencies, and actions require
proximity. It has no multiple-choice questions. There is no damage timer or punishment for exploring. 5–8 minutes is an estimated
comfortable exploration duration, not a measured user-study median.

The island, survey A/B, relay-powered bridge and readings are fictional. Those labels stay visible. Completion introduces the
actual indexed Delta HH/HV previews, with dates, attribution and provisional/qualitative limits. Changing the actual preview date
and opening the explorer preserves that date, with map playback paused and optional tips over the real controls.

## Where to open it

Run from the repository root:

```text
python -m http.server 5173 --directory web
```

Open **http://localhost:5173/#game**. Entry points also include the **Play** tab, **Play Delta Dispatch** on the cinematic
landing and **Guide → Play the adventure**. The existing Journey, #learn alias, globe, reports, comparisons and lab remain available.

## Controls and accessibility

- Move: WASD / arrows, touch direction buttons, or click/tap walkable ground.
- Radar pulse: Space or the labelled button, with a short cooldown.
- Interact: E or the contextual action button beside a relay, gauge, station or note.
- Survey A/B: T or the survey button after restoring the first relay.
- Follow Echo: optional pathfinding assistance through the same collision grid. It walks rather than teleports and never collects
  evidence for the player. Manual movement cancels the route. Echo announces arrival and gives contextual hints.
- Escape / Pause: stop simulation and sound. Help/journal use a native modal dialog. Sound is optional; reduced motion limits
  decorative animation. Backgrounding pauses the expedition. No login, telemetry, new framework or game engine was added.
- The field journal records discoveries and clearly separates the fictional case from the actual data. It never exports game readings
  as real scientific observations.

Local checkpoints and game sound use **fringe.delta-dispatch.v1**. Continue recovers position and evidence. New expedition asks
before clearing this game's checkpoint. Storage failure leaves a session playable. Inactive views are inert and audio fades/suspends.

## Verification

**42/42 Node tests passed**, with dependency-free Node.js:

```text
node --test web/tests/*.test.mjs
```

Fourteen game tests cover the full mission through actual collision paths, water/building/bridge blocking, proximity and survey gates,
manual navigation cancellation, diagonal speed, capped frame gaps, pulse cooldown, checkpoint recovery and optional notes. The
28 existing journey/science/audio tests remain, including the actual Central Valley baseline and historical GNSS distinction.

Browser checks used the actual UI, without modifying game state in the production page:

- Completed the mission from Start to delivery: movement, pulse discovery, reconnect, paired dates, bridge crossing, field check and return.
- Used keyboard movement/actions and pointer-held mobile direction controls; inspected the changing world at both survey states.
- Reloaded after a partial mission and continued from the saved position, captured date and quest stage.
- Exercised pause/resume, help/journal, new-game confirmation and cancellation, sound toggling and audio stopping at completion/exit.
- Confirmed that an unchanged older tab does not overwrite a newer saved preference when closed. The same snapshot guard prevents stale inactive checkpoint writes.
- Clicked a field-note location to walk there, collected it and inspected the actual journal entry. The paused exploration clock stayed unchanged during inspection.
- Confirmed the finale's actual preview date changes and the real-map handoff retains the selected date with Play paused.
- Inspected desktop **1280 × 720** and mobile **390 × 844**, with no horizontal overflow at the inspected mobile width.
- Checked console warnings/errors on the normal path. No new external services are needed for gameplay.
- Ran the deliberate failure server below: movement and map exit still work with unavailable AudioContext and throwing localStorage.
- Ran the completed-checkpoint fixture below: a missing real preview displays an explanation and leaves the explorer action available.
  That fixture isolates failure UI; the normal mission walkthrough above was completed through the real controls.

```text
python web/tests/serve-failure-fixture.py
python web/tests/serve-failure-fixture.py --port 5175 --completed-game
```

Default fixture: localhost:5174/#game. Completed checkpoint/image-failure fixture: localhost:5175/#game. These servers modify only
served test HTML; production files and real observation data stay intact. Stop each test server with Ctrl+C.

Viewport/pointer simulation is not a physical-device, all-browser or full screen-reader audit. Reduced-motion source paths were
reviewed; no OS preference was changed. Browser QA is not proof that users enjoy the game or learn from it. No new scientific
processing or independent field validation was performed. The real Central Valley result remains unresolved.

## Art, source and previews

- `web/game-core.js`: pure deterministic rules, collision, checkpoint and navigation.
- `web/game-renderer.js`: original code-native pixel tiles/sprites, cached worlds, camera and mini-map.
- `web/game.js`, `web/game.css`: runtime, input, Echo, audio, accessible controls, journal and actual-data finale.
- `web/assets/game/delta-dispatch.webp`: original image_gen title key art, **327,414 bytes**, lazy-loaded on Play.
- `web/assets/game/ART_DIRECTION.md`: complete final prompt, original/final paths and tool/compression attribution.
- `web/tests/game.test.mjs`: the game rule and completion checks.
- `game-title-desktop.png`, `game-play-desktop.png`, `game-mobile.png`, `game-complete.png`: observed UI previews.
- `GAME_AND_AWARDS.md`: dated official-source review, award directions and readiness gaps.

The art, code and text are AI-assisted contributions. The team must preserve a truthful contribution/history disclosure for any
actual competition entry. The prior-work eligibility concern is documented; no organizer inquiry or submission was sent.
