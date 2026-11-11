# Undula: 30-second film kit

Everything needed to make Undula's 30-second NASA Space Apps film. The app footage and screenshots here are
**real recordings of the Undula app** (1920x1080). Cinematic shots are to be generated; data must only ever come
from the real recordings.

## The idea: "The ground has a heartbeat"

The film opens in silence, then a heartbeat. By the end we realise the heartbeat is the ground itself: the same
falling notes Undula plays when the land sinks. One place, the Nile Delta: from one person, to space, to 2100.

## Storyboard (30 s, 16:9)

| Time | Shot | Source | Sound |
|---|---|---|---|
| 0-3 s | Black. Text: *"The ground under 50 million people is moving."* | Text | `sound/ground-heartbeat.wav` |
| 3-7 s | Dawn over a flooded rice field in the Nile Delta. A barefoot farmer; at his feet a thin crack in the mud slowly widens | Generated (cinematic) | Heartbeat closer |
| 7-10 s | Camera rises fast into space. A radar satellite with a large golden mesh antenna glides past, a soft scanning wave toward Earth | Generated (cinematic) | Soft sweep |
| 10-14 s | The Undula opening mission screen, then the Nile Delta map with the rainbow rings growing | `clips/01-opening.mp4`, `clips/02-delta-rings.mp4` | Heartbeat turns into falling notes: `sound/heartbeat-to-notes.wav` |
| 14-18 s | Real NISAR radar playing pass by pass | `clips/04-real-nisar.mp4` | Notes |
| 18-23 s | **Sea 2100**: blue water spreads over the delta, the year counts 2026 to 2100: "3,491 km²" | `clips/03-sea-2100.mp4` (speed up) | Music tightens |
| 23-26 s | **The key moment:** "Remove the sinking". The water pulls back to 1,557 km². Text: *"More than half of it is the land sinking."* | `clips/03-sea-2100.mp4` (end) | One beat of silence, then a breath |
| 26-30 s | Undula logo rises. *"Undula. Hear the ground move."* Under it: *Team Shiblanga · NASA Space Apps 2026* | `../assets/brand/undula-mark.svg` | Last note, echo |

## Voice-over (English, calm and deep, about 40 words)

> The ground under our feet is moving. Too slowly to see. But from space, NISAR can feel it. Undula lets anyone
> see it, hear it, and understand why. By 2100, the sea could reach this far. More than half of it, because the
> land is sinking.

## Facts the film may use (all from the app)

- Nile Delta, Sea 2100 (constant 2026 rates, rough estimate): **3,491 km²** more under the sea by 2100 with the
  sinking, **1,557 km²** from sea rise alone.
- Delta sinking up to **11 mm a year** (Damietta), sea rising **3.4 mm a year** (Hassan et al., 2025).
- More than 40% of Egyptians live on the Nile Delta.
- NISAR images nearly all of Earth's land and ice every 12 days, day and night, through clouds.

## Files

| File | What it is |
|---|---|
| `clips/01-opening.mp4` | Opening mission screen, then the first story step |
| `clips/02-delta-rings.mp4` | Nile Delta map, rings growing as the land sinks |
| `clips/03-sea-2100.mp4` | Sea 2100 from 2026 to 2100, then "Remove the sinking" and back (long: speed it up) |
| `clips/04-real-nisar.mp4` | Real NISAR radar data playing over Central Valley |
| `clips/05-live-cairo.mp4` | Live NISAR image over Cairo from NASA's catalogue |
| `clips/06-globe.mp4` | The 3D globe of all places |
| `screens/*.png` | Stills of the same moments |
| `sound/ground-heartbeat.wav` | Slow double heartbeat, 8 s |
| `sound/heartbeat-to-notes.wav` | Heartbeat that turns into falling notes, 12 s (the core sound) |
| `sound/ground-sinking-notes.wav` | Falling notes only, one per centimetre, 10 s |
| `../assets/brand/undula-mark.svg`, `undula-512.png` | Logo |

## Rules

- No NASA logo, meatball or any official agency insignia. Satellites appear without logos.
- Anything that looks like data must be a real app recording, never generated.
- State in the project page that the cinematic shots were generated with AI and the app scenes are real.
