# Delta Dispatch — art and authorship

Generated on 7 November 2026 with the **built-in OpenAI image_gen tool**. No reference images, third-party sprites,
existing game characters or licensed music were used. This original fictional illustration is not a NISAR image.

Final project asset: `web/assets/game/delta-dispatch.webp`, 1672 × 941, **327,414 bytes**. It loads only when opening Play.
The original PNG is at `C:/Users/moham/.codex/generated_images/01a1b347-14c2-72f2-bad9-530ed35a56de/exec-fc9bb0d3-8d60-496c-a2e8-aecabdf7b55d.png`.
Pillow compressed it to WebP at quality 86/method 6; no compositing or repainting. See `manifest.json` for SHA-256.

## Complete final prompt

Use case: stylized-concept. Original title-screen key art for Delta Dispatch, a small premium pixel-art top-down exploration adventure about satellite radar and checking evidence in Egypt's Nile Delta. Wide 16:9 landscape. Meticulously handcrafted 16-bit pixel art, visible crisp square pixel clusters, limited sophisticated palette of deep petrol teal, warm sand, leafy green, soft amber and pale mint, subtle atmospheric golden dusk. Show an inviting little research outpost on a riverbank, tile-like paths through geometric green fields, branching blue irrigation canals with small wooden bridges, palms and papyrus, distant Mediterranean glow. In the lower right foreground stand a tiny dark-haired field researcher wearing a teal jacket, cream cap, amber backpack, and their small floating cream-and-teal friendly radar robot companion with a single cyan visor and two small side fins. A gold-mesh radar satellite very small in the upper right sky. Cozy adventure and a sense of scientific discovery, charming but sophisticated, not childish. Upper left half has calm dark teal cloud/sky and uncluttered atmosphere so HTML title and buttons can overlay. Beautiful layered depth but true crisp pixel art, not smooth 3D, no vector appearance, no blur, no text, no letters, no numbers, no UI, no logo, no watermark. Characters are original and not based on any existing game. Illustration only, not satellite data.

## In-game art and music

`web/game-renderer.js` draws the playable tile world, original scout and Echo sprites, palms, houses, water, clouds,
relays and mini-map with deterministic Canvas pixel shapes. This ensures exact collision alignment and scalable crisp
rendering. Static worlds are cached by survey/bridge state. Small decorative animation respects reduced motion.
The code-native sprites are original; they are not extracted from the key art or another game.

The existing original Web Audio score supplies calm chords, filtered air and interaction echoes. It starts only after
Start/Continue, pauses when the game or page is inactive, and can be muted. It does not sonify real measurements.

The team should include these AI-assisted art/code/text contributions in its actual competition disclosure and verify
that the final entry follows that year's published guide. No submission, public deployment or NASA endorsement is implied.
