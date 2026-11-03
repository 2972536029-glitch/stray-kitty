"""Build lossless runtime backgrounds without changing approved source artwork."""
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

DESTINATION.mkdir(parents=True, exist_ok=True)
for source in SOURCES:
    original = ROOT / source
    output = DESTINATION / (original.stem + ".lossless.webp")
    with Image.open(original) as image:
        image.save(output, lossless=True, method=6, exact=True)
        with Image.open(output) as delivered:
            assert image.size == delivered.size
            assert image.convert("RGBA").tobytes() == delivered.convert("RGBA").tobytes()
    print(f"{output.name}: {original.stat().st_size:,} -> {output.stat().st_size:,} bytes")
