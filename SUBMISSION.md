# Undula: Space Apps 2026 project page (draft to paste)

Challenge: **Dancing with the SARs** · Team: **Shiblanga** (Egypt) · Members: Omar, Mohamed, Islam

> Fill the marked links and AI tool names, read it once as a team, then paste field by field.

---

## Project name
Undula: hear the ground move

## High-level summary
The ground under more than 40 million people in Egypt's Nile Delta is sinking while the sea rises, too slowly for anyone
to notice. Undula is an open-source web app that turns NASA-ISRO NISAR radar into something anyone can see, hear and
understand. It explores ten places, with 93 real NISAR interferogram pairs (May to October 2026) over nine of them,
shows crops and water in two radar polarizations over the Delta, and opens NISAR's latest image of any spot on Earth
live from NASA's catalogue. Every centimetre of motion plays a note, a Sea 2100 view shows how far the Mediterranean
could reach with and without the sinking, and every number carries its source and a check you can run yourself.

## Link to project demo
- 30-second film (English subtitles): [paste YouTube or Drive link]
- or 7 slides: https://mohamedo6.github.io/Shibanga/Undula-Team-Shiblanga.pdf

## Link to final project
- Live app: [paste live link once published]
- Code (MIT): https://github.com/MohamedO6/Shibanga/tree/undula

## Project details

### What it does
- **Ten real places, three ways the ground moves.** Five where the ground sinks (Nile Delta, Jakarta, Mexico City,
  Central Valley, Norfolk), three volcanoes (Kīlauea, Svartsengi, Campi Flegrei) and two faults (Kahramanmaraş,
  San Andreas). Each place has a plain-language story that explains the physical or human driver.
- **Real NISAR, played like a film.** 93 L-band GUNW interferogram pairs on 11 tracks, 26 May to 23 October 2026,
  play pass by pass on the map. Radar phase also includes atmosphere and processing errors; animation between
  acquisition dates is interpolation.
- **Full-product motion processing.** 17 of those pairs are processed from full GUNW products: 9 in Central Valley
  and 8 over the Nile Delta (track 007_D_073, 26 June to 12 October 2026). Invalid and low-coherence pixels are masked,
  the ionosphere corrected, and phase converted to relative line-of-sight displacement. The Delta has 8 cumulative
  frames. About 11% to 23% of native pixels pass the mask per pair; only about 4.7% of the displayed scene remains
  valid through the whole sequence. Masked pixels are unknown. No usable Delta GNSS comparison was obtained;
  these estimates do not establish an absolute vertical subsidence rate. Central Valley's station comparison also
  does not resolve its small motion against a zero-motion baseline.
- **Crops and water from space.** Nine dual-polarization GCOV images (HH and HV) over the Nile Delta show fields,
  wet ground, towns and water through the season.
- **The farming season, measured.** During the hackathon we streamed the full NISAR GCOV data (10 dates, track
  129_A_017, 23 June to 21 October 2026) over a 20 x 20 km patch of rice and cotton near Kafr El Sheikh and measured
  it: HV rises 3.1 dB to a late-August peak and falls again by October, consistent with a growing season; HH jumps 4.2 dB by mid-August,
  which we read as radar bouncing between standing water and rice stalks in flooded paddies (a stated hypothesis).
  Only the needed chunks are read: about 50 MB per date instead of about 5 GB.
  Crop types and harvest dates were not independently checked. The output is backscatter, not a validated crop
  classification or a measured flooded area.
- **An independent scientific check.** We tested the seasonal radar interpretation against cloud-masked Landsat
  8/9 surface-reflectance NDVI over the same 20 x 20 km study area. Fixed date/quality rules accepted 8 paired
  observations within 4 days; 2 radar dates had no acceptable optical match. The optical comparison uses the same
  98.3% of the area at every accepted date. Primary HV/NDVI Spearman correlation is 0.67; the first-difference rate
  check is 0.86. We publish all matched and rejected scenes, spatial-block bootstrap intervals, the secondary HH
  result, and sensitivity to block size and leaving dates out. This is supporting regional evidence for seasonal
  change, not crop identification, flood mapping or validation of ground displacement. Methods: pipeline/SCIENCE.md.
- **Any spot on Earth, live.** Tap anywhere or use your location; Undula asks NASA's CMR catalogue for NISAR's newest
  GCOV image there and opens it in seconds, with links to ASF Vertex and NASA Earthdata Search for the full data.
- **Hear the ground.** Every centimetre of motion plays a note: falling for sinking, rising for uplift.
- **Sea 2100.** A clearly labelled rough estimate on Copernicus DEM GLO-90: by 2100 at today's rates, about
  3,491 km² of the Delta could end up below the sea with the sinking, against 1,557 km² from sea rise alone. More than
  half of the risk is the land itself sinking. The same view runs for Norfolk.
- **Interference Lab.** Move the ground yourself (a sinking aquifer, a swelling magma chamber, a slipping fault, a
  sliding flank) and watch the interferogram NISAR would see.
