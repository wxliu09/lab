import struct, sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
d = open(src + '/war3map.w3e', 'rb').read()
p = 4
ver, = struct.unpack_from('<i', d, p); p += 4
tileset = d[p:p+1]; p += 1
p += 4  # custom tilesets flag
a, = struct.unpack_from('<i', d, p); p += 4
grounds = [d[p+i*4:p+i*4+4].decode() for i in range(a)]; p += 4*a
b, = struct.unpack_from('<i', d, p); p += 4
cliffs = [d[p+i*4:p+i*4+4].decode() for i in range(b)]; p += 4*b
W, H = struct.unpack_from('<ii', d, p); p += 8
ox, oy = struct.unpack_from('<ff', d, p); p += 8
print('tileset', tileset, 'grounds', grounds, 'cliffs', cliffs, 'size', W, H, 'offset', ox, oy)
pal = [(70,70,78),(110,110,120),(60,90,60),(140,120,90),(90,90,100),(30,30,40),(160,160,170),(80,60,50),(50,70,110),(120,40,40),(100,130,80),(130,100,140),(40,40,40),(170,140,90),(90,110,130),(60,60,60)]
img = Image.new('RGB', (W, H))
px = img.load()
hmin, hmax = 1e9, -1e9
pts = []
for j in range(H):
    for i in range(W):
        h, w, f1, f2, c = struct.unpack_from('<hhBBB', d, p); p += 7
        flags = f1 >> 4; tex = f1 & 0xF
        water = bool(w & 0x4000) if ver >= 11 else bool(flags & 0x4)
        boundary = bool(w & 0x4000) and False
        layer = c & 0xF
        pts.append((i, j, tex, flags, layer, h, w))
for (i, j, tex, flags, layer, h, w) in pts:
    col = pal[tex % len(pal)]
    shade = 1.0 + 0.15 * (layer - 2)
    col = tuple(max(0, min(255, int(c*shade))) for c in col)
    if flags & 0x8: col = (12, 12, 18)       # boundary
    elif flags & 0x4: col = (40, 80, 160)    # water
    px[i, H-1-j] = col
img = img.resize((W*4, H*4), Image.NEAREST)
img.save(out)
print('saved', out, img.size)
