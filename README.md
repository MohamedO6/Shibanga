# Undula presentation (Team Shiblanga)

An animated 7-slide deck that opens with the team's Egyptian hook film (55 s), then carries on with a 3D globe and
the NISAR satellite. The satellite flies across between slides and its radar sweep reveals each new slide.

**Just the film:** [`undula-hook-masry.mp4`](undula-hook-masry.mp4) (the same file plays at the start of the deck as
`assets/opening.mp4`). Its source is in `film/` (a canvas page rendered frame by frame).

## Run it

Double-click `present.bat` (or run `python serve.py`). It opens `http://127.0.0.1:5190/` in the browser.
Press **F** for full screen. Everything works offline: fonts, clips and the film are all local.

## Keys

| Key | What it does |
|---|---|
| Space / → / click | Next (first press starts the film; the film hands over to the title by itself) |
| ← | Back |
| 1-7 | Jump to a slide |
| S | Play the Nile Delta's ground sound (slide 5) |
| L | Open the live Undula app inside the deck (served from `../Undula`); Esc closes it |
| N | Speaker notes |
| F | Full screen |

On slide 5, the line "More than half of it is the land sinking" appears on the next → press.

## Slides

1. Opening film (`assets/opening.mp4`), then the title: Undula, the challenge, the team.
2. The problem: the Nile Delta sinking up to 11 mm/yr, sea rising 3.4 mm/yr, 40%+ of Egyptians on the Delta.
3. NISAR: what it is and how two radar passes become rainbow rings.
4. **See** (Mohamed): ten places, rings, real NISAR, any spot on Earth.
5. **Hear & Imagine** (Omar): the ground sound and Sea 2100 (3,491 vs 1,557 km²).
6. **Explore & Trust** (Islam): Astrounit, then and now, GPS, and the open data behind it.
7. Why it matters, plus a QR code to try it.

## For the Space Apps submission

`Undula-Team-Shiblanga.pdf` is the same 7 slides as a PDF. The rules allow up to 7 slides including the title, in
English, with the team name, members and challenge. Host it publicly (Google Drive or similar) and submit the link.

## Change things

- **QR code / link:** in `deck.js`, `APP_URL` (now the GitHub `undula` branch). Point it at the live site once Undula
  is deployed, then rebuild the PDF.
- **Who presents which part:** the `presenter` figures in `index.html`.
- **Speaker notes:** `NOTES` in `deck.js`.
- App clips are real recordings in `assets/clips/`. The film is `undula-30s-final.mp4` from the team folder.
