# L0 placement and v02 aspect audit

All coordinates are unchanged v07 collision rectangles. Each new sprite uses one scalar transform; integer pixel sampling does not introduce a second scale. Native compound-strip variants are recorded in the recipe and manifest.

| ID | Collision x,y,w,h | Source / native pixels | Uniform scale | Draw x,y,w,h | Rotation | v02 distortion | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| west_upper_tall_rack | 393,244,151,101 | rack_low_wide / 174x110 | 0.856322 | 394.00,249.80,149.00,94.20 | 0 | 1.765x | Low three-tier shelf; its native wide silhouette fits the authored horizontal footprint. |
| west_wide_rack | 416,412,166,96 | rack_low_wide / 174x110 | 0.854545 | 424.65,413.00,148.69,94.00 | 0 | 1.880x | Remove an empty tier rather than compressing a tall rack into this wide bay. |
| west_lower_rack | 409,595,151,99 | rack_low_pallets / 135x99 | 0.979798 | 418.36,596.00,132.27,97.00 | 0 | 1.465x | Low loaded shelf keeps the original crate-bay proportions. |
| west_crates | 255,667,106,91 | crate_cage / 95x85 | 1.047059 | 258.26,668.00,99.47,89.00 | 0 | 1.045x | Natural near-square steel crate; no shape correction required. |
| west_service_equipment | 205,457,91,102 | machine_power_big / 70x87 | 1.149425 | 210.27,458.00,80.46,100.00 | 0 | 1.106x | Upright power cabinet fits the service-equipment footprint. |
| west_repair_pallet | 174,355,61,53 | crate_one / 63x68 | 0.750000 | 180.88,356.00,47.25,51.00 | 0 | 1.072x | Single small repair crate, uniformly reduced. |
| west_broken_shelf | 346,705,49,95 | rack_mesh_01 / 82x167 | 0.556886 | 347.67,706.00,45.66,93.00 | 0 | 1.029x | Naturally narrow mesh rack preserves the tall obstruction. |
| center_upper_rack | 637,261,134,83 | rack_low_wide / 174x110 | 0.736364 | 639.94,262.00,128.13,81.00 | 0 | 1.554x | Low broad rack preserves the central shared aisle edges. |
| center_mid_container | 630,424,144,112 | container_tarp03 / 151x134 | 0.820896 | 640.02,425.00,123.96,110.00 | 0 | 1.421x | Choose a wider native tarp grouping; small side insets remain explicit. |
| center_lower_rack | 637,629,113,113 | rack_crates_03 / 151x144 | 0.735099 | 638.00,635.15,111.00,105.85 | 0 | 1.049x | Loaded rack is already close to this square footprint. |
| southwest_pallets | 548,775,76,43 | pallet02 / 84x58 | 0.706897 | 556.31,776.00,59.38,41.00 | 0 | 1.354x | Low pallet retains natural boards and feet. |
| center_fallen_boxes | 759,633,49,65 | crate_stack_two / 72x90 | 0.652778 | 760.00,638.25,47.00,58.75 | 0 | 1.145x | Naturally tall pair of boxes matches this narrow obstruction. |
| east_upper_container | 897,276,132,113 | container_tarp02 / 131x122 | 0.909836 | 903.41,277.00,119.19,111.00 | 0 | 1.091x | Native squat covered container matches the upper east bay. |
| east_mid_rack | 932,445,108,96 | rack_crates_03 / 151x144 | 0.652778 | 936.72,446.00,98.57,94.00 | 0 | 1.215x | Loaded rack retains its shelf/crate proportions. |
| east_lower_container | 909,641,127,90 | container_low / 151x106 | 0.827815 | 910.00,642.25,125.00,87.75 | 0 | 1.563x | Use a shorter tarp-and-crate assembly instead of crushing a tall tarp. |
| east_top_rack | 1127,320,121,77 | rack_low_wide / 174x110 | 0.681818 | 1128.18,321.00,118.64,75.00 | 0 | 1.681x | A low shelf variant fits this wide shallow footprint. |
| east_center_rack | 1124,462,108,81 | rack_low_pallets / 135x99 | 0.785185 | 1125.00,464.27,106.00,77.73 | 0 | 1.280x | Low crate bay keeps a consistent apparent scale with adjacent shelves. |
| east_lower_crates | 1148,639,112,88 | crate_cage / 95x85 | 1.011765 | 1155.94,640.00,96.12,86.00 | 0 | 1.144x | Natural steel crate shape, uniformly fitted. |
| far_east_top_machine | 1359,394,114,94 | machine_cabinet_wide / 94x117 | 0.957265 | 1360.00,397.02,112.00,89.98 | 90 | 1.022x | Overturned electrical cabinet; documented quarter turn preserves all proportions. |
| far_east_bottom | 1367,654,101,91 | container_tarp03 / 151x134 | 0.655629 | 1368.00,656.15,99.00,87.85 | 0 | 1.013x | Use the native broad covered stack. |
| southeast_pallets | 1090,774,67,45 | pallet02 / 84x58 | 0.741379 | 1092.36,775.00,62.28,43.00 | 0 | 1.044x | Native wide wooden pallet. |
| northeast_spare_drums | 1257,333,56,72 | drums / 108x89 | 0.606742 | 1258.00,338.47,54.00,65.53 | 90 | 1.068x | An overturned drum grouping suits the narrow scrap-storage footprint. |
| northeast_tilted_container | 1265,458,77,88 | container_tarp01 / 110x131 | 0.656489 | 1267.39,459.00,72.21,86.00 | 0 | 1.039x | Naturally narrow covered container; the silhouette needs no distortion. |
| east_mid_crate_stack | 1402,536,78,83 | crate_pallet_mixed / 88x103 | 0.786408 | 1406.40,537.00,69.20,81.00 | 0 | 1.098x | Loaded mixed crate stack, uniformly reduced. |
| east_loading_rejects | 1215,743,72,62 | crate_cage / 95x85 | 0.705882 | 1217.47,744.00,67.06,60.00 | 0 | 1.044x | Rejected wire crate retains its near-square appearance. |
| south_loading_crate | 850,797,74,52 | pallet02 / 84x58 | 0.857143 | 851.00,798.29,72.00,49.71 | 0 | 1.152x | Low loading pallet matches the shallow authored block. |
| upper_access_pallet | 1064,294,42,64 | crate_stack_two / 72x90 | 0.555556 | 1065.00,307.00,40.00,50.00 | 0 | 1.571x | Choose a naturally tall stack instead of stretching a square pallet vertically. |
| west_cross_spill | 325,521,68,32 | rubble03 / 89x50 | 0.600000 | 332.30,522.00,53.40,30.00 | 0 | 1.236x | Natural low brick spill, with conservative draw bounds inside collision. |
| central_misplaced_pallet | 805,459,72,35 | pallet_low / 84x38 | 0.833333 | 806.00,461.33,70.00,31.67 | 0 | 1.591x | Short native slat assembly replaces a flattened full-height pallet. |
| east_transverse_rubble | 1055,548,64,39 | rubble02 / 78x49 | 0.755102 | 1057.55,549.00,58.90,37.00 | 0 | 1.130x | Low broken-brick group fits the transverse obstruction. |
| east_spare_forklift | 1273,556,59,54 | machine_forklift / 170x176 | 0.295455 | 1277.39,557.00,50.23,52.00 | 0 | 1.059x | Keep the complete forklift silhouette; small scale is an explicit review outlier. |
| west_overturned_pallets | 402,260,46,28 | pallet02 / 84x58 | 0.448276 | 406.17,261.00,37.66,26.00 | 0 | 1.168x | Uniformly reduced overturned pallet. |
| west_collapsed_upright | 307,449,91,28 | fallen_rack_beams / 174x53 | 0.490566 | 309.82,450.00,85.36,26.00 | 0 | 3.562x | Reassemble native steel beams; do not squeeze a 181 px upright into 28 px. |
| west_loading_rejects | 155,640,86,39 | pallet_low / 84x38 | 0.973684 | 157.11,641.00,81.79,37.00 | 0 | 1.568x | Low stacked board variant communicates the full width without aspect distortion. |
| south_central_scrap | 763,750,47,36 | rubble02 / 78x49 | 0.576923 | 764.00,756.73,45.00,28.27 | 0 | 1.203x | Small native rubble group, not an invented obstacle. |
| upper_east_fallen_rack | 1014,460,60,48 | crate_cage / 95x85 | 0.541176 | 1018.29,461.00,51.41,46.00 | 0 | 1.203x | Wire-mesh fallen panel from the same approved steel family, without stretching. |
| upper_east_cross_pallet | 1178,413,57,33 | pallet02 / 84x58 | 0.534483 | 1184.05,414.00,44.90,31.00 | 0 | 1.225x | Native pallet fits the shared-road crossing block. |
| east_dock_displaced_stack | 1387,383,70,31 | pallet_low / 84x38 | 0.763158 | 1389.95,384.00,64.11,29.00 | 0 | 1.759x | Low board stack fits the wide dock footprint with natural pixel proportions. |
