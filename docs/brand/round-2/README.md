# smaltfl brand, round 2

Round 1 settled the colour, cobalt teal; none of its marks felt like a flow, and the bars came closest
([../DECISIONS.md](../DECISIONS.md)). Round 2 explores marks that read as flow, all in cobalt teal, on the design
canvas "smaltfl brand", in the round 2 board below round 1's.

| | Mark | How it says flow | Watch for |
| --- | --- | --- | --- |
| M6 | Cascade | The Stages bars joined into one staircase, flowing down into a pool | Close to a step chart |
| M7 | Stream | Two arrows forward and the packet ahead of them | The arrows are smaltui's Chevron, smaller and doubled |
| M8 | Tide | Two waves in 45° steps, the old sign for water; the chip is where they arrive | Can read as the zodiac sign |
| M9 | Bend | One path changing lanes at 45°, carrying the data as the chip | Shallow on purpose: a steep bend read as a backslash |
| M10 | Pour | A pipe that turns down, and the drop falling from it | Literal, like a tap |
| M11 | Wave | A flowing line and the chip it carries | Needs a curve: an exception to the 0/45/90° rule |

`marks.py` draws them in the format of smalt-brand's `scripts/brand_assets.py` (with a helper for bars that bend);
`python3 docs/brand/round-2/marks.py` regenerates `svg/`. M11's outline is checked to never fold over itself: its
radius of curvature stays above half its thickness.
