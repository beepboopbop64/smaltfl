"""smaltfl brand, round 3: waves.

Round 2's feedback: lean into waves and flow, as the one curved mark (M11) did. Every mark here is curved, so each
needs the exception to the 0/45/90-degree rule that smaltql's Star already has for its angles; M18 also gives its
whole second wave the product colour. Same format as smalt-brand's scripts/brand_assets.py: shapes on a 64-unit grid
as (path, role).

    python3 docs/brand/round-3/marks.py      # writes docs/brand/round-3/svg/, refusing any outline that folds
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent / "svg"


def rr(x, y, w, h, r):
    """Rounded rectangle as path data (as in brand_assets.py)."""
    def n(v):
        return f"{v:g}"
    return (f"M{n(x + r)} {n(y)}h{n(w - 2 * r)}a{n(r)} {n(r)} 0 0 1 {n(r)} {n(r)}v{n(h - 2 * r)}"
            f"a{n(r)} {n(r)} 0 0 1 -{n(r)} {n(r)}h-{n(w - 2 * r)}a{n(r)} {n(r)} 0 0 1 -{n(r)} -{n(r)}"
            f"v-{n(h - 2 * r)}a{n(r)} {n(r)} 0 0 1 {n(r)} -{n(r)}z")


def poly(points):
    return "M" + "L".join(f"{round(x, 2):g} {round(y, 2):g}" for x, y in points) + "Z"


def crosses(pts):
    """True if any two non-adjacent edges of the closed polygon intersect."""
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            c, d = pts[j], pts[(j + 1) % n]
            if o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0:
                return True
    return False


def band(centre, t):
    """A solid band of thickness t around a dense centreline, ends cut square to it. Refuses outlines that fold."""
    left, right = [], []
    for i, (x, y) in enumerate(centre):
        a, b = centre[max(i - 1, 0)], centre[min(i + 1, len(centre) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy)
        nx, ny = -dy / d, dx / d
        left.append((x + nx * t / 2, y + ny * t / 2))
        right.append((x - nx * t / 2, y - ny * t / 2))
    pts = left + right[::-1]
    if crosses(pts):
        raise ValueError("band folds over itself: lower the amplitude or the thickness")
    return poly(pts)


def sine(x0, x1, cy, amp, wavelength, n=72):
    """Centreline of a sine wave, in phase with every other wave of the same wavelength that starts at x0."""
    return [(x0 + (x1 - x0) * i / n, cy - amp * math.sin(2 * math.pi * ((x1 - x0) * i / n) / wavelength))
            for i in range(n + 1)]






def chevron(tip, a, t, cy=32):
    """A > with its outer tip at (tip, cy), arms reaching back a units at 45 degrees, bar thickness t."""
    c, w = t / math.sqrt(2), t * math.sqrt(2)
    return poly([(tip - a, cy - a), (tip, cy), (tip - a, cy + a), (tip - a - c, cy + a - c), (tip - w, cy),
                 (tip - a - c, cy - a + c)])


MARKS = {
    # Swell: one long wave, and the data riding in its dip.
    "swell": [(band(sine(8, 54, 38, 7, 36.8), 8), "body"), (rr(29, 18, 10, 10, 3), "accent")],
    # Twin: two waves in step, the old sign for water, and where they arrive.
    "twin": [(band(sine(8, 44, 24, 5, 36), 7), "body"), (band(sine(8, 44, 40, 5, 36), 7), "body"),
             (rr(49, 27, 7, 10, 3), "accent")],
    # Current: three lines of moving water, the middle one carrying the data ahead.
    "current": [(band(sine(8, 44, 18, 3.5, 36), 5.5), "body"), (band(sine(8, 38, 32, 3.5, 36), 5.5), "body"),
                (band(sine(8, 44, 46, 3.5, 36), 5.5), "body"), (rr(44, 27, 10, 10, 3), "accent")],
    # Wave arrow: a wave that points where it goes; the head is the chip.
    "wavearrow": [(band(sine(8, 40, 32, 6, 32), 7), "body"), (chevron(56, 10, 7), "accent")],
    # From here on the chip becomes a whole wave in the product colour: a second exception, giving teal more room.
    # Undercurrent: a smalt wave over a teal one, a step behind it.
    "undercurrent": [(band(sine(8, 50, 25, 5, 42), 8), "body"), (band(sine(14, 56, 40, 5, 42), 8), "accent")],
    # Twin in teal: Twin's two waves in step, the lower one teal.
    "twinteal": [(band(sine(8, 56, 24, 5, 48), 7), "body"), (band(sine(8, 56, 40, 5, 48), 7), "accent")],
    # Current in teal: three lines of moving water, the middle one teal and running furthest.
    "currentteal": [(band(sine(8, 50, 18, 3.5, 42), 5.5), "body"), (band(sine(8, 56, 32, 3.5, 42), 5.5), "accent"),
                    (band(sine(8, 44, 46, 3.5, 42), 5.5), "body")],
}
NAMES = {"swell": "Swell", "twin": "Twin", "current": "Current", "wavearrow": "Wave arrow",
         "undercurrent": "Undercurrent", "twinteal": "Twin in teal", "currentteal": "Current in teal"}

TEAL = {"fill": "#00786F", "text": "#006861", "dark": "#4FD1C5"}
BODY = {"light": "#003399", "dark": "#9DB4F5", "tile": "#F5F6F8"}


def paths(mark, theme):
    def colour(role):
        if role == "body":
            return BODY[theme]
        return TEAL["fill"] if theme == "light" else TEAL["dark"]
    return "".join(f'<path d="{d}" fill="{colour(role)}"/>' for d, role in MARKS[mark])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for mark in MARKS:
        label = f"smaltfl {NAMES[mark]} mark"
        for theme, suffix in (("light", ""), ("dark", "-on-dark")):
            (OUT / f"{mark}{suffix}.svg").write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{label}">'
                + paths(mark, theme) + "</svg>\n")
        (OUT / f"{mark}-app-icon.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{label}, app icon">'
            '<rect width="64" height="64" rx="15" fill="#003399"/><g transform="translate(10.9 10.9) scale(0.66)">'
            + "".join(f'<path d="{d}" fill="{BODY["tile"] if role == "body" else TEAL["dark"]}"/>'
                      for d, role in MARKS[mark]) + "</g></svg>\n")


if __name__ == "__main__":
    main()
