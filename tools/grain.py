"""Make the page background's film grain tiles.

    python tools/grain.py

Writes assets/grain-1x.png, grain-2x.png and grain-3x.png: one warm-white
speck per device pixel at a very low alpha, so the grain stays sharp at any
screen density (styles.css picks the tile by density and shows each at
128 x 128 CSS pixels). LEVELS sets how strong it is: the highest alpha, out
of 255, is LEVELS - 1.
"""
import random
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "assets"
TILE = 128
LEVELS = 7

for scale in (1, 2, 3):
    n = TILE * scale
    rnd = random.Random(7 + scale)
    im = Image.new("P", (n, n))
    im.putpalette([255, 242, 219] * LEVELS + [0, 0, 0] * (256 - LEVELS))
    # two dice: mostly middle values, few bright specks
    half = (LEVELS - 1) // 2
    im.putdata([rnd.randint(0, half) + rnd.randint(0, half) for _ in range(n * n)])
    im.save(OUT / f"grain-{scale}x.png", transparency=bytes(range(LEVELS)), optimize=True)
    print(f"grain-{scale}x.png", n, "px")
