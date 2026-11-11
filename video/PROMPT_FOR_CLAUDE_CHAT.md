# Prompt for Claude chat (with Higgsfield connected)

Copy everything between the lines into Claude chat. Replace `REPO_URL` with the repository link.

---

You are the director and editor of a 30-second cinematic film for **Undula**, our NASA Space Apps 2026 project
(challenge "Dancing with the SARs", team **Shiblanga** from Egypt). Use the Higgsfield connector and my
**unlimited free-trial generations** (`use_unlim: true`) for every generation.

**The repository:** REPO_URL

Read these first:
- `video/README.md`: the storyboard, voice-over, facts and file list. Follow it.
- `video/screens/*.png`: stills of the real app.
- `README.md`: what the app does.

Raw file links have the form `REPO_URL/raw/main/<path>`, for example `REPO_URL/raw/main/video/clips/03-sea-2100.mp4`.
Import any file you need into Higgsfield with `media_import_url`.

**What Undula is (one line):** an interactive web app that turns NASA-ISRO NISAR radar into stories anyone can
understand: places where the ground is sinking, rising or sliding, real radar data, a "Sea 2100" view of where the
Mediterranean could reach across the Nile Delta with and without the land sinking, and a sound where every
centimetre of motion plays a note.

**The film idea: "The ground has a heartbeat."** Silence, then a heartbeat. By the end we realise the heartbeat is
the ground itself: the same falling notes the app plays when land sinks. One place, the Nile Delta, from one
person, to space, to the year 2100.

## Step 1: generate the cinematic shots (16:9, 1080p, no audio, no text, no logos)

Use `seedance_2_5` (or the best video model my unlimited plan covers), 5 seconds each. Make 2 variants of each and
pick the best.

1. **Farmer and the crack:** "Cinematic dawn over a flooded rice field in the Nile Delta, Egypt. A barefoot farmer in a simple galabeya stands still in shallow water, seen from behind and low, golden low sun, soft mist, palm trees on the horizon. Slow push-in toward the cracked mud bank at his feet, where a thin crack slowly widens. Anamorphic lens, shallow depth of field, subtle film grain, muted teal and gold palette, photorealistic. No text, no logos."
2. **Rise to space:** "Seamless vertical crane shot rising fast from a Nile Delta village into space, Earth curving below, the delta glowing green against the desert at dawn. A radar satellite with a large golden mesh reflector antenna glides across the frame and emits a faint scanning wave toward the ground. Cinematic, realistic lighting, deep black space. No text, no logos, no flags."
3. **Rings over the delta (optional bridge):** "Orbital view of the Nile Delta at dawn; translucent rainbow interference rings (red, amber, green, cyan, violet) gently ripple outward from the land like waves on water, glowing softly over city lights. Slow orbital drift, cinematic, beautiful. No text."
4. **Logo ending:** use `assets/brand/undula-512.png` as the start image: "The logo's rainbow arcs rise gently out of dark sand like ripples, soft light sweeps across, the rest stays still and dark. Elegant, slow, cinematic." If it distorts the logo, skip it; a clean title card is better.

## Step 2: the voice-over

Use `seed_audio` with a calm, deep English voice (pick one from `list_voices`, a mature documentary narrator).
Text, exactly:

"The ground under our feet is moving. Too slowly to see. But from space, NISAR can feel it. Undula lets anyone see it, hear it, and understand why. By 2100, the sea could reach this far. More than half of it, because the land is sinking."

## Step 3: assemble the 30-second film (follow `video/README.md`)

- 0-3 s: black, text *"The ground under 50 million people is moving."*, sound `video/sound/ground-heartbeat.wav`.
- 3-7 s: shot 1 (farmer). 7-10 s: shot 2 (rise to space).
- 10-14 s: real app, `video/clips/01-opening.mp4` (first 2 s) then `video/clips/02-delta-rings.mp4`; sound `video/sound/heartbeat-to-notes.wav`.
- 14-18 s: real app, `video/clips/04-real-nisar.mp4`.
- 18-23 s: real app, `video/clips/03-sea-2100.mp4` sped up so 2026 to 2100 takes about 5 seconds.
- 23-26 s: the end of `03-sea-2100.mp4` where "Remove the sinking" is pressed and the water pulls back. Text: *"More than half of it is the land sinking."*
- 26-30 s: logo ending, text *"Undula. Hear the ground move."* and below it *"Team Shiblanga · NASA Space Apps 2026"*.
- Voice-over over the whole film; the app sounds and heartbeat underneath. Crossfades of 0.3 s, gentle grade to the teal-and-gold look. Export MP4 H.264 1920x1080, 30 fps, under 30 seconds.

If you can run code with ffmpeg, assemble it yourself and give me the final MP4. If you can't, give me the links
of every generated shot and the voice-over, and I will assemble them.

## Rules (important for the judges)

- Anything that looks like data (maps, rings, numbers, radar images) must come from the real app clips, never generated.
- No NASA logo, meatball, worm, flags or any official agency insignia anywhere.
- Don't invent numbers. Only use the facts in `video/README.md`.
- At the end, write one sentence I can paste in the project page saying which shots were AI-generated and that the app scenes are real recordings.

---
