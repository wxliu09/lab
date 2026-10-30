import json, sys, collections
from PIL import Image, ImageDraw, ImageFont
terrain, placements, out = sys.argv[1:4]
img = Image.open(terrain).convert('RGB')
S = img.size[0] / 257.0 / 128.0
def px(x, y): return ((x + 16384) * S, img.size[1] - (y + 16384) * S)
p = json.load(open(placements))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
except Exception:
    font = small = ImageFont.load_default()
KEY = {'h011': ('GIT', (255, 80, 80)), 'h00G': ('Med', (120, 255, 160)), 'h00O': ('Suit', (255, 210, 90)), 'h00P': ('Suit', (255, 210, 90)),
       'h00Q': ('Suit', (255, 210, 90)), 'h00R': ('Suit', (255, 210, 90)), 'h014': ('Bomb', (255, 140, 60)), 'h017': ('Maint', (160, 200, 255)),
       'h023': ('Outpost', (200, 160, 255)), 'h049': ('LQ', (200, 160, 255)), 'h04S': ('Maint', (160, 200, 255)), 'h03Z': ('Fabricator', (255, 176, 0)),
       'h016': ('Portal', (120, 220, 255)), 'h02O': ('Pod', (220, 220, 220)), 'h019': ('Radar', (120, 220, 255)), 'h012': ('Gravity', (120, 220, 255))}
for u in p:
    k = KEY.get(u['rawcode'])
    if not k: 
        if u['name'] == 'Console' or u['rawcode'] in ('h004','h000','h006','h00A','h00Y','h02A','h048','h04B','h04F','h04I','h04R','h04U'):
            x, y = px(u['x'], u['y']); d.rectangle([x-2, y-2, x+2, y+2], fill=(80, 200, 255))
        continue
    x, y = px(u['x'], u['y']); d.ellipse([x-3, y-3, x+3, y+3], fill=k[1]); d.text((x+4, y-6), k[0], fill=k[1], font=small)
groups = collections.defaultdict(list)
for u in p:
    g = u.get('location_guess') or ''
    if g.startswith(('Raptor', 'Obda', 'Storage')): continue
    groups[g].append(px(u['x'], u['y']))
for g, pts in groups.items():
    if len(pts) < 2 and 'Pown' not in g and 'Sheepy' not in g: continue
    cx = sum(a for a, _ in pts) / len(pts); cy = min(b for _, b in pts) - 14
    label = g.replace(' interior', '').replace('U.S.I. ', '')
    w = d.textlength(label, font=font)
    d.rectangle([cx - w/2 - 3, cy - 2, cx + w/2 + 3, cy + 15], fill=(0, 0, 0))
    d.text((cx - w/2, cy), label, fill=(255, 255, 255), font=font)
img.save(out); print('saved', out)
