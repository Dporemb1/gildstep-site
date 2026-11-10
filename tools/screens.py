"""Put the September and now screenshots beside the story on gildstep.com.

    python tools/screens.py

Drop iPhone screenshots (1290 x 2796 is ideal) into assets/screens/ with
these names, then run this from the site's folder:

    september    the early version, with "Finish Creating This App"
    today        the app now (the Today screen)

.png, .jpg, .jpeg and .webp all work. For each one found, this writes web
sizes to assets/screens/web/ (AVIF and WebP, with a JPEG for old browsers)
and writes the markup into index.html between the "story-screens" markers:
an iPhone frame each, lazy-loaded, sized for 1x to 3x displays. Anything
missing is simply left out, so the live page never shows an empty frame.
Run it again after adding, replacing or removing a screenshot.

Needs Pillow 11.3 or newer:  pip install --upgrade pillow
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

try:
    from PIL import Image, features
except ImportError:
    sys.exit("This needs Pillow:  pip install --upgrade pillow")

SITE = Path(__file__).resolve().parent.parent
SRC = SITE / "assets" / "screens"
OUT = SRC / "web"
PAGE = SITE / "index.html"

# The screen sits about 140 to 205 CSS pixels wide in its frame.
WIDTHS = (390, 640)
RATIO = 844 / 390
SIZES = "(min-width: 960px) 205px, (min-width: 480px) 187px, 140px"

# name: (caption under the phone, what a screen reader hears)
SCREENS = {
    "september": ("September", "An early version of Gildstep from September. The goal on screen reads: Finish Creating This App."),
    "today": ("Now", "Gildstep now: the Today screen, with today's One Thing."),
}


def find(name: str) -> Path | None:
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        for candidate in (SRC / f"{name}{ext}", SRC / f"{name}{ext.upper()}"):
            if candidate.exists():
                return candidate
    return None


def export(name: str, source: Path) -> list[int]:
    """Web sizes of one screenshot. Returns the widths written."""
    image = Image.open(source).convert("RGB")
    # Crop to the frame's shape from the top, so the status bar stays.
    width, height = image.size
    wanted = round(width * RATIO)
    if height > wanted:
        image = image.crop((0, 0, width, wanted))
    elif height < wanted:
        narrower = round(height / RATIO)
        left = (width - narrower) // 2
        image = image.crop((left, 0, left + narrower, height))
    made = []
    for w in WIDTHS:
        if w > image.width and made:
            break
        w = min(w, image.width)
        sized = image.resize((w, round(w * RATIO)), Image.LANCZOS)
        if features.check("avif"):
            sized.save(OUT / f"{name}-{w}.avif", quality=58, speed=4)
        sized.save(OUT / f"{name}-{w}.webp", quality=80, method=6)
        sized.save(OUT / f"{name}-{w}.jpg", quality=82, optimize=True, progressive=True)
        made.append(w)
    return made


def picture(name: str, widths: list[int], alt: str) -> str:
    def srcset(ext: str) -> str:
        return ", ".join(f"/assets/screens/web/{name}-{w}.{ext} {w}w" for w in widths)

    sources = ""
    if features.check("avif"):
        sources += f'<source type="image/avif" srcset="{srcset("avif")}" sizes="{SIZES}">'
    sources += f'<source type="image/webp" srcset="{srcset("webp")}" sizes="{SIZES}">'
    return (
        f"<picture>{sources}"
        f'<img class="shot-img" src="/assets/screens/web/{name}-{widths[0]}.jpg" srcset="{srcset("jpg")}" sizes="{SIZES}" '
        f'width="390" height="844" loading="lazy" decoding="async" alt="{html.escape(alt, quote=True)}"></picture>'
    )


def phone(name: str, widths: list[int]) -> str:
    caption, alt = SCREENS[name]
    return (
        f'<figure><div class="phone"><div class="device"><div class="screen">{picture(name, widths, alt)}</div><i class="island"></i></div></div>'
        f"<figcaption>{html.escape(caption)}</figcaption></figure>"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*"):
        old.unlink()

    found = {}
    for name in SCREENS:
        source = find(name)
        if source:
            found[name] = export(name, source)
            print(f"  {name}: {source.name} -> {', '.join(str(w) for w in found[name])} px")
    if not any(OUT.iterdir()):
        OUT.rmdir()

    block = ""
    if found:
        block = '\n<div class="story-screens">\n' + "\n".join(phone(name, widths) for name, widths in found.items()) + "\n</div>\n"

    page = PAGE.read_text(encoding="utf-8")
    pattern = re.compile(r"(<!-- story-screens:start -->).*?(<!-- story-screens:end -->)", re.S)
    if not pattern.search(page):
        sys.exit("index.html has lost its markers (<!-- story-screens:start --><!-- story-screens:end -->).")
    page = pattern.sub(lambda m: m.group(1) + block + m.group(2), page)
    page = re.sub(r'class="wrap story-wrap(?: has-shot)?"', 'class="wrap story-wrap has-shot"' if found else 'class="wrap story-wrap"', page)
    PAGE.write_text(page, encoding="utf-8", newline="\n")

    print(f"index.html updated: {len(found)} of {len(SCREENS)} screenshots beside the story.")
    missing = [name for name in SCREENS if name not in found]
    if missing:
        print(f"Not found in assets/screens/ (left out of the page): {', '.join(missing)}")


if __name__ == "__main__":
    main()
