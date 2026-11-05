# smaltfl brand, round 3

**Status:** on hold until stenhoor has seen it ([../DECISIONS.md](../DECISIONS.md)).

Round 2's feedback: lean into waves and flow, as its one curved mark (M11) did. Every mark here is curved, so each
needs the exception to the 0/45/90° rule that smaltql's Star already has for its angles. The boards are on the design
canvas "smaltfl brand", in the round 3 board below round 2's.

| | Mark | How it says flow | Teal |
| --- | --- | --- | --- |
| M12 | Swell | One long wave, and the data riding in its dip | A small chip |
| M13 | Twin | Two waves in step, the old sign for water, and where they arrive | A small chip |
| M14 | Current | Three lines of moving water; the middle one carries the data ahead | A small chip |
| M15 | Wave arrow | A wave that points where it goes | The arrowhead |
| M16 | Undercurrent | A smalt wave over a teal one, a step behind | A whole wave (a second exception) |
| M17 | Twin in teal | Twin's two waves in step, the lower one teal | A whole wave (a second exception) |
| M18 | Current in teal | Three lines of water, the middle one teal and running furthest | A whole wave (a second exception) |

Dropped while drawing: a River (an S-bend from source to mouth), which read as a hook, and a Crest (a wave breaking
over itself), which read as the letter a.

`marks.py` draws them as solid bands around sampled curves, with square-cut ends, and refuses any outline that folds
over itself; `python3 docs/brand/round-3/marks.py` regenerates `svg/`. The canvas board computes the same curves in
its own script, checked to match these files exactly.
