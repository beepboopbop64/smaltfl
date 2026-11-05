"""smaltfl brand, round 1: the candidate marks and colourways.

The marks use the same format as smalt-brand's scripts/brand_assets.py: shapes on a 64-unit grid as (path, role),
where the role picks the colour per theme. A picked mark drops into its MARKS table unchanged.

    python3 docs/brand/round-1/marks.py      # writes docs/brand/round-1/svg/
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "svg"


def rr(x, y, w, h, r):
    """Rounded rectangle as path data (as in brand_assets.py)."""
    def n(v):
        return f"{v:g}"
    return (f"M{n(x + r)} {n(y)}h{n(w - 2 * r)}a{n(r)} {n(r)} 0 0 1 {n(r)} {n(r)}v{n(h - 2 * r)}"
            f"a{n(r)} {n(r)} 0 0 1 -{n(r)} {n(r)}h-{n(w - 2 * r)}a{n(r)} {n(r)} 0 0 1 -{n(r)} -{n(r)}"
            f"v-{n(h - 2 * r)}a{n(r)} {n(r)} 0 0 1 {n(r)} -{n(r)}z")


# Bars are 10 units thick (9.9 on the diagonal, like smaltui's Chevron); ends are square-cut; angles are 0, 45 and
# 90 degrees; the one chip is a rounded bar with a 3-unit radius, set apart by a gap.
MARKS = {
    # Fork: a trunk and one branch leaving its middle at 45 degrees, so one input becomes two outputs; the chip is the
    # new dataset at the branch's end. (Leaving from the bottom, it read as a check mark.)
    "fork": [("M12 8H22V56H12Z", "body"), ("M17 37L33 21L40 28L17 51Z", "body"), (rr(41, 8, 14, 14, 3), "accent")],
    # Merge: two inputs joining into one stem; the chip is the output below it.
    "merge": [("M15.5 8.5L34 27L34 41L8.5 15.5Z", "body"), ("M48.5 8.5L30 27L30 41L55.5 15.5Z", "body"),
              ("M27 30H37V44H27Z", "body"), (rr(25, 48, 14, 8, 3), "accent")],
    # Relay: a step, its link, and the next step as the chip.
    "relay": [(rr(8, 21, 22, 22, 3), "body"), ("M30 28H38V36H30Z", "body"), (rr(42, 25, 14, 14, 3), "accent")],
    # Pipe-forward: the |> of a pipeline; the pipe is the chip, the arrow the body.
    "pipe": [(rr(10, 12, 8, 40, 3), "accent"), ("M24 17L31 10L53 32L31 54L24 47L39 32Z", "body")],
    # Stages: three steps of a run, each starting as the last ends; the chip is the step running now.
    "stages": [("M8 8H36V18H8Z", "body"), ("M18 27H46V37H18Z", "body"), (rr(28, 46, 28, 10, 3), "accent")],
}
NAMES = {"fork": "Fork", "merge": "Merge", "relay": "Relay", "pipe": "Pipe-forward", "stages": "Stages"}

# Candidate product colours. `fill` for marks and accents, `text` for the suffix in the wordmark, `dark` for both on
# dark grounds. "smalt" uses smaltdb's own chip shades and keeps the suffix in ink, as smaltdb does.
COLOURWAYS = {
    "teal": {"name": "Cobalt teal", "fill": "#00786F", "text": "#006861", "dark": "#4FD1C5"},
    "plum": {"name": "Plum", "fill": "#8A3F8F", "text": "#8A3F8F", "dark": "#E09BE3"},
    "smalt": {"name": "Smalt only", "fill": "#7B97D4", "text": "#151922", "dark": "#D6E0F3", "dark_text": "#E9EBF0"},
}
BODY = {"light": "#003399", "dark": "#9DB4F5", "tile": "#F5F6F8"}


def colour(role, theme, way):
    c = COLOURWAYS[way]
    if role == "body":
        return BODY[theme]
    return c["fill"] if theme == "light" else c["dark"]


def paths(mark, theme, way):
    return "".join(f'<path d="{d}" fill="{colour(role, theme, way)}"/>' for d, role in MARKS[mark])


def write(name, text):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(text)


def main():
    for mark in MARKS:
        for way in COLOURWAYS:
            label = f"smaltfl {NAMES[mark]} mark, {COLOURWAYS[way]['name']}"
            for theme, suffix in (("light", ""), ("dark", "-on-dark")):
                write(f"{mark}-{way}{suffix}.svg",
                      f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{label}">'
                      + paths(mark, theme, way) + "</svg>\n")
            # App icon: the mark knocked out of a smalt tile, as brand_assets.py draws every product's.
            write(f"{mark}-{way}-app-icon.svg",
                  f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{label}, app icon">'
                  '<rect width="64" height="64" rx="15" fill="#003399"/><g transform="translate(10.9 10.9) scale(0.66)">'
                  + "".join(f'<path d="{d}" fill="{BODY["tile"] if role == "body" else COLOURWAYS[way]["dark"]}"/>'
                            for d, role in MARKS[mark]) + "</g></svg>\n")


if __name__ == "__main__":
    main()
