import type {GameState} from '../../contracts';
import {HOME_SIZE, HOME_SLOTS, homeStage} from './layout';

type HomeAppearance = Pick<GameState, 'flags' | 'placements'> & Partial<Pick<GameState, 'phase' | 'storyNodeId'>>;
export function homeAppearanceKey(state: HomeAppearance): string {
  return `${homeStage(state)}|${Object.entries(state.placements).sort(([a], [b]) => a.localeCompare(b)).map(([slot, id]) => `${slot}:${id}`).join('|')}`;
}

// One original pixel-art map for both the live scene and the chapter-map inset.
// Every decoration is deterministic, so opening the map never rearranges home.
export function paintHomestead(ctx: CanvasRenderingContext2D, state: HomeAppearance) {
  const stage = homeStage(state), dry = stage >= 2, warm = stage >= 3;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const noise = (x: number, y: number) => ((x * 327 + y * 173 + 71) >>> 0) % 101;
  const shadow = (x: number, y: number, w: number, h: number) => rect(x, y, w, h, '#2c392b35');
  const flower = (x: number, y: number, color: string) => {
    rect(x + 2, y + 3, 2, 5, '#4c723f'); rect(x, y, 6, 4, color); rect(x + 2, y + 1, 2, 2, '#f5d882');
  };
  const pot = (x: number, y: number, bloom = false) => {
    shadow(x - 8, y + 1, 20, 5);
    rect(x - 7, y - 6, 14, 13, '#87503c'); rect(x - 9, y - 8, 18, 5, '#c67e51');
    rect(x - 4, y - 2, 7, 7, '#b36b49');
    rect(x - 2, y - 25, 4, 17, '#4d713c'); rect(x - 11, y - 21, 11, 7, '#5b8748');
    rect(x + 2, y - 28, 10, 8, '#749d50'); rect(x - 7, y - 29, 8, 7, '#8bac5e');
    if (bloom) {flower(x - 8, y - 31, '#e5aaa0'); flower(x + 3, y - 33, '#f3d59c');}
  };
  const tree = (x: number, y: number, size = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    shadow(-24, -3, 60, 14);
    rect(-5, -40, 12, 44, '#654d34'); rect(-2, -38, 4, 40, '#9c7144');
    rect(-25, -76, 52, 40, '#354f36'); rect(-35, -66, 70, 24, '#405f3a');
    rect(-24, -89, 48, 38, '#557945'); rect(-34, -72, 64, 20, '#648a4d');
    rect(-18, -96, 32, 26, '#6e9653'); rect(-24, -76, 20, 8, '#88a963');
    rect(2, -83, 22, 8, '#7b9d57'); rect(-32, -57, 14, 6, '#719653');
    rect(16, -58, 15, 5, '#314d32'); rect(-10, -91, 13, 4, '#9bb878');
    for (let i = 0; i < 6; i++) rect(-21 + (i * 19) % 43, -82 + (i * 23) % 38, 4, 3, '#a6bb734d');
    ctx.restore();
  };
  const fence = (x: number, y: number, count: number) => {
    rect(x, y - 15, count * 24, 4, '#a77b48'); rect(x, y - 5, count * 24, 4, '#805e39');
    for (let i = 0; i <= count; i++) {
      rect(x + i * 24, y - 23, 6, 30, '#795837'); rect(x + i * 24, y - 23, 6, 3, '#d2ac6d');
      rect(x + i * 24 + 1, y - 18, 2, 21, '#b18a53');
    }
  };
  ctx.save(); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  rect(0, 0, HOME_SIZE.width, HOME_SIZE.height, dry ? '#7f9856' : '#748979');
  // Meadow tiles, soft grass borders and wildflowers, with no perspective grid.
  for (let y = 0; y < 480; y += 16) for (let x = 0; x < 800; x += 16) {
    const n = noise(x, y);
    rect(x, y, 16, 16, dry ? ['#859e5a', '#8ba55f', '#7e9956'][n % 3] : ['#7d917a', '#798e78', '#82977e'][n % 3]);
    if (n < 52) {rect(x + n % 12, y + 4, 2, 5, dry ? '#a2b975' : '#9eae8d'); rect(x + n % 12 + 3, y + 6, 2, 3, '#5e7b4c');}
    if (n > 92) flower(x + 5, y + 4, n % 2 ? '#e9cd9b' : '#e8b7af');
  }
  // A winding dirt path connects the same south door and eastern garden.
  rect(32, 414, 736, 40, '#a3895a'); rect(32, 418, 736, 32, '#c4aa76');
  rect(336, 366, 48, 114, '#ac8e5d'); rect(340, 366, 40, 114, '#ceb17d');
  rect(602, 318, 36, 126, '#a58b59'); rect(606, 318, 28, 126, '#c5ab76');
  for (let i = 0; i < 112; i++) {
    const x = 35 + (i * 89) % 725, y = 420 + (i * 17) % 27;
    rect(x, y, i % 3 ? 3 : 5, 2, i % 2 ? '#e2c695' : '#b49a66');
  }
  for (let i = 0; i < 5; i++) {rect(348, 386 + i * 18, 24, 10, '#938c70'); rect(348, 386 + i * 18, 22, 7, '#beb79a');}
  // Small pond and planted beds make the eastern courtyard a real outdoor area.
  rect(664, 74, 80, 44, '#526c4a'); rect(652, 86, 104, 20, '#526c4a');
  rect(668, 78, 72, 36, '#638f8c'); rect(656, 90, 96, 12, '#638f8c');
  rect(674, 82, 58, 3, '#96b8a8'); rect(682, 100, 42, 2, '#a9c9b4');
  rect(719, 86, 13, 6, '#5f8050'); rect(722, 84, 7, 3, '#87a264'); flower(724, 82, '#e7c3b0');
  for (let row = 0; row < 3; row++) {
    const y = 179 + row * 44;
    shadow(653, y + 22, 86, 7); rect(648, y, 88, 30, '#665039'); rect(652, y + 3, 80, 24, '#86603e');
    rect(648, y, 88, 3, '#b0915d'); rect(648, y + 27, 88, 4, '#b0915d');
    for (let j = 0; j < 6; j++) {
      rect(658 + j * 12, y + 8, 2, 13, '#593c2e');
      if (stage >= 2 || row === 2) {
        rect(657 + j * 12, y + 3, 3, 13, '#536e36'); rect(653 + j * 12, y + 4, 7, 4, '#83a950');
        rect(660 + j * 12, y + 7, 5, 4, '#6d913f');
        if (warm && row === 1) flower(654 + j * 12, y, '#dba0aa');
      }
    }
  }
  fence(632, 153, 5); fence(36, 400, 3); fence(636, 400, 4);
  // Cutaway greenhouse: a shallow glass roof, north wall and a broad wood floor.
  shadow(136, 108, 478, 296); shadow(142, 393, 468, 13);
  rect(128, 96, 480, 296, '#624d3a'); rect(136, 104, 464, 280, '#a98a5e');
  rect(144, 144, 448, 240, dry ? '#b58a57' : '#8f8067');
  for (let row = 0; row < 15; row++) for (let col = 0; col < 14; col++) {
    const x = 144 + col * 32, y = 144 + row * 16, n = noise(col, row);
    rect(x, y, 31, 15, dry ? ['#c39c68', '#caa470', '#bd935f'][n % 3] : ['#a29277', '#9b8c73', '#a7987c'][n % 3]);
    rect(x + (row % 2 ? 13 : 4), y + 7, 14, 1, dry ? '#ad8050' : '#877960');
    if (n % 5 === 0) rect(x + 23, y + 11, 3, 1, '#806344');
  }
  rect(136, 104, 464, 40, dry ? '#d4bf90' : '#b4b5a0');
  rect(144, 136, 448, 6, '#79603d'); rect(144, 140, 448, 6, '#6b503539');
  // Glazed skylight panels and wooden roof beams.
  rect(122, 70, 492, 38, '#425e51'); rect(128, 66, 480, 36, '#789b87');
  for (let x = 136; x < 600; x += 48) {
    rect(x, 72, 40, 26, dry ? '#b5ceac' : '#9db8b0'); rect(x + 3, 73, 4, 20, '#e1e8c45c');
    rect(x + 8, 74, 20, 2, '#dbe5c3'); rect(x + 40, 68, 6, 36, '#536b4c');
  }
  rect(120, 100, 496, 8, '#5d6343'); rect(120, 100, 496, 2, '#9aa576');
  for (const x of [152, 280, 440, 568]) {
    rect(x, 110, 40, 22, dry ? '#a8c3a2' : '#879e9a'); rect(x + 18, 110, 3, 22, '#6b7f5a');
    rect(x, 120, 40, 3, '#6b7f5a'); rect(x - 3, 132, 46, 5, '#af8956');
  }
  for (const x of [136, 592]) {rect(x, 112, 8, 272, '#6a5739'); rect(x + 2, 114, 3, 264, '#ad8d5d');}
  rect(128, 382, 208, 10, '#786144'); rect(384, 382, 224, 10, '#786144');
  rect(128, 380, 208, 3, '#c1a16e'); rect(384, 380, 224, 3, '#c1a16e');
  rect(330, 382, 6, 16, '#70543a'); rect(384, 382, 6, 16, '#70543a');
  // Low workbench, supplies and a welcome mat retain their locations at all stages.
  shadow(168, 197, 92, 8); rect(168, 174, 88, 22, '#775036'); rect(164, 170, 96, 8, '#c29a61');
  rect(171, 174, 82, 3, '#9e7449'); rect(172, 194, 6, 15, '#63492f'); rect(246, 194, 6, 15, '#63492f');
  rect(198, 180, 30, 12, '#986c44'); rect(210, 184, 8, 3, '#d2b46d');
  rect(180, 158, 24, 12, '#a18455'); rect(180, 157, 24, 3, '#d2b37a');
  rect(218, 160, 26, 5, '#697873'); rect(224, 158, 4, 15, '#b29869');
  rect(290, 151, 42, 24, '#8a643f'); rect(288, 149, 46, 5, '#bf9961');
  rect(307, 155, 8, 15, '#dac07f'); rect(309, 160, 4, 4, '#775535');
  rect(340, 358, 40, 20, '#7c8061'); rect(343, 361, 34, 14, '#b8ac80'); rect(349, 366, 22, 3, '#8e9568');
  pot(158, 246, warm); pot(574, 156, dry); pot(574, 366, warm); pot(626, 309, warm);
  if (warm) {
    rect(144, 154, 448, 7, '#87643e'); rect(144, 154, 448, 2, '#bf9c66');
    rect(468, 275, 70, 66, '#ffe6a640'); rect(478, 275, 14, 66, '#fff0b62e');
    rect(504, 275, 12, 66, '#fff0b62e');
    rect(560, 200, 6, 55, '#a18b59'); rect(548, 199, 30, 7, '#c5af79'); rect(548, 240, 30, 7, '#c5af79');
  }
  if (!dry) {
    for (const [x, y] of [[318, 276], [470, 346]]) {
      rect(x, y, 42, 10, '#648c8b'); rect(x + 5, y - 2, 28, 14, '#759b96'); rect(x + 11, y + 1, 16, 2, '#bbd0bb');
    }
    rect(238, 76, 24, 18, '#5c7d73'); rect(248, 76, 4, 13, '#c2d2bc'); rect(250, 87, 10, 3, '#c2d2bc');
    rect(472, 73, 16, 18, '#5c7d73'); rect(477, 74, 3, 12, '#d0d9c3');
  } else {
    for (const x of [230, 478]) {
      rect(x, 81, 30, 8, '#b08957'); rect(x + 1, 82, 28, 2, '#d3b17c');
      rect(x + 3, 83, 2, 2, '#594a35'); rect(x + 25, 83, 2, 2, '#594a35');
    }
  }
  // A little warm lantern; the rest of the light string arrives after repair.
  rect(431, 116, 2, 14, '#6a5135'); rect(426, 128, 12, 14, '#79603b');
  rect(428, 130, 8, 8, '#f2d18a'); rect(429, 131, 4, 5, '#ffe6aa');
  if (dry) for (let x = 160; x < 584; x += 24) {
    const sag = Math.round(Math.sin((x - 160) / 424 * Math.PI) * 9);
    rect(x, 111 + sag, 24, 1, '#6c6246');
    if (x % 48 === 16) {rect(x + 9, 112 + sag, 2, 4, '#765a37'); rect(x + 7, 116 + sag, 6, 7, '#f3d395');}
  }
  if (stage === 4) {
    for (let i = 0; i < 13; i++) {
      const x = 160 + i * 34, y = 154 + Math.round(Math.sin(i / 12 * Math.PI) * 12);
      rect(x, y, 34, 1, '#69543c'); rect(x + 6, y + 2, 12, 5, ['#d28b79', '#d6b46d', '#8caa81'][i % 3]);
      rect(x + 9, y + 7, 6, 4, ['#d28b79', '#d6b46d', '#8caa81'][i % 3]);
    }
    for (let i = 0; i < 3; i++) {rect(400 + i * 22, 400, 16, 7, ['#6f95a0', '#be8463', '#93a578'][i]); rect(402 + i * 22, 400, 12, 3, '#cee0c8');}
  }
  for (const [slot, id] of Object.entries(state.placements)) {
    const point = HOME_SLOTS[slot];
    if (point) paintHomeFurniture(ctx, id, point.x, point.y, stage);
  }
  if (!dry && !state.placements.corner) paintHomeFurniture(ctx, 'cardboard_nest', HOME_SLOTS.corner.x, HOME_SLOTS.corner.y, stage);
  tree(62, 174, 1.15); tree(96, 300, .8); tree(740, 164, .8); tree(749, 373, .9);
  tree(42, 494, 1.15); tree(764, 497, 1.05);
  pot(295, 402, warm); pot(424, 402, warm);
  // Garden sign, stepping stones and a watering can.
  rect(638, 332, 4, 24, '#73583a'); rect(628, 328, 25, 12, '#c5a06b'); rect(632, 332, 16, 2, '#7c6945');
  rect(744, 273, 13, 14, '#698e89'); rect(747, 269, 8, 5, '#a8bbb0'); rect(756, 275, 8, 4, '#698e89');
  ctx.restore();
}

