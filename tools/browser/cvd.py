# Greyscale and deuteranopia versions of screenshots, for the colour-blind check.
#   python3 -I cvd.py <out_dir> <png>...
# Writes <name>-grey.png and <name>-deut.png (Machado et al. 2009, deuteranopia at full severity, on linear RGB).
import os
import sys

from PIL import Image

M = ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881))


def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb(c):
    c = max(0.0, min(1.0, c))
    return round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))


LUT = [lin(i) for i in range(256)]

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for path in sys.argv[2:]:
    name = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path).convert('RGB')
    im.convert('L').save(os.path.join(out, f'{name}-grey.png'))
    px = im.load()
    d = Image.new('RGB', im.size)
    dp = d.load()
    cache = {}
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            p = px[x, y]
            q = cache.get(p)
            if q is None:
                r, g, b = LUT[p[0]], LUT[p[1]], LUT[p[2]]
                q = tuple(srgb(m[0] * r + m[1] * g + m[2] * b) for m in M)
                cache[p] = q
            dp[x, y] = q
    d.save(os.path.join(out, f'{name}-deut.png'))
    print(name)
