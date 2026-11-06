"""Build lossless runtime artwork without changing approved source pixels."""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "web/src/modules/map/assets"
SOURCES = [
    "web/src/modules/rainyAlley/assets/rainy-alley-background-clean.png",
    "web/public/assets/night-market/night_market_L0_streets_1672x941.png",
    "web/public/assets/night-market/night_market_L1_rooftops_1672x941.png",
    "web/public/assets/night-market/night_market_Lminus1_tunnel_1672x941.png",
    "level_design/chapter4/art/chapter4_L0_approved.png",
    "level_design/chapter4/art/chapter4_Lminus1_tunnel_v11.png",
    "web/public/assets/home/greenhouse-base.png",
]

def prepare(original, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original) as image:
        image.save(output, lossless=True, method=6, exact=True)
        with Image.open(output) as delivered:
            assert image.size == delivered.size
            assert image.convert("RGBA").tobytes() == delivered.convert("RGBA").tobytes()
    print(f"{output.name}: {original.stat().st_size:,} -> {output.stat().st_size:,} bytes")

HOME_SHEETS = [
    "components", "furniture-shelter-v3", "furniture-improvised-v3",
    "furniture-timber-v3", "furniture-celebration-v3", "furniture-botany-v2",
    "planter-tropical-front-v3", "furniture-parcels-moss-v2", "furniture-parcels-moon-v2",
]

BATTLE_SHEETS = [
    "floor-material-atlas", "finale-room-scene-v1", "scene-new-props-atlas",
    "scene-detailed-residences-garden-v1", "scene-detailed-obstacles-v1",
    "scene-detailed-workstations-v1", "scene-tunnel-tool-cache-v2",
    "scene-refined-materials-v1", "scene-small-accents-v1",
    "scene-perimeter-foreground-v1", "scene-market-banks-v1",
    "scene-chapter-backwalls-v1", "scene-tunnel-fixtures-v3",
    "scene-warehouse-fixtures-v4", "scene-warehouse-pallet-jack-v1",
    "scene-warehouse-pipe-cradle-v1", "scene-warehouse-roll-pallet-v1",
    "scene-warehouse-storage-rack-v1",
]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--group", choices=["all", "maps", "home", "battle"], default="all")
group = parser.parse_args().group
if group in ["all", "maps"]:
    for source in SOURCES:
        original = ROOT / source
        prepare(original, DESTINATION / (original.stem + ".lossless.webp"))
for category, directory, names in [
    ("home", "web/public/assets/home", HOME_SHEETS),
    ("battle", "web/src/modules/battle/assets", BATTLE_SHEETS),
]:
    if group in ["all", category]:
        for name in names:
            original = ROOT / directory / (name + ".png")
            prepare(original, original.with_suffix(".lossless.webp"))
