# Chapter 4 event-icon review

Run `node tools/map-review/chapter4-events/server.mjs` and open http://127.0.0.1:5200/ . The approved icons and crossing spacing are integrated into production, based on main plus the Chapter 4 work in !100. This review page uses the shared production renderer and canonical portal data. It never calls the API or writes saves.

The preview runs the actual TunnelMap movement, masks, raised surfaces, lighting, interaction selection and C/F/Space traversal. Its isolated adapter substitutes marker drawing and the review camera. E simulates completing the current fixed event, advancing the preview's trap/valve flags or optional completion record; it does not run event cards or dice. Completing the preview trap unlocks the existing valve and F gate. Automatic boss entry shows a local message. Progress controls can also simulate the existing flags and records. No API or save is used; the real game still requires choosing and resolving the event card.

Below 1x review zoom, the darkness overlay covers the full artwork instead of only the production camera rectangle. It retains the original gradients, lamp positions and blend modes, eliminating a rectangular lighting seam when showing more of the map. At normal/closer zoom the original production lighting method runs unchanged.

The canonical portal data includes three approved spacing adjustments: the north C approach is (910,650) with 40px reach; the west stone-edge return is (770,700), retaining 44px reach; the valve-side water-jump bank is (805,817) with 36px reach. Each activation circle is separated from the valve's 56px E circle. Both C ridge landings, the other water-jump bank, all floor/surface rules and intentional blockers remain unchanged. Markers and actual key activation use the same anchors.

Six pixel props share one cached 264x44 canvas (46,464 RGBA bytes), displayed at 1.4 scale. Mint, coral, lilac and cream accents distinguish them from the dark canal. The entry remains scenery. Random areas have no icons. Optional names fade in on approach and out on departure; unfinished mandatory event names stay visible on their floor, with the valve's existing prerequisite stated while locked. Nearby E interactions take visual priority over movement labels; other movement markers dim, and at most the nearest active crossing has a label. Existing event-card outcomes and unlock rules are unchanged.

Direct review links use `?focus=false_kitten_trap`, `momo_marks`, `lamp_map`, `light_switch`, `valve_three`, `exit_boss`, `e1`, `tank-climb`, `upper-gap-jump`, or `lower`.

To test the valve's E prompt immediately, use `?focus=valve_three&progress=trap`; `progress=arrival` preserves its locked state and `progress=valve` simulates its completed event record.

WASD/arrows walk, E simulates fixed-event completion, C/F/Space use the actual crossings, wheel zooms, and Tab holds the original marker view. Use the baseline toggle and all-names checkbox for comparison. Only the minimal preview type check and targeted browser checks are needed before manual review.
