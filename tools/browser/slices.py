# Slice a tall phone screenshot into side-by-side strips you can read in one image.
#   python3 -I slices.py <in.png> <out.png> [strip height, default 1700] [max strips, default 4] [start y, default 0]
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
hgt = int(sys.argv[3]) if len(sys.argv) > 3 else 1700
most = int(sys.argv[4]) if len(sys.argv) > 4 else 4
y0 = int(sys.argv[5]) if len(sys.argv) > 5 else 0
im = Image.open(src).convert('RGB')
w, h = im.size
parts = [im.crop((0, y, w, min(h, y + hgt))) for y in range(y0, h, hgt)][:most]
out = Image.new('RGB', (w * len(parts) + 8 * (len(parts) - 1), hgt), 'white')
for i, p in enumerate(parts):
    out.paste(p, (i * (w + 8), 0))
out.save(dst)
print(f'{src}: {w}x{h}; wrote {len(parts)} strips from y={y0} to {dst}; {max(0, h - y0 - hgt * most)} px left below')
