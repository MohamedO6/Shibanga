# Undula: watch the ground move with NISAR radar

<img src="assets/brand/undula-192.png" alt="Undula logo" width="96">

Undula turns NASA-ISRO NISAR radar into something anyone can understand. Cities sink, volcanoes swell and faults
creep by millimetres to centimetres a year, too slowly to see. NISAR measures it from space, day and night. Undula
shows it on a map, tells each place's story, and checks it against GPS stations on the ground.

## What you can do

- **Follow the opening story** over the Nile Delta, then explore the map.
- **See ten real places** where the ground is moving, with plain explanations of why.
- **Play real NISAR radar data** pass by pass, and see crops and water in two polarizations.
- **Compare then and now** in satellite photos.
- **Sea 2100:** watch where the sea could reach on the Nile Delta and Norfolk by 2100, with and without the
  sinking (a rough, clearly labelled estimate).
- **Hear the ground move:** every centimetre of motion plays a note.
- **Look anywhere on Earth** and open NISAR's latest image of that spot.
- **Explore as Astrounit,** walking the map and discovering each region's story.
- **Check the evidence:** sources, GPS comparisons and time-stamped evidence records.

## Run it

This folder is the whole web app. Nothing to install or build.

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

## Data

NASA/JPL-Caltech and ISRO NISAR products via the Alaska Satellite Facility; Nevada Geodetic Laboratory GPS;
Copernicus DEM GLO-90 (© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under
COPERNICUS by the European Union and ESA); Esri World Imagery and Wayback; cited publications and credited
photographs. Sources are shown in the app next to each number. `pipeline/` and `Tools/` hold the scripts that
build the data.

## Licence

MIT, see [LICENSE](LICENSE).
