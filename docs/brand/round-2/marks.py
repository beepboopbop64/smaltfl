"""smaltfl brand, round 2: marks that read as flow, in cobalt teal.

Round 1 feedback: cobalt teal is the colour; none of the marks felt like a flow; the bars (Stages) came closest.
Same format as round 1 and smalt-brand's scripts/brand_assets.py: shapes on a 64-unit grid as (path, role).

    python3 docs/brand/round-2/marks.py      # writes docs/brand/round-2/svg/
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


def chevron(tip, a, t, cy=32):
    """A > with its outer tip at (tip, cy), arms reaching back a units at 45 degrees, bar thickness t.
    smaltui's Chevron is chevron(37, 22, 9.9)."""
    c, w = t / math.sqrt(2), t * math.sqrt(2)
    return poly([(tip - a, cy - a), (tip, cy), (tip - a, cy + a), (tip - a - c, cy + a - c), (tip - w, cy),
                 (tip - a - c, cy - a + c)])


def band(pts, t):
    """A polyline drawn as a solid bar of thickness t: mitred corners, square-cut ends."""
    def normal(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        return -dy / length, dx / length
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        if i == 0 or i == len(pts) - 1:
            nx, ny = normal(pts[0], pts[1]) if i == 0 else normal(pts[i - 1], pts[i])
            s = 1.0
        else:
            n1, n2 = normal(pts[i - 1], pts[i]), normal(pts[i], pts[i + 1])
            nx, ny = n1[0] + n2[0], n1[1] + n2[1]
            length = math.hypot(nx, ny)
            nx, ny = nx / length, ny / length
            s = 1 / (nx * n1[0] + ny * n1[1])
        left.append((x + nx * t / 2 * s, y + ny * t / 2 * s))
        right.append((x - nx * t / 2 * s, y - ny * t / 2 * s))
    return poly(left + right[::-1])


def wave(x0, x1, cy, amp, t, periods=1.0, n=48):
    """A filled sine-wave band from x0 to x1 with square-cut ends (needs the curve exception)."""
    pts = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        k = 2 * math.pi * periods / (x1 - x0)
        y = cy - amp * math.sin(k * (x - x0))
        dy = -amp * k * math.cos(k * (x - x0))
        nx, ny = -dy / math.hypot(1, dy), 1 / math.hypot(1, dy)
        pts.append((x, y, nx, ny))
    top = [(x - nx * t / 2, y - ny * t / 2) for x, y, nx, ny in pts]
    bottom = [(x + nx * t / 2, y + ny * t / 2) for x, y, nx, ny in reversed(pts)]
    return poly(top + bottom)


# Bars 10 units thick (9.9 on the diagonal), square-cut ends, 0/45/90 degrees, one rounded chip set apart by a gap,
# unless a mark is marked as needing an exception.
MARKS = {
    # Cascade: the Stages bars joined into one staircase, flowing down into the pool.
    "cascade": [("M8 8H30V27H44V44H34V37H20V18H8Z", "body"), (rr(30, 48, 26, 8, 3), "accent")],
    # Bend: one path that changes lanes at 45 degrees, with the data moving along it as the chip. A shallow change, so
    # the level runs stay longer than the slope (a steep one read as a backslash).
    "bend": [(poly([(8, 21), (22.07, 21), (34.07, 33), (42, 33), (42, 43), (29.93, 43), (17.93, 31), (8, 31)]), "body"),
             (rr(46, 33, 10, 10, 3), "accent")],
    # Tide: two waves drawn in 45-degree steps, like the old sign for water; the chip is where they arrive.
    "tide": [(band([(8, 23), (16, 15), (24, 23), (32, 15), (40, 23)], 7), "body"),
             (band([(8, 41), (16, 33), (24, 41), (32, 33), (40, 41)], 7), "body"),
             (rr(46, 27, 10, 10, 3), "accent")],
    # Stream: two arrows forward and the packet ahead of them.
    "stream": [(chevron(26, 13, 8.5), "body"), (chevron(44, 13, 8.5), "body"), (rr(48, 28, 8, 8, 3), "accent")],
    # Pour: a pipe that turns down at 45 degrees, and the drop falling from it.
    "pour": [(poly([(8, 11), (32.07, 11), (45.54, 24.46), (38.46, 31.54), (27.93, 21), (8, 21)]), "body"),
             (rr(42, 39, 12, 12, 3), "accent")],
    # Wave: a flowing line and the chip it carries. Needs a curve: an exception to the 0/45/90 rule, as smaltql's
    # Star is to the angles.
    # Its radius of curvature (1 / (amp * k^2), about 3.7) stays above half its thickness (3.5), so the outline never
    # folds over itself.
    "wave": [(wave(9, 43, 32, 8, 7), "body"), (rr(49, 27, 7, 10, 3), "accent")],
}
NAMES = {"cascade": "Cascade", "bend": "Bend", "tide": "Tide", "stream": "Stream", "pour": "Pour", "wave": "Wave"}

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
