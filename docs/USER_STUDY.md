# See the Unseen — formative usability study

Purpose: check whether a beginner understands active radar and can use the actual explorer after the journey.
This is a protocol, **not a completed study or evidence of adoption**. Begin with 3–5 adults who have not studied radar;
record anonymous codes and their comfort reading English. A small sample can expose usability problems, not population-wide gains.

## Session, about 10 minutes

Tell participants the interface is being tested and allow them to proceed without coaching. The application itself contains no quiz.

1. Open the first-visit journey. Observe whether they find Begin, Sound and the option to skip.
2. Let them explore freely. Note hesitation with the radar scan, timeline or chapter controls; record the time spent and help requested.
3. In the real map, ask them to display an earlier acquisition, switch layer, and find a source or limitation in Details.
4. Ask them to save an observation report and identify its date and dataset source.
5. Ask them to describe how radar sees through clouds, what the illustrated rings represent, and what a pink HH/HV area establishes.
6. Ask what they would check before making a water-change claim. Optionally ask whether historical ALX2 validates the displayed 2026 images.

Use open observations and follow-up discussion after the product journey; do not add an in-product score or completion gate.

## Record

```csv
participant_code,english_reading_comfort,prior_radar_experience,journey_minutes,help_requests,changed_date_without_help,changed_layer_without_help,found_source_without_help,report_saved,understood_active_radar,distinguished_model_from_observation,understood_preview_limit,noticed_historical_gnss_mismatch,main_obstacle
```

Define completion before testing: the displayed date/layer actually changes, the source is identified in Details/report, and a
preview is described as a scattering clue requiring verification. Technical vocabulary is not required. Record misunderstandings,
assistance and contradictory feedback as carefully as successes. Report actual counts and selection method; do not invent quotes.

For a separate resource-manager interview, ask which decision they make, their current tool, needed resolution/update interval,
and the independent evidence they would require. Use observed problems to improve the interface and repeat only affected tasks.

## Delta Dispatch game extension

Use the same anonymous, consent-based session approach. Observe 5–8 novices where feasible; this is a target sample, not completed research.
Start from #game without demonstrating the solution. Let participants discover movement, scan the clouds, pair both visits,
read the field record and return to the station. Record any assistance, including Follow Echo, separately from unassisted play.
Then ask them to change a real acquisition date in the finale, open the explorer, switch layer and find its source.

```csv
participant_code,prior_game_experience,english_reading_comfort,found_movement,found_scan,paired_both_dates,completed_mission,completion_seconds,used_follow_echo,help_requests,recognized_fictional_case,changed_real_date,found_actual_source,main_obstacle,enjoyment_comment
```

Success is observable state: both surveys are captured, the field check is collected, the case is delivered, and the actual date/source is found.
Ask participants to explain the boundary between game readings and real NISAR, and why a colour alone is insufficient for a flood claim.
Keep verbatim enjoyment comments only with permission; do not convert a small convenience sample into a population-wide learning claim.
