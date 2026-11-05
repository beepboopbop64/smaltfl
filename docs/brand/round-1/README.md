# smaltfl brand, round 1

The words are decided (ADR 0001 §13): `smaltfl`, said "smalt-flow"; **Small. Alternative. Flow.**; **Data pipelines
for smaltdb.** This round shows every candidate mark in every candidate colour, for feedback. The boards are on the
design canvas "smaltfl brand round 1" (light, dark, lockups, and beside the family with the colour check).

## The marks

Drawn by the family rules (smalt-brand `BRAND.md`, Iconography): solid bars of constant thickness, square-cut ends,
0°/45°/90° angles, one rounded chip in the product colour, the same drawing at every size, on a 64-unit grid.

| | Mark | Idea | Watch for |
| --- | --- | --- | --- |
| M1 | Fork | One input becomes two: a trunk, a branch from its middle, the new dataset as the chip | Leaving from the bottom it read as a check mark, so the branch leaves the middle |
| M2 | Merge | Two inputs join in one stem; the output is the chip below | Can read as the letter Y |
| M3 | Relay | A step, its link, and the next step as the chip | Reads as a plug at 16 px: the weakest |
| M4 | Pipe-forward | The `\|>` of a pipeline: the pipe is the chip, the arrow the body | Its arrow is smaltui's Chevron |
| M5 | Stages | Steps of a run, each starting as the last ends; the chip is the step running now | Added as an alternative to Relay; close to a list icon at 16 px |

## The colours

| | Colour | Fill / text / dark | Nearest colour in use (CIE76) |
| --- | --- | --- | --- |
| C1 | Cobalt teal | `#00786F` / `#006861` / `#4FD1C5` | `success` 25 / 26; smaltui 36 / 34 (a teal at 38 was ruled out by eye) |
| C2 | Plum | `#8A3F8F` / `#8A3F8F` / `#E09BE3` | smaltnb 23; smaltbi 17 on dark |
| C3 | Smalt only | smaltdb's chip shades `#7B97D4` / ink / `#D6E0F3` | None new: the shape alone tells smaltfl from smaltdb |

How the wheel was measured: [../../research/ecosystem-survey.md](../../research/ecosystem-survey.md), section 6.

## Files

- `marks.py`: the marks and colourways, in the format of smalt-brand's `scripts/brand_assets.py`, so a picked mark
  drops into its `MARKS` table unchanged. `python3 docs/brand/round-1/marks.py` regenerates `svg/`.
- `svg/`: every mark in every colour, light and dark, and the app icons.

## After the picks

The picks become one `brand/smaltfl` change in `stenhoor/smalt-brand`, as each product's brand did: the mark in
`brand_assets.py`, `product-fl` and `product-fl-text` in `tokens.json`, the logos, the "Powered by" badge, the social
card, a row in `BRAND.md`'s family table, a `DECISIONS.md` section, and the site's product page. That needs push
access to smalt-brand, or a fork (Q-30).
