#!/usr/bin/env python3
"""Deterministic Chapter 5 art registration; never writes locked source geometry."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'level_design/chapter5'
ART, REVIEW = BASE / 'art', BASE / 'review'
W, H = 1672, 941
NS = {'s': 'http://www.w3.org/2000/svg'}
FONT = ImageFont.load_default(size=12)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def playtest_geometry(source):
    geometry = copy.deepcopy(source)
    changes = read_json(BASE / 'playtest_adjustments.json')['solidInsets']
    assert set(changes) <= {solid['id'] for solid in geometry['solids']}
    for solid in geometry['solids']:
        inset = changes.get(solid['id'], {})
        assert set(inset) <= {'left', 'right', 'top', 'bottom'} and all(0 <= n <= 24 for n in inset.values())
        solid['x'] += inset.get('left', 0)
        solid['w'] -= inset.get('left', 0) + inset.get('right', 0)
        solid['y'] += inset.get('top', 0)
        solid['h'] -= inset.get('top', 0) + inset.get('bottom', 0)
    return geometry


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_sources():
    lock = read_json(BASE / 'source_lock.json')
    for name, record in lock['files'].items():
        path = BASE / name
        assert sha(path) == record['sha256'], f'Locked source changed: {name}'
        assert path.stat().st_size == record['bytes'], name
    return lock


def svg_polygons(element):
    polygons = []
    for node in element.findall('s:path', NS):
        commands = re.findall(r'[A-Za-z]', node.attrib['d'])
        assert set(commands) <= {'M', 'L', 'Z'}, 'Unexpected authored floor path command'
        values = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', node.attrib['d'])]
        polygons.append([[int(values[i]), int(values[i + 1])] for i in range(0, len(values), 2)])
    return polygons


def polygon_mask(polygons):
    # Pixel centers exactly represent these integer-aligned SVG M/L/Z paths.
    yy, xx = np.mgrid[:H, :W].astype(np.float64)
    xx += .5
    yy += .5
    union = np.zeros((H, W), dtype=bool)
    for polygon in polygons:
        inside = np.zeros_like(union)
        for i, (xi, yi) in enumerate(polygon):
            xj, yj = polygon[i - 1]
            if yi == yj:
                continue
            inside ^= ((yi > yy) != (yj > yy)) & (xx < (xj - xi) * (yy - yi) / (yj - yi) + xi)
        union |= inside
    return union


def dilate(mask, iterations):
    result = mask.copy()
    for _ in range(iterations):
        expanded = result.copy()
        expanded[1:] |= result[:-1]
        expanded[:-1] |= result[1:]
        expanded[:, 1:] |= result[:, :-1]
        expanded[:, :-1] |= result[:, 1:]
        result = expanded
    return result


def ground_registration(polygons, recipe):
    original = Image.open(ART / 'source/approved_ground_only_1672x941.png').convert('RGBA')
    pixels = np.array(original)
    floor = polygon_mask(polygons)
    # Isolate the connected exterior, rather than recoloring dark floor cracks.
    flat = np.all(pixels[:, :, :3] == pixels[0, 0, :3], axis=2)
    flood = Image.fromarray(flat.astype(np.uint8))
    ImageDraw.floodfill(flood, (0, 0), 2, thresh=0)
    outside = np.array(flood) == 2
    # The approved raster also contains an inset southeast wall that is not
    # connected to the flat exterior. Mask this source-art remnant explicitly;
    # these are texture-repair coordinates, never replacement game geometry.
    remnant_mask = Image.new('1', (W, H))
    remnant_draw = ImageDraw.Draw(remnant_mask)
    for remnant in recipe['groundTextureRepairs']:
        remnant_draw.line([tuple(p) for p in remnant['sourcePolyline']], fill=1, width=remnant['width'], joint='curve')
    old_wall_band = dilate(outside, 23) | np.array(remnant_mask, dtype=bool)
    repairs = floor & old_wall_band
    safe = floor & ~old_wall_band
    yy, xx = np.nonzero(repairs)
    pending = np.ones(len(xx), dtype=bool)
    rgb = pixels.copy()
    # Translate nearby approved floor pixels into only the old perimeter/void
    # area. No image resampling, global stretch, generated texture or light pool.
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)]
    for radius in range(24, 321, 8):
        for dx, dy in directions:
            ids = np.flatnonzero(pending)
            if not len(ids):
                break
            sx = np.clip(xx[ids] + dx * radius, 0, W - 1)
            sy = np.clip(yy[ids] + dy * radius, 0, H - 1)
            valid = safe[sy, sx]
            selected = ids[valid]
            rgb[yy[selected], xx[selected]] = pixels[sy[valid], sx[valid]]
            pending[selected] = False
        if not pending.any():
            break
    assert not pending.any(), 'Ground registration has an unfilled perimeter patch'
    rgb[:, :, 3] = floor.astype(np.uint8) * 255
    result = Image.fromarray(rgb)
    # Native approved wall trim, tiled (never stretched) along the authored edge.
    wall_tile = original.crop((392, 178, 424, 187))
    wall = Image.new('RGBA', (W, H))
    for polygon in polygons:
        area = sum(polygon[i - 1][0] * p[1] - p[0] * polygon[i - 1][1] for i, p in enumerate(polygon))
        for i, (x1, y1) in enumerate(polygon):
            x2, y2 = polygon[(i + 1) % len(polygon)]
            dx, dy = x2 - x1, y2 - y1
            nx, ny = (-dy, dx) if area > 0 else (dy, -dx)
            if dy == 0:
                tile = wall_tile if ny > 0 else wall_tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                top = y1 if ny > 0 else y1 - tile.height
                for x in range(min(x1, x2), max(x1, x2), tile.width):
                    piece = tile.crop((0, 0, min(tile.width, max(x1, x2) - x), tile.height))
                    wall.alpha_composite(piece, (x, top))
            else:
                tile = wall_tile.transpose(Image.Transpose.ROTATE_270)
                if nx < 0:
                    tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                left = x1 if nx > 0 else x1 - tile.width
                for y in range(min(y1, y2), max(y1, y2), tile.height):
                    piece = tile.crop((0, 0, tile.width, min(tile.height, max(y1, y2) - y)))
                    wall.alpha_composite(piece, (left, y))
    wall.putalpha(Image.fromarray((np.array(wall.getchannel('A'), dtype=np.uint16) * floor).astype(np.uint8)))
    result.alpha_composite(wall)
    result.putalpha(Image.fromarray(floor.astype(np.uint8) * 255))
    return result, floor, {
        'sourceScale': 1, 'sourceOffset': [0, 0], 'floorAuthority': 'source/v07/warehouse_L0_graybox_v07.svg#l0-floor',
        'repairPixels': int(repairs.sum()), 'repairMethod': 'Nearby approved texture translated into old boundary/void band; original wall trim tiled at native scale.',
        'wallTextureSourceRect': [392, 178, 32, 9], 'wallDrawDepth': 9,
        'sourceTextureRepairs': recipe['groundTextureRepairs'],
        'perimeterCoordinateError': 0, 'floorAlphaMismatchPixels': 0,
        'unmodifiedInteriorPixels': int((floor & ~repairs & (np.array(wall.getchannel('A')) == 0)).sum()),
    }


def asset_images(recipe):
    sources = {p.stem: Image.open(p).convert('RGBA') for p in (ART / 'source/sprites').glob('*.png')}
    variants = {}
    for name, record in recipe['variants'].items():
        source = sources[record['source']]
        height = sum(end - start for start, end in record['rows'])
        image = Image.new('RGBA', (source.width, height))
        y = 0
        pieces = []
        for start, end in record['rows']:
            assert 0 <= start < end <= source.height
            image.alpha_composite(source.crop((0, start, source.width, end)), (0, y))
            pieces.append({'sourceRect': [0, start, source.width, end - start], 'localOffset': [0, y], 'scale': 1})
            y += end - start
        image.save(ART / f'variants/{name}.png')
        variants[name] = {'source': f'art/source/sprites/{record["source"]}.png', 'pieces': pieces, 'reason': record['reason']}
        sources[name] = image
    return sources, variants


def rotated(image, degrees):
    assert math.isfinite(degrees) and abs(degrees) <= 360
    turn = degrees % 360
    if turn in (0, 90, 180, 270):
        return image if not turn else image.transpose({90: Image.Transpose.ROTATE_270, 180: Image.Transpose.ROTATE_180, 270: Image.Transpose.ROTATE_90}[turn])
    return image.rotate(-degrees, resample=Image.Resampling.NEAREST, expand=True)


def transformed(image, scale, x, y):
    # One isotropic affine matrix, including pixel rounding by the sampler.
    return image.transform((W, H), Image.Transform.AFFINE, (1 / scale, 0, -x / scale, 0, 1 / scale, -y / scale), resample=Image.Resampling.NEAREST)


def selected_cluster_ids(geometry, recipe):
    settings = recipe['distribution']
    eligible = [s['id'] for s in geometry['solids'] if s['w'] >= settings['minWidth'] and s['h'] >= settings['minHeight']]
    ranked = sorted(eligible, key=lambda name: hashlib.sha256((settings['seed'] + '|' + name).encode()).hexdigest())
    return set(ranked[:settings['mixedCount']])


def compose_props(geometry, recipe, images, variants, old):
    canvas = Image.new('RGBA', (W, H))
    records = []
    for solid in geometry['solids']:
        name, rotation, rationale = recipe['placements'][solid['id']]
        cluster = recipe.get('clusters', {}).get(solid['id'], {})
        name = cluster.get('baseAsset', name)
        rotation = cluster.get('baseRotation', rotation)
        original = images[name]
        image = rotated(original, rotation)
        overhang = cluster.get('upwardOverhang', 0)
        assert 0 <= overhang <= 24
        envelope = {'x': solid['x'], 'y': solid['y'] - overhang, 'w': solid['w'], 'h': solid['h'] + overhang}
        s = min((solid['w'] - 2) / image.width, (solid['h'] - 2) / image.height) * cluster.get('baseScale', 1)
        width, height = image.width * s, image.height * s
        x = solid['x'] + 1 + (solid['w'] - 2 - width) * cluster.get('baseAlignX', .5)
        y = solid['y'] + solid['h'] - 1 - height
        draw = transformed(image, s, x, y)
        source_path = lambda asset: f'art/{"variants" if asset in variants else "source/sprites"}/{asset}.png'
        components = [{'sourceSprite': source_path(name), 'sourceNaturalSize': list(original.size), 'rotatedNaturalSize': list(image.size), 'rotationDegrees': rotation, 'uniformScale': s, 'scaleX': s, 'scaleY': s, 'drawRect': {'x': x, 'y': y, 'w': width, 'h': height}}]
        for extra in cluster.get('extras', []):
            sprite = rotated(images[extra['asset']], extra['rotation'])
            if 'slot' in extra:
                sx, sy, sw, sh = extra['slot']
                es = min(sw / sprite.width, sh / sprite.height)
                ex = solid['x'] + sx + (sw - sprite.width * es) / 2
                ey = solid['y'] + sy + sh - sprite.height * es
            else:
                ex, ey = solid['x'] + extra['offset'][0], solid['y'] + extra['offset'][1]
                es = extra['scale']
            bounds = {'x': ex, 'y': ey, 'w': sprite.width * es, 'h': sprite.height * es}
            assert ex >= envelope['x'] and ey >= envelope['y'] and ex + bounds['w'] <= solid['x'] + solid['w'] and ey + bounds['h'] <= solid['y'] + solid['h'], f'Cluster exceeds declared visual envelope: {solid["id"]}'
            part = transformed(sprite, es, ex, ey)
            part_alpha = np.array(part.getchannel('A')) > 0
            overlap = int((part_alpha & (np.array(draw.getchannel('A')) > 0)).sum())
            assert overlap >= 8, f'Detached cluster piece: {solid["id"]}/{extra["asset"]}'
            draw.alpha_composite(part)
            components.append({'sourceSprite': source_path(extra['asset']), 'sourceNaturalSize': list(images[extra['asset']].size), 'rotatedNaturalSize': list(sprite.size), 'rotationDegrees': extra['rotation'], 'uniformScale': es, 'scaleX': es, 'scaleY': es, 'drawRect': bounds, 'overlapWithEarlierPixels': overlap})
        old_record = next(r for r in old['solids'] if r['solidId'] == solid['id'])
        old_scale = old_record['nonUniformScale']
        record = {
            'solidId': solid['id'], 'style': solid['style'], 'collisionRect': {k: solid[k] for k in ('x', 'y', 'w', 'h')},
            'sourceSprite': f'art/{"variants" if name in variants else "source/sprites"}/{name}.png',
            'sourceNaturalSize': [original.width, original.height], 'sourceAspect': original.width / original.height,
            'rotationDegrees': rotation, 'uniformScale': s, 'scaleX': s, 'scaleY': s,
            'drawRect': {'x': x, 'y': y, 'w': width, 'h': height},
            'anchor': {'kind': 'bottom-center', 'world': [solid['x'] + solid['w'] / 2, solid['y'] + solid['h'] - 1]},
            'transformAfterRotation': [s, 0, 0, s, x, y], 'rasterAlphaBounds': draw.getbbox(),
            'rationale': cluster['reason'] if 'baseAsset' in cluster else rationale + (' ' + cluster['reason'] if cluster else ''), 'zOrder': solid['y'] + solid['h'],
            'components': components, 'clustered': bool(cluster),
            'theme': cluster.get('theme', 'single-obstacle'),
            'visualEnvelope': envelope, 'upwardVisualOverhang': overhang,
            'v02Audit': {'source': old_record['sourceAsset'], 'scaleX': old_scale['x'], 'scaleY': old_scale['y'], 'distortionFactor': max(old_scale.values()) / min(old_scale.values())},
            'reviewOutlier': s < .45 or s > 1.2,
        }
        records.append((record, draw))
    for record, draw in sorted(records, key=lambda pair: (pair[0]['zOrder'], pair[0]['solidId'])):
        canvas.alpha_composite(draw)
    return canvas, [record for record, _ in records]


def hardware_layer(geometry, images):
    canvas = Image.new('RGBA', (W, H))
    records = []
    for station in geometry['interactions']:
        if station['kind'] != 'light':
            continue
        path = f'art/source/stateful/{station["id"]}_unlit.png'
        image = Image.open(BASE / path).convert('RGBA')
        s = .6 if station['id'] != 'central_spotlight' else .7
        x, y = station['x'] - image.width * s / 2, station['y'] - image.height * s
        canvas.alpha_composite(transformed(image, s, x, y))
        records.append({'id': station['id'], 'sourceSprite': path, 'uniformScale': s, 'anchor': [station['x'], station['y']], 'drawRect': [x, y, image.width * s, image.height * s], 'initialState': 'off', 'runtimeGlowBaked': False})
    shutter = Image.open(ART / 'source/stateful/bunker_exit_shutter_closed.png').convert('RGBA')
    s = .75
    canvas.alpha_composite(transformed(shutter, s, 1310 - shutter.width * s / 2, 65))
    records.append({'id': 'bunker_exit', 'sourceSprite': 'art/source/stateful/bunker_exit_shutter_closed.png', 'uniformScale': s, 'drawRect': [1310 - shutter.width * s / 2, 65, shutter.width * s, shutter.height * s], 'interactionAnchor': [1310, 126], 'initialState': 'closed', 'unlock': 'finale_boss_victory'})
    for gate in [geometry['dynamicGates']['boss'], *geometry['dynamicGates']['shadow']]:
        # Real mesh and support posts communicate the blocked area, unlike the
        # former hairline crossbar. Both visuals stay inside the existing gate.
        name = 'gate_mesh_double' if gate['id'] == 'boss_gate' else 'rack_mesh_01'
        rotation = 0 if gate['h'] > gate['w'] else 90
        image = rotated(images[name], rotation)
        s = min(gate['w'] / image.width, gate['h'] / image.height)
        x, y = gate['x'] + (gate['w'] - image.width * s) / 2, gate['y'] + (gate['h'] - image.height * s) / 2
        canvas.alpha_composite(transformed(image, s, x, y))
        records.append({'id': gate['id'], 'sourceSprite': f'art/{"variants" if name == "gate_mesh_double" else "source/sprites"}/{name}.png', 'uniformScale': s, 'rotationDegrees': rotation, 'drawRect': [x, y, image.width * s, image.height * s], 'sourceGate': gate, 'initialState': 'closed', 'changesCollision': False})
    return canvas, records


def collision_overlay(composite, geometry, polygons):
    overlay = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(overlay)
    for polygon in polygons:
        d.line([tuple(p) for p in polygon] + [tuple(polygon[0])], fill='#80eadc', width=2)
    for index, solid in enumerate(geometry['solids'], 1):
        x, y, width, height = [solid[k] for k in ('x', 'y', 'w', 'h')]
        d.rectangle((x, y, x + width - 1, y + height - 1), outline='#ffbc6e', width=2)
        d.rectangle((x, y, x + 23, y + 14), fill='#14222deb')
        d.text((x + 2, y + 1), str(index), fill='#fff0cc', font=FONT)
    for climb in geometry['climbs']:
        x, y = climb['x'], climb['y']
        d.ellipse((x - 12, y - 12, x + 12, y + 12), outline='#be9bff', width=2)
        d.text((x - 7, y - 7), climb['id'], fill='#fff', font=FONT)
    for station in geometry['interactions']:
        if station['floor'] != 'L0':
            continue
        x, y = station['x'], station['y']
        d.ellipse((x - 5, y - 5, x + 5, y + 5), outline='#c5e5ff', width=2)
    for zone in geometry['randomZones']:
        x, y, radius = zone['x'], zone['y'], zone['r']
        d.ellipse((x - radius, y - radius, x + radius, y + radius), outline='#afd39c', width=1)
        d.text((x + 4, y - 15), zone['id'], fill='#cfedc3', font=FONT)
    composite.alpha_composite(overlay)
    composite.save(REVIEW / 'warehouse_L0_collision_overlay.png')
    overlay.save(REVIEW / 'warehouse_L0_collision_lines.png')


def svg_overlay(geometry, polygons):
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', '<title>Warehouse L0 art registration — manual review draft</title>', '<image href="../art/warehouse_L0_composite.png" width="1672" height="941"/>', '<g fill="none" stroke="#80eadc" stroke-width="2">']
    for polygon in polygons:
        parts.append('<polygon points="' + ' '.join(f'{x},{y}' for x, y in polygon) + '"/>')
    parts.append('</g><g fill="none" stroke="#ffbc6e" stroke-width="2">')
    for solid in geometry['solids']:
        parts.append(f'<rect id="{solid["id"]}" x="{solid["x"]}" y="{solid["y"]}" width="{solid["w"]}" height="{solid["h"]}"><title>{solid["id"]}</title></rect>')
    parts.append('</g></svg>')
    (REVIEW / 'warehouse_L0_geometry_overlay.svg').write_text('\n'.join(parts) + '\n', encoding='utf-8', newline='\n')


def contact_sheets(images, records):
    items = sorted(images.items())
    sheet = Image.new('RGB', (6 * 240, math.ceil(len(items) / 6) * 220), '#172430')
    d = ImageDraw.Draw(sheet)
    for i, (name, image) in enumerate(items):
        x, y = i % 6 * 240, i // 6 * 220
        preview = image.copy()
        preview.thumbnail((220, 181), Image.Resampling.NEAREST)
        sheet.paste(preview, (x + (240 - preview.width) // 2, y + 4), preview)
        d.text((x + 6, y + 188), name, font=FONT, fill='#f6e9c3')
        d.text((x + 6, y + 204), f'{image.width} x {image.height} native', font=FONT, fill='#a5bdca')
    sheet.save(REVIEW / 'warehouse_source_asset_contact_sheet.png')
    sheet = Image.new('RGB', (4 * 360, math.ceil(len(records) / 4) * 190), '#172430')
    d = ImageDraw.Draw(sheet)
    for i, record in enumerate(records):
        x, y = i % 4 * 360, i // 4 * 190
        rect = record['collisionRect']
        envelope = record['visualEnvelope']
        bx, by = x + (360 - envelope['w']) // 2, y + 6 + (126 - envelope['h']) // 2
        top = by + record['upwardVisualOverhang']
        d.rectangle((bx, top, bx + rect['w'], top + rect['h']), outline='#c89660', width=1)
        group = Image.new('RGBA', (W, H))
        for component in record['components']:
            sprite = rotated(images[Path(component['sourceSprite']).stem], component['rotationDegrees'])
            bounds = component['drawRect']
            group.alpha_composite(transformed(sprite, component['uniformScale'], bounds['x'], bounds['y']))
        preview = group.crop((envelope['x'], envelope['y'], envelope['x'] + envelope['w'], envelope['y'] + envelope['h']))
        sheet.paste(preview, (bx, by), preview)
        d.text((x + 8, y + 139), f'{i + 1:02d} {record["solidId"]}', font=FONT, fill='#f6e9c3')
        d.text((x + 8, y + 155), f'{rect["w"]}x{rect["h"]} / s={record["uniformScale"]:.3f} / {record["rotationDegrees"]} deg', font=FONT, fill='#a5bdca')
        d.text((x + 8, y + 171), Path(record['sourceSprite']).stem, font=FONT, fill='#a5bdca')
    sheet.save(REVIEW / 'warehouse_L0_asset_contact_sheet.png')


def placement_table(records):
    lines = ['# L0 placement and v02 aspect audit', '', 'Collision rectangles follow v07 with the explicit user-requested local edge insets in playtest_adjustments.json. Original v07 files remain locked. Each sprite uses one scalar transform; integer pixel sampling does not introduce a second scale. Native compound-strip variants are recorded in the recipe and manifest.', '', '| ID | Collision x,y,w,h | Source / native pixels | Uniform scale | Draw x,y,w,h | Rotation | v02 distortion | Decision |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for r in records:
        rect, draw = r['collisionRect'], r['drawRect']
        values = ','.join(str(rect[k]) for k in ('x', 'y', 'w', 'h'))
        bounds = ','.join(f'{draw[k]:.2f}' for k in ('x', 'y', 'w', 'h'))
        native = 'x'.join(str(v) for v in r['sourceNaturalSize'])
        extras = ', '.join(f'{Path(c["sourceSprite"]).stem} s={c["uniformScale"]:.2f}' for c in r['components'][1:])
        lines.append(f'| {r["solidId"]} | {values} | {Path(r["sourceSprite"]).stem} / {native}' + (f' + {extras}' if extras else '') + f' | {r["uniformScale"]:.6f} | {bounds} | {r["rotationDegrees"]} | {r["v02Audit"]["distortionFactor"]:.3f}x | {r["rationale"]} |')
    (REVIEW / 'warehouse_L0_placement_audit.md').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')


def l1_audit(composite, geometry):
    layer = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(layer)
    solids = np.zeros((H, W), dtype=bool)
    for r in geometry['solids']:
        solids[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']] = True
    records = []
    for r in geometry['l1WalkableRectangles']:
        x, y, width, height = [r[k] for k in ('x', 'y', 'w', 'h')]
        d.rectangle((x, y, x + width - 1, y + height - 1), fill='#9c7ee528', outline='#c6aaff', width=2)
        d.text((x + 4, y + 4), r['id'], fill='#efe5ff', font=FONT)
        records.append({'region': r, 'solidFootprintOverlapFraction': float(solids[y:y + height, x:x + width].mean()), 'status': 'support/bridge structure requires L1 review; overlap alone is not structural proof'})
    layer.save(REVIEW / 'warehouse_L1_support_guide.png')
    composite.alpha_composite(layer)
    composite.save(REVIEW / 'warehouse_L1_support_review.png')
    write_json(REVIEW / 'warehouse_L1_support_audit.json', {'status': 'registered deck and overhead fascia exported; physical support appearance requires manual review', 'regions': records, 'climbs': geometry['climbs']})


def l1_art(geometry, images):
    """Native approved steel/plank pixels; geometry remains the six rectangles."""
    top = Image.new('RGBA', (W, H))
    supports = Image.new('RGBA', (W, H))
    mask = Image.new('L', (W, H))
    tile = images['pallet03'].crop((7, 4, 69, 51))
    beam = images['gate_crossbar'].crop((3, 5, 169, 18))
    for rect in geometry['l1WalkableRectangles']:
        x, y, width, height = [rect[k] for k in ('x', 'y', 'w', 'h')]
        ImageDraw.Draw(mask).rectangle((x, y, x + width - 1, y + height - 1), fill=255)
        for py in range(y, y + height, tile.height):
            for px in range(x, x + width, tile.width):
                top.alpha_composite(tile.crop((0, 0, min(tile.width, x + width - px), min(tile.height, y + height - py))), (px, py))
        # A visible steel fascia/underside ties the elevated deck to the rack
        # family. It is overhead art, never a new ground collision rectangle.
        for px in range(x, x + width, beam.width):
            part = beam.crop((0, 0, min(beam.width, x + width - px), beam.height))
            supports.alpha_composite(part, (px, y + height - 1))
            top.alpha_composite(part.crop((0, 0, part.width, 4)), (px, y))
    top.putalpha(mask)
    top.save(ART / 'warehouse_L1_surfaces.png')
    supports.save(ART / 'warehouse_L1_undersides.png')
    mask.save(ART / 'warehouse_L1_walkable_mask.png')
    write_json(REVIEW / 'warehouse_L1_art_manifest.json', {'status': 'manual review required; overhead fascia does not add ground collision', 'world': [W, H], 'regions': geometry['l1WalkableRectangles'], 'climbs': geometry['climbs'], 'deckSource': 'art/source/sprites/pallet03.png', 'deckSourceRect': [7, 4, 62, 47], 'fasciaSource': 'art/variants/gate_crossbar.png', 'scaling': 'native pixels tiled; no non-uniform stretch'})


def review_html():
    html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chapter 5 L0 — registration review draft</title>
<style>body{margin:0;background:#09141d;color:#e7e0ca;font:14px system-ui}header{padding:14px 20px;background:#172731;position:sticky;top:0;z-index:1;border-bottom:1px solid #56676b}h1{font-size:18px;margin:0 0 8px}p{margin:6px 0;color:#b8c8ca}label,button,a{margin-right:18px}a{color:#dfb777}button{background:#d2c7a8;border:0;padding:6px 12px;color:#172731}main{padding:16px;overflow:auto}canvas{display:block;width:100%;height:auto;image-rendering:pixelated}main.native canvas{width:1672px;height:941px}.error{color:#ff9f89}</style>
<header><h1>Chapter 5 warehouse L0 — manual art review draft</h1><p>Approved atlas/ground registered to locked v07. No gameplay controller. L1 is a support guide only, pending L0 approval.</p><label><input id="graybox" type="checkbox">Graybox instead of art</label><label><input id="collision" type="checkbox">Collision / anchors (QA only)</label><label><input id="l1" type="checkbox">Provisional L1 support guide</label><label><input id="hardware" type="checkbox" checked>Unlit hardware / closed gates</label><button id="native">Native 100%</button><a href="warehouse_L0_placement_audit.md">38 placements</a><span id="status">Loading…</span></header><main><canvas width="1672" height="941" aria-label="Warehouse art registration review"></canvas></main>
<script>const paths={ground:'../art/warehouse_L0_ground.png',props:'../art/warehouse_L0_props.png',hardware:'../art/warehouse_L0_initial_hardware.png',collision:'warehouse_L0_collision_lines.png',l1:'warehouse_L1_support_guide.png',graybox:'../source/v07/warehouse_L0_graybox_v07.svg'};const images={};const ctx=document.querySelector('canvas').getContext('2d');function paint(){ctx.clearRect(0,0,1672,941);ctx.imageSmoothingEnabled=false;if(document.querySelector('#graybox').checked)ctx.drawImage(images.graybox,0,0);else{ctx.drawImage(images.ground,0,0);ctx.drawImage(images.props,0,0);if(document.querySelector('#hardware').checked)ctx.drawImage(images.hardware,0,0);}if(document.querySelector('#collision').checked)ctx.drawImage(images.collision,0,0);if(document.querySelector('#l1').checked)ctx.drawImage(images.l1,0,0);}Promise.all(Object.entries(paths).map(async([key,url])=>{const img=new Image();img.src=url;await img.decode();images[key]=img;})).then(()=>{paint();document.querySelector('#status').textContent='1672 × 941 · lamps OFF · review only';window.reviewReady=true;}).catch(error=>{document.querySelector('#status').textContent=error.message;document.querySelector('#status').className='error';});document.querySelectorAll('input').forEach(el=>el.addEventListener('change',paint));document.querySelector('#native').onclick=()=>document.querySelector('main').classList.toggle('native');</script></html>'''
    (REVIEW / 'warehouse_L0_review.html').write_text(html + '\n', encoding='utf-8', newline='\n')


def validate():
    check_sources()
    source_geometry = read_json(BASE / 'source/v07/warehouse_geometry_v07.json')
    geometry = playtest_geometry(source_geometry)
    manifest = read_json(REVIEW / 'warehouse_L0_asset_placement_manifest.json')
    for path in (BASE / 'source/v07').glob('*.svg'):
        ET.parse(path)
    ET.parse(REVIEW / 'warehouse_L0_geometry_overlay.svg')
    floor_xml = ET.parse(BASE / 'source/v07/warehouse_L0_graybox_v07.svg')
    floor_polygons = svg_polygons(floor_xml.find('.//s:g[@id="l0-floor"]', NS))
    assert floor_polygons == geometry['walkable']['L0'], 'SVG/JSON floor geometry differ'
    floor = polygon_mask(floor_polygons)
    assert geometry['world'] == {'width': W, 'height': H, 'coordinateSystem': 'common L0/L1 SVG pixel coordinates', 'catRadius': 13}
    records = manifest['solids']
    recipe = read_json(BASE / 'registration_recipe.json')
    assert manifest['layoutDistribution'] == recipe['distribution']
    assert {r['solidId'] for r in records if r['clustered']} == selected_cluster_ids(geometry, recipe)
    assert len(records) == 38 == len(geometry['solids'])
    assert {r['solidId'] for r in records} == {s['id'] for s in geometry['solids']}
    solid_mask = np.zeros((H, W), dtype=bool)
    visual_mask = np.zeros_like(solid_mask)
    for record, solid in zip(records, geometry['solids']):
        assert record['collisionRect'] == {k: solid[k] for k in ('x', 'y', 'w', 'h')}
        assert record['scaleX'] == record['scaleY'] == record['uniformScale']
        assert math.isfinite(record['rotationDegrees']) and abs(record['rotationDegrees']) <= 360
        envelope = record['visualEnvelope']
        assert 0 <= record['upwardVisualOverhang'] <= 24
        assert envelope == {'x': solid['x'], 'y': solid['y'] - record['upwardVisualOverhang'], 'w': solid['w'], 'h': solid['h'] + record['upwardVisualOverhang']}
        draw = record['drawRect']
        assert draw['x'] >= solid['x'] and draw['y'] >= solid['y']
        assert draw['x'] + draw['w'] <= solid['x'] + solid['w'] + .001
        assert draw['y'] + draw['h'] <= solid['y'] + solid['h'] + .001
        for component in record['components']:
            assert component['scaleX'] == component['scaleY'] == component['uniformScale']
            bounds = component['drawRect']
            assert bounds['x'] >= solid['x'] and bounds['y'] >= envelope['y']
            assert bounds['x'] + bounds['w'] <= solid['x'] + solid['w'] + .001
            assert bounds['y'] + bounds['h'] <= solid['y'] + solid['h'] + .001
        solid_mask[solid['y']:solid['y'] + solid['h'], solid['x']:solid['x'] + solid['w']] = True
        visual_mask[envelope['y']:envelope['y'] + envelope['h'], envelope['x']:envelope['x'] + envelope['w']] = True
    expected_layers = [ART / f'warehouse_L0_{part}.png' for part in ('ground', 'props', 'composite', 'initial_hardware', 'floor_mask')]
    expected_layers += [REVIEW / 'warehouse_L0_collision_overlay.png', REVIEW / 'warehouse_L0_collision_lines.png', REVIEW / 'warehouse_L1_support_guide.png', REVIEW / 'warehouse_L1_support_review.png', BASE / 'reference/L1_shelf_top_overlay_provisional.png']
    expected_layers += [ART / f'warehouse_L1_{part}.png' for part in ('surfaces', 'undersides', 'walkable_mask')]
    for path in expected_layers:
        with Image.open(path) as image:
            assert image.size == (W, H), path
            image.verify()
    with Image.open(ART / 'warehouse_L0_ground.png') as image:
        alpha = np.array(image.getchannel('A'))
        assert np.array_equal(alpha > 0, floor), 'Ground is not clipped to the exact SVG footprint'
    with Image.open(ART / 'warehouse_L0_props.png') as image:
        alpha = np.array(image.getchannel('A'))
        assert alpha.min() == 0 and alpha.max() > 0, 'Props must retain transparency'
        assert not ((alpha > 0) & ~visual_mask).any(), 'A prop exceeds its declared visual envelope'
        assert not ((alpha > 0) & ~floor).any(), 'A prop extends beyond the authored floor'
        overhang_pixels = int(((alpha > 0) & ~solid_mask).sum())
    expected_l1 = np.zeros((H, W), dtype=bool)
    for rect in geometry['l1WalkableRectangles']:
        expected_l1[rect['y']:rect['y'] + rect['h'], rect['x']:rect['x'] + rect['w']] = True
    with Image.open(ART / 'warehouse_L1_walkable_mask.png') as image:
        assert np.array_equal(np.array(image.convert('L')) > 0, expected_l1), 'L1 mask differs from the six authored rectangles'
    l1_xml = ET.parse(BASE / 'source/v07/warehouse_L1_graybox_v07.svg')
    for rect in geometry['l1WalkableRectangles']:
        group = l1_xml.find(f'.//s:g[@data-id="{rect["id"]}"]', NS)
        node = group.find('s:rect', NS)
        assert {k: float(node.attrib[k if k not in ('w', 'h') else {'w':'width','h':'height'}[k]]) for k in ('x','y','w','h')} == {k:rect[k] for k in ('x','y','w','h')}
    assert manifest['geometryContract'] == source_geometry, 'The original spatial contract changed'
    assert manifest['playtestAdjustments'] == read_json(BASE / 'playtest_adjustments.json')
    lamps = [r for r in manifest['initialHardware'] if r.get('initialState') == 'off']
    assert len(lamps) == 3 and all(not r['runtimeGlowBaked'] for r in lamps)
    report = {
        'status': 'focused checks passed; visual approval pending', 'world': [W,H], 'sourceLockFiles': len(read_json(BASE/'source_lock.json')['files']),
        'solidRecords': len(records), 'clusteredLocations': sum(r['clustered'] for r in records), 'singleLocations': sum(not r['clustered'] for r in records),
        'pieceCountHistogram': {str(count): sum(len(r['components']) == count for r in records) for count in sorted({len(r['components']) for r in records})},
        'distributionSeed': recipe['distribution']['seed'], 'uniformScaleExceptions': [], 'sourceGeometryUnchanged': True,
        'playtestSolidInsets': read_json(BASE / 'playtest_adjustments.json')['solidInsets'], 'randomZoneCount': len(geometry['randomZones']),
        'floorMaskMatchesSvgPixels': True, 'floorEdgeMismatchPixels': 0, 'propPixelsOutsideSolidFootprints': overhang_pixels,
        'propPixelsOutsideDeclaredVisualEnvelopes': 0, 'upwardVisualOverhangs': {r['solidId']: r['upwardVisualOverhang'] for r in records if r['upwardVisualOverhang']},
        'l1SourceRectangles': 6, 'l1Status': 'six registered steel deck surfaces and overhead fascia; manual art/traversal review pending',
        'allControllableLampsInitiallyOff': True, 'runtimeLightingBaked': False,
        'browserArtReview': 'not claimed by this script; see README for actual review checks', 'gameplayTraversal': 'not exercised by asset validator; see README for walking smoke and manual review scope',
        'artOutliers': [r['solidId'] for r in records if r['reviewOutlier']],
    }
    return report


def build():
    lock = check_sources()
    source_geometry = read_json(BASE / 'source/v07/warehouse_geometry_v07.json')
    geometry = playtest_geometry(source_geometry)
    recipe = read_json(BASE / 'registration_recipe.json')
    old = read_json(BASE / 'reference/placement_manifest_v02.json')
    assert set(recipe['placements']) == {r['id'] for r in geometry['solids']}
    assert set(recipe['clusters']) == selected_cluster_ids(geometry, recipe), 'Cluster recipes must match the seeded half-map selection'
    floor_xml = ET.parse(BASE / 'source/v07/warehouse_L0_graybox_v07.svg')
    polygons = svg_polygons(floor_xml.find('.//s:g[@id="l0-floor"]', NS))
    assert polygons == geometry['walkable']['L0']
    images, variants = asset_images(recipe)
    ground, floor, ground_info = ground_registration(polygons, recipe)
    props, records = compose_props(geometry, recipe, images, variants, old)
    hardware, hardware_records = hardware_layer(geometry, images)
    composite = ground.copy()
    composite.alpha_composite(props)
    composite.alpha_composite(hardware)
    for name, image in [('ground', ground), ('props', props), ('initial_hardware', hardware), ('composite', composite), ('floor_mask', Image.fromarray(floor.astype(np.uint8) * 255))]:
        image.save(ART / f'warehouse_L0_{name}.png')
    manifest = {
        'version': 'L0-registration-v08-varied-half-map', 'approval': 'manual review required', 'world': geometry['world'],
        'layoutDistribution': recipe['distribution'],
        'sourceGeometrySha256': lock['files']['source/v07/warehouse_geometry_v07.json']['sha256'],
        'groundRegistration': ground_info, 'compoundVariants': variants, 'solids': records,
        'initialHardware': hardware_records, 'geometryContract': source_geometry,
        'playtestAdjustments': read_json(BASE / 'playtest_adjustments.json'),
        'rendering': {'layers': ['ground','props','initialHardware'], 'spriteScaling': 'single scalar affine + nearest-neighbor sampling', 'zOrder': 'collision bottom, then solid ID', 'lighting': 'not baked', 'characterOcclusion': 'requires later Canvas integration; combined PNG is review-only'},
    }
    write_json(REVIEW / 'warehouse_L0_asset_placement_manifest.json', manifest)
    collision_overlay(composite.copy(), geometry, polygons)
    svg_overlay(geometry, polygons)
    contact_sheets(images, records)
    placement_table(records)
    l1_audit(composite.copy(), geometry)
    l1_art(geometry, images)
    review_html()
    report = validate()
    write_json(REVIEW / 'validation_report.json', report)
    print(json.dumps(report, indent=2))


def package():
    target = ROOT / 'output/chapter5/Chapter5_Warehouse_L0_Registration_Review.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(BASE.rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                archive.write(path, 'level_design/chapter5/' + path.relative_to(BASE).as_posix())
        archive.write(Path(__file__), 'scripts/register-warehouse-l0.py')
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
    print(f'ZIP verified: {target} ({target.stat().st_size} bytes)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='Verify current exports without regenerating them')
    parser.add_argument('--package', action='store_true', help='Also create the complete ignored review ZIP')
    args = parser.parse_args()
    if args.verify:
        print(json.dumps(validate(), indent=2))
    else:
        build()
    if args.package:
        package()


if __name__ == '__main__':
    main()
