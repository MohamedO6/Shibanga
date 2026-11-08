# See the Unseen — original art record

Generated 7 November 2026 using the **built-in image_gen tool**, one call per asset. No reference images were supplied.
These are illustrative artwork, not satellite observations, engineering drawings or NASA/ISRO branding assets.
All captions and interface text are HTML. The actual NISAR previews remain separate under `web/data/nisar/`.

## Delivered assets

| File in this directory | Pixels | Bytes | Alpha |
| --- | --- | --- | --- |
| `delta.webp` | 1672 × 941 | 226,590 | opaque |
| `satellite.webp` | 1254 × 1254 | 319,222 | preserved |
| `clouds.webp` | 1672 × 941 | 383,100 | preserved |
| `foreground.webp` | 1672 × 941 | 264,478 | preserved |

The initial scene requests delta + satellite: **545,812 bytes** (0.546 MB). Clouds and foreground load on entering a later
chapter; real previews load on the observation chapter. Pillow encoded the selected originals as WebP at quality 85,
method 6, without compositing, replacing backgrounds or repainting. Dimensions, alpha ranges and SHA-256 are in `manifest.json`.

Original PNG directory on the authoring machine:
`C:/Users/moham/.codex/generated_images/01a1b347-14c2-72f2-bad9-530ed35a56de/`.
The application uses only the delivered workspace files above.

## Full final prompt set

### Delta — `exec-141db5d4-58e5-49d2-80b6-6749e8de9df0.png`

Use case: stylized-concept. Asset: an original full-bleed 2.5D cinematic landscape background for Fringe, an elegant scientific Earth-observation web experience called See the Unseen. Wide 16:9 composition, 1920x1080 or wider landscape. A richly crafted aerial oblique view of Egypt's Nile Delta, a broad river branching through lush geometric agricultural fields, small low-rise Egyptian settlements, waterways, a hazy Mediterranean horizon. Sophisticated painterly cinematic game environment, tactile subtle grain and soft atmospheric depth, believable physical geography but clearly an illustration, not a satellite image. Petrol teal shadows, deep natural greens, restrained warm golden morning light catching field edges and water, a calm luminous turquoise river. Landscape fills lower two thirds; upper third is spacious dark teal atmosphere suitable for HTML typography. Many beautiful small details, premium art direction, soft depth gradients, cohesive natural palette. No people, no human characters, no satellite, no text, no letters, no labels, no border, no UI, no watermark. Avoid cartoon outlines, childish style, neon colors, pixel art, flat SVG appearance, floating islands, mountains or pyramids.

### Clouds — `exec-b812b94b-2628-4419-bdda-08fc58c2051e.png`

Use case: stylized-concept. Asset: transparent foreground atmospheric cloud layer for an elegant 2.5D cinematic Nile Delta Earth-observation experience. Wide landscape aspect 16:9. A few large soft volumetric painterly cloud banks seen from an oblique aerial perspective, arranged in separated groups with generous transparent gaps across the middle of frame. Cream-gold sunlit upper edges and muted petrol teal / blue-gray undersides, sophisticated soft brushwork, calm atmosphere. True alpha transparent background around and between every cloud, no ground, no sky fill, no background rectangle, no text, no border. Meant to float over a lush teal and green landscape in parallax. High quality game-environment atmospheric matte layer; not childish, not cartoon symbols, not photorealistic weather stock photo.

### Foreground — `exec-264bf381-ca9f-4981-b4c1-821c65b947a9.png`

Use case: stylized-concept. Asset: a transparent near-camera foreground strip for a premium painterly 2.5D cinematic Nile Delta landscape. Wide 16:9 image, all the upper two thirds fully alpha transparent. Along the lower third only: richly textured dark green reeds and grasses framing a winding petrol teal irrigation channel, a small grassy riverbank and low crop-field edge, warm delicate golden rim light from upper right. Soft painterly detail, elegant realistic proportions, layered atmospheric illustration, no people, no buildings, no objects floating in sky. True transparent background beyond the riverbank silhouettes, no solid sky, no scene filling upper area, no text, no labels, no border, no watermark. It should serve as a subtle parallax framing layer, not obscure the main landscape.

### Satellite — `exec-edd2ee37-917a-4574-b79d-7eb0e395a797.png`

Use case: stylized-concept. Asset: a single stylized NASA-ISRO NISAR-like Earth observation satellite guide as a cutout for a sophisticated scientific cinematic 2.5D web experience. Three-quarter oblique perspective seen from slightly above, one large circular gold mesh radar reflector deployed on a slender boom, compact silver and dark charcoal spacecraft bus wrapped with restrained gold thermal foil, two dark blue rectangular solar panels. Physical instrument aesthetic, no face, no cartoon eyes, no human character. Beautiful painterly 3D illustration with crisp readable silhouette, subtle warm gold edge light and soft teal environmental fill. Center the whole spacecraft with ample transparent margin, fully within frame, square composition. Alpha transparent background, no ground, no space background, no stars, no text, no logo, no watermark.

## Sound

`web/journey-audio.js` composes the original ambient score in Web Audio: 72 BPM suspended chords, sine/triangle glass notes,
filtered air, reverberation and interaction echoes. It has no downloaded music, narrator or scientific sonification claim.
