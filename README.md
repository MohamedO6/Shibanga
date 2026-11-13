# Undula presentation (Team Shiblanga)

An animated 9-slide deck that opens with the team's Egyptian hook film (55 s, a fast tour of the app's features), then carries on with a 3D globe and
the NISAR satellite. The satellite flies across between slides and its radar sweep reveals each new slide.

**Just the film:** [`assets/opening.mp4`](assets/opening.mp4) (it plays at the start of the deck). Its source is in `film/` (a canvas page rendered frame by frame).

## Run it

**Easiest:** double-click `index.html` (Chrome or Edge). It works offline, with no server and no internet.
Press **F** for full screen.

`present.bat` (or `python serve.py`) does the same through a small local server and also serves the live app at
`/app/` for the **L** key.

If it stutters: use Chrome or Edge with hardware acceleration on, plug the laptop in, close other tabs.

## Keys

| Key | What it does |
|---|---|
| Space / → / click | Next. On the title slide it starts the film; when the film ends the deck moves on by itself |
| ← | Back |
| 1-9 | Jump to a slide |
| S | Play the Nile Delta's ground sound (slide 5) |
| L | Open the live Undula app inside the deck (served from `../Undula`); Esc closes it |
| N | Speaker notes |
| F | Full screen |

On slide 5, the line "More than half of it is the land sinking" appears on the next → press.

## Slides

1. Title: Undula, the challenge, the team (introduce yourselves), then the opening film (`assets/opening.mp4`).
2. The problem: the Nile Delta sinking up to 11 mm/yr, sea rising 3.4 mm/yr, 40%+ of Egyptians on the Delta.
3. NISAR: what it is and how two radar passes become rainbow rings.
4. Around the world: the ten places on a world map (5 sinking, 3 volcanoes, 2 faults).
5. **See** (Mohamed): ten places, rings, real NISAR, any spot on Earth.
6. **Hear & Imagine** (Omar): the ground sound and Sea 2100 (3,491 vs 1,557 km²).
7. **Explore & Trust** (Islam): Astrounit, then and now, GPS, and the open data behind it.
   The data panel shows median HH/HV backscatter from 10 full GCOV dates. The speaker notes distinguish this
   from a verified crop/flood map and describe the Delta GUNW coverage and lack of usable GPS validation.
8. Nine ways to feel the ground move: every feature in one view.
9. Why it matters, plus a QR code to try it.

## For the Space Apps submission

`Undula-Team-Shiblanga.pdf` is the 7-slide version for submission (slides 1, 2, 3, 5, 6, 7, 9).
`Undula-Team-Shiblanga-full.pdf` has all 9 slides for the local judges. The rules allow up to 7 slides including the title, in
English, with the team name, members and challenge. Host it publicly (Google Drive or similar) and submit the link.

## Change things

- **QR code / link:** in `deck.js`, `APP_URL` (now the GitHub `undula` branch). Point it at the live site once Undula
  is deployed, then rebuild the PDF.
- **Who presents which part:** the `presenter` figures in `index.html`.
- **Speaker notes:** `NOTES` in `deck.js`.
- App clips are real recordings in `assets/clips/`. The film is `undula-30s-final.mp4` from the team folder.
