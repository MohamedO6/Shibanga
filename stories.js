// Guided stories for the map: a few plain-language steps per place, written for someone who has never
// heard of radar. Every number here is one the app already cites in that place's details (fringe.js
// facts, evidence records and photo notes). Edit freely; keep each step short enough to read in a breath.
//
// Step fields:
//   title, text  what the caption says
//   mode         "model" (physics rings), "nisar" (real NISAR motion), "fields" (NISAR crops and water)
//                or "photos" (real satellite photos). A step whose mode the place does not have is skipped.
//   compare      photos only: show the oldest and newest photo side by side (and flick between them)
//   stat         [big number, what it means, colour: coral | amber | lateral | accent]

export const TOURS = {
  "nile-delta": [
    { title: "Egypt's breadbasket", mode: "model", text: "More than 40% of Egyptians live on the Nile Delta, and over half of Egypt's farmland is here. Its northern edge is only about a metre above the sea." },
    { title: "Modeling a sinking delta", mode: "model", text: "These are simulated rings, informed by published measurements. Sentinel-1 studies found about 1 cm a year of sinking around Damietta and Mansoura in 2014 to 2019; that is not a new measurement from this animation.", stat: ["−11 mm", "a year at Damietta, cited 2014–2019 study", "coral"] },
    { title: "NASA and ISRO are watching", mode: "nisar", text: "This is real data from the NISAR satellite, June to October 2026. It passes over the delta every 12 days, day or night, even through clouds." },
    { title: "Listen to two kinds of echo", mode: "fields", text: "These real HH/HV previews show seasonal changes in scattering. Green can suggest vegetation, and pink a stronger HH echo. Crop or flood labels need calibrated data and an independent check." },
    { title: "Building on a sinking coast", mode: "photos", compare: true, text: "In 2010 this coast was empty. By 2025 a whole new city, New Mansoura, stands here, on a low coast where the land sinks while the sea rises." },
    { title: "Try a future scenario", mode: "model", text: "If the cited historical rates of sea-level rise and sinking continued unchanged from 2026, the sea would stand about 35 cm higher against Damietta by 2050. This is an illustrative scenario, not a flood forecast.", stat: ["+35 cm", "2050 constant-rate scenario", "lateral"] },
  ],
  "central-valley": [
    { title: "California's food bowl", mode: "model", text: "The Central Valley is one of the most productive farming regions in the United States. When droughts cut the river water, farmers pump it from deep underground." },
    { title: "The valley floor dropped", mode: "model", text: "Drain the water out of underground clay and the clay squeezes flat for good. In the 2014 to 2015 drought, some spots sank nearly 5 cm a month.", stat: ["~5 cm", "a month at the worst spots", "coral"] },
    { title: "Test the 2026 signal", mode: "nisar", text: "This is phase derived from real NISAR products. Motion and atmospheric residuals both contribute. In the bundled station comparison, RMS is about 3 cm and the small motion is not resolved. Open Details to inspect the baseline and residuals." },
    { title: "Historical evidence on the ground", mode: "model", text: "During 2015 to 2016, GPS station CRCN in Corcoran dropped about 54 cm. Stations 100 km away dropped 6 to 8 cm. These historical observations provide context; they do not validate NISAR images acquired in 2026.", stat: ["−54 cm", "GPS station CRCN, 2015 to 2016", "coral"] },
    { title: "The lake that came back", mode: "photos", text: "This is the old Tulare Lake bed, farmed in dry years. Watch the years go by: the 2023 storms flooded it again." },
    { title: "Lost for good", mode: "model", text: "Squeezed clay can never hold as much water again. In 2014 California passed a law, SGMA, to make groundwater basins stop overpumping." },
  ],
  norfolk: [
    { title: "Two problems at once", mode: "model", text: "Norfolk, Virginia, is home to the world's largest naval station. Its waterfront already floods at high tide, and the water comes at it from two directions." },
    { title: "The land is sinking", mode: "model", text: "Radar from 2015 to 2019 found Norfolk sinking about 4.4 mm a year, with hot spots near the waterfront.", stat: ["−4.4 mm", "a year, Norfolk average", "coral"] },
    { title: "NISAR keeps watch", mode: "nisar", text: "This is real NISAR data from 2026. Passing over every 12 days, it can keep track of how the coast keeps moving." },
    { title: "The sea is rising too", mode: "model", text: "The tide gauge at Sewells Point has measured the sea rising 4.84 mm a year against the land since 1927. About half of that is the land going down.", stat: ["4.84 mm", "a year, sea against the land", "lateral"] },
    { title: "The waterfront", mode: "photos", text: "This waterfront floods most often. The sinking is too slow to see in photos, which is exactly why a radar satellite matters." },
    { title: "Fighting back", mode: "model", text: "The local water utility now cleans wastewater and pumps it back underground to slow the sinking. At today's rates, the sea stands about 12 cm higher by 2050.", stat: ["+12 cm", "by 2050 at today's rates", "lateral"] },
  ],
  jakarta: [
    { title: "A city below the sea", mode: "model", text: "Parts of North Jakarta already sit below sea level, kept dry only by sea walls." },
    { title: "Sinking fast", mode: "model", text: "Groundwater pumping and the weight of new buildings squeeze the soft coast. Some districts sank 20 to 28 cm a year.", stat: ["up to 28 cm", "a year in North Jakarta", "coral"] },
    { title: "NISAR keeps watch", mode: "nisar", text: "This is real NISAR data from 2026, passing over Jakarta every 12 days, day or night, through tropical clouds." },
    { title: "Walls against the sea", mode: "photos", compare: true, text: "Compare the coast in 2007 with 2025: new islands and sea walls now reach out into the bay." },
    { title: "A capital on the move", mode: "model", text: "This is one reason Indonesia is moving its capital to Nusantara, on the island of Borneo." },
  ],
  "mexico-city": [
    { title: "A city on an old lake", mode: "model", text: "Mexico City is built on the soft clay of ancient Lake Texcoco." },
    { title: "Squeezed like a sponge", mode: "model", text: "Pumping water from under the city squeezes the clay, so the ground sinks unevenly and cracks pipes, metro lines and buildings.", stat: ["~35 cm", "a year at the worst, 1990s and 2000s", "coral"] },
    { title: "NISAR's first look", mode: "nisar", text: "NISAR's first images, from October 2025 to January 2026, found neighbourhoods dropping more than 2 cm every month. This is its data from 2026.", stat: ["> 2 cm", "a month in some neighbourhoods", "coral"] },
    { title: "An airport that never flew", mode: "photos", compare: true, text: "Before: the old lakebed in 2007. After: the site of a new airport, started in 2015 and cancelled in 2018, on the same soft clay." },
    { title: "Why it matters", mode: "model", text: "Every centimetre of uneven sinking strains the pipes, tunnels and buildings that millions of people depend on." },
  ],
  svartsengi: [
    { title: "A volcano that breathes", mode: "model", text: "Since October 2023 the ground at Svartsengi, Iceland, has swelled up and dropped again and again." },
    { title: "Magma filling up", mode: "model", text: "Each swell is magma pooling 4 to 5 km underground and pushing the ground up like a balloon.", stat: ["4-5 km", "deep: the magma pool", "amber"] },
    { title: "Seen from space", mode: "nisar", text: "This is real NISAR data from 2026, passing over the peninsula every 12 days to track each new swell." },
    { title: "Lava at the edge of town", mode: "photos", compare: true, text: "Before the eruptions, and then 2024: fresh black lava and new barrier walls at the edge of Grindavík." },
    { title: "Nine eruptions", mode: "model", text: "By January 2026 it had erupted nine times. Watching the ground swell helps scientists warn the town and the Blue Lagoon before the next one.", stat: ["9", "eruptions since December 2023", "amber"] },
  ],
  kilauea: [
    { title: "A volcano sliding into the sea", mode: "model", text: "The south side of Kīlauea, in Hawaiʻi, is slowly creeping out to sea along a deep fault." },
    { title: "Up to 10 cm a year", mode: "model", text: "Magma forcing its way into the volcano pushes the whole side of the island toward the sea.", stat: ["~10 cm", "a year toward the sea", "lateral"] },
    { title: "NISAR keeps watch", mode: "nisar", text: "This is real NISAR data from 2026, passing over the island every 12 days." },
    { title: "A bay that disappeared", mode: "photos", compare: true, text: "Before May 2018 this was Kapoho Bay, with homes along it. Today the same place is buried under new black land from the eruption." },
    { title: "When the creep breaks loose", mode: "model", text: "In May 2018 the slow creep broke loose in a magnitude 6.9 earthquake. Measuring the slide shows how much strain is building up.", stat: ["M 6.9", "earthquake, 4 May 2018", "lateral"] },
  ],
  "san-andreas": [
    { title: "The famous fault", mode: "model", text: "The San Andreas Fault is where two of Earth's plates grind past each other." },
    { title: "A fault that creeps", mode: "model", text: "Here, between San Juan Bautista and Parkfield, the fault slides quietly every year instead of storing up energy for one big quake.", stat: ["~25 mm", "a year of creep", "lateral"] },
    { title: "NISAR keeps watch", mode: "nisar", text: "This is real NISAR data from 2026. Over the years, the creep adds up to a sharp step in colour across the fault." },
    { title: "Two GPS stations agree", mode: "model", text: "GPS stations on each side of the fault, P289 and P290, slide past each other about 27 mm a year.", stat: ["27 mm", "a year, measured by GPS", "lateral"] },
    { title: "Invisible in photos", mode: "photos", text: "Creep bends curbs, fences and walls a little each year. You can't see it in photos, and that's exactly why radar matters." },
  ],
  "campi-flegrei": [
    { title: "A giant crater full of homes", mode: "model", text: "Campi Flegrei is a huge volcanic crater just west of Naples, and about half a million people live inside it." },
    { title: "The ground is rising", mode: "model", text: "Since 2005 the town of Pozzuoli has risen more than a metre, in a slow swell geologists call bradyseism.", stat: ["> 1 m", "of rise since 2005", "amber"] },
    { title: "NISAR keeps watch", mode: "nisar", text: "This is real NISAR data from 2026, passing over Naples every 12 days." },
    { title: "The harbour that rose", mode: "photos", text: "This harbour looks the same in every photo, but the ground under it has risen more than a metre since 2005." },
    { title: "Still rising", mode: "model", text: "In December 2025 the ground was rising about 2.5 cm a month, while small earthquakes rattle the homes above.", stat: ["~25 mm", "a month, December 2025", "amber"] },
  ],
  kahramanmaras: [
    { title: "The day the ground tore", mode: "model", text: "On 6 February 2023 a magnitude 7.8 earthquake struck southern Türkiye, and a 7.5 followed hours later." },
    { title: "A 300 km tear", mode: "model", text: "The East Anatolian Fault ripped open for about 300 km. Radar shows the rings packed tightly against the break.", stat: ["~300 km", "of torn ground", "lateral"] },
    { title: "Antakya, before and after", mode: "photos", compare: true, text: "Antakya before the earthquakes, and in April 2023. Look for the empty grey blocks where buildings collapsed." },
    { title: "Why radar matters", mode: "model", text: "In one look, radar maps how far the ground moved along the whole fault, something no team on the ground could do in days." },
  ],
};

// What to look for in each place's before and after photos, shown on the map while comparing.
export const LOOK_FOR = {
  "nile-delta": "2010: empty coast. 2025: New Mansoura, a whole new city.",
  "central-valley": "Press play to watch the years: the 2023 storms flooded the old Tulare Lake bed again.",
  norfolk: "The change here is underground. The waterfront sinks a few millimetres a year, too little to see in a photo.",
  jakarta: "Look along the coast: new islands and sea walls built out into the bay.",
  "mexico-city": "Before: empty lakebed. After: the cleared site of an airport started in 2015 and cancelled in 2018.",
  svartsengi: "Look for the fresh black lava and the new barrier walls at the edge of Grindavík.",
  kilauea: "Before: Kapoho Bay and its homes. After: the same place buried under new black land.",
  "san-andreas": "Nothing to see, and that's the point: the fault creeps a few centimetres a year, invisible in photos.",
  "campi-flegrei": "The harbour looks the same, but the ground under it has risen more than a metre since 2005.",
  kahramanmaras: "Look for the empty grey blocks where whole buildings collapsed.",
};

// The places offered first on the welcome screen.
export const FEATURED = ["nile-delta", "svartsengi", "central-valley", "kahramanmaras", "kilauea"];