- **Explore as Astrounit.** Walk the map and discover the story of every region you reach, not only the ten places.
- **Then & Now.** Real satellite photos of each place across the years, with their capture dates.
- **Evidence you can check.** GPS stations from the Nevada Geodetic Laboratory sit beside the radar with honest notes
  on what they can and can't confirm. Every place's evidence record is fingerprinted and time-stamped in Bitcoin with
  OpenTimestamps, and the app re-checks it against the live chain in your browser.

### How it answers the challenge
| The challenge suggests | Undula |
|---|---|
| Track and visualize surface change around the world | Ten places on four continents; any spot on Earth live |
| Different polarizations / frequencies | HH and HV GCOV measured through the season (HV = crops, HH = water under the plants); L-band vs C-band ring spacing in the map and the Lab |
| Time series | NISAR passes as a playable sequence; Then & Now photos since 2014 |
| Ancillary data | GPS, Copernicus DEM, optical imagery, population context, published rates |
| Human drivers | Groundwater pumping (Central Valley, Jakarta, Mexico City), Delta sinking, kept apart from volcanoes and faults |
| Your hometown | The Nile Delta, home to more than 40% of Egyptians, is the heart of the story |
| Storytelling, interactive maps, sliders | Guided stories, sound, Sea 2100, swipe before/after, Astrounit |
| Hypothesize the drivers | Every place explains its driver in plain words, with sources |
| Future applications of NISAR | Each new 12-day pass adds places and chapters; flood and crop views from GCOV |

### Benefits and intended impact
People living on sinking land rarely see it happen. Undula makes the motion visible, audible and local, so a farmer, a
student or a decision-maker can grasp it in a minute and trust it because every number shows where it comes from.
Estimates say they are estimates; preview data says it is preview data.

### Tools, languages and software
JavaScript, HTML and CSS (no build step), WebGL, Leaflet, Web Audio; Python for the data pipeline (earthaccess, h5py,
NumPy); OpenTimestamps; Vercel and GitHub Pages for hosting.

## Use of artificial intelligence
- **Code and writing:** we used Claude (Anthropic) through Claude Code to help write, review and debug the web app,
  the data pipeline and the presentation, and to draft text. OpenAI Codex helped complete the data integration,
  checks and documentation. The team reviewed and directed the work.
- **Images:** the astronaut characters of the three team members were generated with AI from our own photos
  ([fill in tool name]).
- **Voices:** the film's narration uses AI text-to-speech with our own cloned voices ([fill in tool name]).
- **Observations and simulations are identified separately.** Satellite and GNSS observations come from cited
  datasets. Physics-model rings, the mapping of motion to sound, and Sea 2100 are simulations or interpretations.
  AI tools were not used to fabricate satellite or GNSS observations.

## NASA data and resources used
- **NISAR L2 GUNW** (geocoded unwrapped interferograms), provisional, 93 pairs over 9 places, NASA/JPL-Caltech & ISRO,
  from the Alaska Satellite Facility DAAC, found with NASA Earthdata (CMR, earthaccess).
  Full-product processing covers 17 pairs (9 Central Valley, 8 Nile Delta); the remaining pairs are browse previews.
- **NISAR L2 GCOV** (geocoded covariance, HH and HV): 9 preview images over the Nile Delta, 10 full-resolution dates
  measured for the farming-season analysis (pipeline/gcov_season.py), plus live GCOV previews for any place.
- **NASA Earthdata Search** and **ASF Data Search Vertex**: linked from every place and every live image.
- **NISAR Data User Guide** (ASF): product layout for GUNW and GCOV.
- **NASA/USGS Landsat 8/9 Collection 2 Level 2:** 8 quality-filtered optical dates for the independent greenness
  check, obtained through the public Microsoft Planetary Computer catalogue. Red/NIR surface reflectance is
  scaled with the USGS offset and scale before computing NDVI; per-pixel QA and a fixed common area are used.
- Linked in the app's Guide for learners: Intro to Remote Sensing, Intro to SAR, NASA ARSET trainings, NISAR
  StoryMaps, NISAR Applications White Papers, UAVSAR Postcards.

## Space agency partner data
- Copernicus DEM GLO-90 (ESA / European Union), used for Sea 2100.
- Published Sentinel-1 (ESA) results for the Nile Delta, cited (Hassan et al., 2025).
- Referenced as next steps in the app: SAOCOM (CONAE, Argentina, L-band), RADARSAT Constellation and RADARSAT-1 (CSA).

## Other data
Nevada Geodetic Laboratory GPS; Esri World Imagery and Wayback; Wikimedia Commons photos (credited); peer-reviewed
papers and agency reports cited per place.

## References
- Hassan et al. (2025), Scientific Reports: Nile Delta land subsidence and sea-level rise (full citation in the app, Nile Delta sources).
- NISAR Data User Guide: https://nisar-docs.asf.alaska.edu/
- Blewitt, Hammond & Kreemer (2018), Harnessing the GPS data explosion for interdisciplinary science, Eos.
- Copernicus DEM GLO-90: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under
  COPERNICUS by the European Union and ESA.