export function paintHomeFurniture(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, stage: number) {
  const r = (dx: number, dy: number, w: number, h: number, color: string) => {ctx.fillStyle = color; ctx.fillRect(x + dx, y + dy, w, h);};
  r(-24, 7, 51, 6, '#4c3c2a28');
  if (id === 'moon_hammock') {
    const top = Math.min(y - 36, stage >= 3 ? 160 : y - 40);
    r(-22, top - y, 2, y - top - 6, '#9d8654'); r(20, top - y, 2, y - top - 6, '#9d8654');
    r(-26, -12, 52, 6, '#eee0b7'); r(-23, -6, 46, 6, '#d9c28d'); r(-17, 0, 34, 4, '#baa16f');
  } else if (id === 'cardboard_nest' || id === 'box_castle') {
    r(-25, -20, 50, 35, '#aa7c4e'); r(-25, -20, 50, 4, '#d1ad72'); r(-20, -13, 40, 23, '#c39860');
    r(-10, -3, 20, 18, '#624a34'); r(-7, 0, 14, 15, '#7d6040');
    r(-28, -24, 56, 7, '#dcc08b'); r(-18, -20, 2, 5, '#f1d59c');
    if (id === 'box_castle') for (let i = 0; i < 3; i++) {r(-27 + i * 21, -32, 12, 12, '#ba925b'); r(-27 + i * 21, -32, 12, 3, '#e2c38c');}
  } else if (id === 'blue_bowl') {
    r(-18, -2, 36, 14, '#4c768b'); r(-22, -5, 44, 8, '#83b3ba'); r(-16, -4, 32, 4, '#ead2a2'); r(-11, -3, 5, 2, '#a7804b');
  } else if (id === 'tin_lamp' || id === 'sun_lamp' || id === 'star_glass') {
    r(-24, -24, 48, 48, '#f5d38b25'); r(-16, -16, 32, 32, '#ffe3a325');
    r(-7, -25, 14, 4, '#5f6554'); r(-9, -21, 18, 21, '#b79458'); r(-6, -19, 12, 14, '#ffe3a0');
    r(-9, -3, 18, 5, '#6d6c51'); r(-3, -31, 6, 6, '#77745b');
    if (id === 'star_glass') {r(-3, -18, 6, 12, '#e2e5cf'); r(-6, -15, 12, 5, '#f8f0b8');}
  } else {
    const color = id === 'red_cushion' ? '#b96f61' : id === 'snack_cushion' ? '#bc925d' : id === 'cloud_nest' ? '#ece2c9' : '#bc9282';
    r(-27, -7, 54, 22, color); r(-23, -11, 46, 6, color); r(-20, -4, 40, 12, '#f1d6ac');
    r(-27, 12, 54, 3, '#8e6f573c'); r(-18, 0, 36, 2, '#b59372');
    if (id === 'snack_cushion') {r(-9, 0, 18, 4, '#916a43'); r(-3, -3, 5, 10, '#916a43');}
  }
}
