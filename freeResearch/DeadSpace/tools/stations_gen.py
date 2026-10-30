#!/usr/bin/env python3
"""XENOCYTE 其餘站點版面產生器（女帝號以外的全部地點）。

用 layout_gen.Canvas 挖房間、開門、放設施，驗證後直接輸出
game/src/shared/content/stations/<id>.ts（完整 StationDef）。

用法：
  python3 -I tools/stations_gen.py            # 產生全部站並寫檔
  python3 -I tools/stations_gen.py tenshu     # 只產生／印出指定站
  python3 -I tools/stations_gen.py --print    # 只印 ASCII，不寫檔

驗證（任一失敗即中止，不寫檔）：
  - 所有字元都在 legend 或 pois 表內
  - 地板（含門、危險區、可走設施）4 向連通
  - 地板不鄰接太空（8 向）
  - 每個 flood 區（牆／門／窗分隔）恰好有一個房間種子；種子在地板上
  - 門寬 2–4、兩端是牆、兩側可通行
  - 佔格設施至少有一個相鄰可走格
  - 停機坪中心 5×5 皆可走、彼此不重疊
  - 出生點與停機坪數量符合設定
座標都是 (col, row)，row 0 在最上方；矩形含兩端。
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from layout_gen import Canvas  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'game', 'src', 'shared', 'content', 'stations')

FIXED = set('#. =xDSP~E')
WALK_FIXED = set('.SPE~D')


def ts_str(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


class St:
    def __init__(self, sid, w, h, fill='#'):
        self.id = sid
        self.c = Canvas(w, h, fill)
        self.rooms = []
        self.pois = {}
        self.door_specs = []  # ((c, r), ts)
        self.post = []
        self.expect = {}

    # ───── 挖形狀 ─────
    def rect(self, c0, r0, c1, r1, ch='.'):
        self.c.rect(c0, r0, c1, r1, ch)

    def octa(self, c0, r0, c1, r1, cut, ch='.'):
        """切角矩形（八角形房間）"""
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                dx = min(c - c0, c1 - c)
                dy = min(r - r0, r1 - r)
                if dx + dy >= cut:
                    self.c.put(c, r, ch)

    def disk(self, cx, cy, rad, ch='.', only=None):
        for r in range(int(cy - rad) - 1, int(cy + rad) + 2):
            for c in range(int(cx - rad) - 1, int(cx + rad) + 2):
                if (c - cx) ** 2 + (r - cy) ** 2 <= rad * rad:
                    if only is None or self.c.get(c, r) in only:
                        self.c.put(c, r, ch)

    def blob(self, cx, cy, rx, ry, seed, rough=0.25, ch='.', only=None):
        """不規則橢圓（室外地形）"""
        rnd = random.Random(seed)
        ph = [rnd.uniform(0, math.tau) for _ in range(4)]
        for r in range(int(cy - ry * 1.5) - 1, int(cy + ry * 1.5) + 2):
            for c in range(int(cx - rx * 1.5) - 1, int(cx + rx * 1.5) + 2):
                dx = (c - cx) / rx
                dy = (r - cy) / ry
                a = math.atan2(dy, dx)
                k = 1 + rough * (0.6 * math.sin(3 * a + ph[0]) + 0.4 * math.sin(5 * a + ph[1]) + 0.3 * math.sin(2 * a + ph[2]))
                if dx * dx + dy * dy <= k * k:
                    if only is None or self.c.get(c, r) in only:
                        self.c.put(c, r, ch)

    def at(self, c, r, ch):
        old = self.c.get(c, r)
        if old in '# ' and ch not in '# ':
            print(self.ascii())
            raise ValueError(f'{self.id}: 在牆上放 {ch!r} @{c},{r}')
        self.c.put(c, r, ch)

    def poi(self, ch, kind, ref=None, solid=None, facing=None, data=None):
        assert ch not in FIXED and len(ch) == 1, ch
        if ch in self.pois:
            raise ValueError(f'{self.id}: POI 字元重複 {ch}')
        parts = [f'kind: {ts_str(kind)}']
        if ref is not None:
            parts.append(f'ref: {ts_str(ref)}')
        if solid is not None:
            parts.append(f'solid: {"true" if solid else "false"}')
        if facing is not None:
            parts.append(f'facing: {facing}')
        if data is not None:
            kv = ', '.join(f'{k}: {ts_str(v) if isinstance(v, str) else v}' for k, v in data.items())
            parts.append(f'data: {{ {kv} }}')
        self.pois[ch] = {'ts': '{ ' + ', '.join(parts) + ' }', 'solid': solid is not False, 'kind': kind}

    def room(self, rid, zh, en, rtype, seed, light, accent=None):
        self.rooms.append({'id': rid, 'zh': zh, 'en': en, 'type': rtype, 'seed': list(seed), 'light': light, 'accent': accent})

    # ───── 門窗 ─────
    def door_ns(self, c, width, r_above, r_below, spec=None):
        self.c.door_ns(c, width, r_above, r_below)
        if spec:
            wall_rows = list(range(r_above + 1, r_below))
            self.door_specs.append(((c, wall_rows[(len(wall_rows) - 1) // 2]), spec))

    def door_ew(self, r, width, c_left, c_right, spec=None):
        self.c.door_ew(r, width, c_left, c_right)
        if spec:
            wall_cols = list(range(c_left + 1, c_right))
            self.door_specs.append(((wall_cols[(len(wall_cols) - 1) // 2], r), spec))

    def bulkhead(self, cells, spec=None):
        """走廊中段的隔艙門（兩端必須是牆）：把房間切開、讓燈光依段配置"""
        for cc, r in cells:
            self.c.put(cc, r, 'D')
        if spec:
            self.door_specs.append((cells[0], spec))

    def gap_ns(self, c, width, r_above, r_below, ch='.'):
        """不放門的通道（同一房間內）"""
        for r in range(r_above + 1, r_below):
            for i in range(width):
                self.c.put(c + i, r, ch)

    def win_ns(self, c0, c1, r_above, r_below):
        self.c.window_ns(c0, c1, r_above, r_below)

    def win_ew(self, r0, r1, c_left, c_right):
        for cc in range(c_left + 1, c_right):
            for r in range(r0, r1 + 1):
                self.c.put(cc, r, '=')

    # ───── 道具 ─────
    def near(self, c, r, chars, d):
        for rr in range(r - d, r + d + 1):
            for cc in range(c - d, c + d + 1):
                if self.c.get(cc, rr) in chars:
                    return True
        return False

    def edge_props(self, c0, r0, c1, r1, step=2, sides='nsew', phase=0, skip_door=3, ch='x', corners=True, pattern=None):
        """沿房間內緣放道具（避開門與設施）：每 step 格一個，或依 pattern（'x' 放、'.' 空）循環"""
        cells = []
        if 'n' in sides:
            cells += [(c, r0) for c in range(c0, c1 + 1)]
        if 's' in sides:
            cells += [(c, r1) for c in range(c0, c1 + 1)]
        if 'w' in sides:
            cells += [(c0, r) for r in range(r0 + 1, r1)]
        if 'e' in sides:
            cells += [(c1, r) for r in range(r0 + 1, r1)]
        for i, (c, r) in enumerate(cells):
            if pattern:
                if pattern[(i + phase) % len(pattern)] != 'x':
                    continue
            elif (i + phase) % step:
                continue
            if not corners and (c in (c0, c1) and r in (r0, r1)):
                continue
            if self.c.get(c, r) != '.':
                continue
            if self.near(c, r, 'DE', skip_door):
                continue
            if self.near(c, r, ''.join(k for k, p in self.pois.items() if p['solid'] or True), 1) and ch == 'x':
                continue
            self.c.put(c, r, ch)

    def scatter(self, c0, r0, c1, r1, n, seed, ch='x', clear=2, only='.'):
        rnd = random.Random(seed)
        tries = 0
        while n > 0 and tries < 4000:
            tries += 1
            c = rnd.randint(c0, c1)
            r = rnd.randint(r0, r1)
            if self.c.get(c, r) not in only:
                continue
            if self.near(c, r, 'DSPE' + ''.join(self.pois), clear):
                continue
            if self.near(c, r, 'x', 1) and rnd.random() < 0.7:
                continue
            self.c.put(c, r, ch)
            n -= 1

    # ───── 收尾 ─────
    def finish(self, trim=2):
        if trim:
            self.c.trim(trim)
        # 封住內部的太空孔洞（修邊後被牆包圍、不連到外面的空白）
        g = self.c.g
        W0, H0 = self.c.w, self.c.h
        out = set()
        st = [(c, r) for c in range(W0) for r in (0, H0 - 1)] + [(c, r) for r in range(H0) for c in (0, W0 - 1)]
        st = [p for p in st if g[p[1]][p[0]] == ' ']
        out.update(st)
        while st:
            c, r = st.pop()
            for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (c + dc, r + dr)
                if 0 <= n[0] < W0 and 0 <= n[1] < H0 and n not in out and g[n[1]][n[0]] == ' ':
                    out.add(n)
                    st.append(n)
        for r in range(H0):
            for c in range(W0):
                if g[r][c] == ' ' and (c, r) not in out:
                    g[r][c] = '#'
        for f in self.post:
            f(self)
        # 裁切到外框（保留 0 邊）
        g = self.c.g
        rows = [r for r in range(self.c.h) if any(ch != ' ' for ch in g[r])]
        cols = [c for c in range(self.c.w) if any(g[r][c] != ' ' for r in range(self.c.h))]
        r0, r1, c0, c1 = rows[0], rows[-1], cols[0], cols[-1]
        self.grid = [row[c0:c1 + 1] for row in g[r0:r1 + 1]]
        self.W = c1 - c0 + 1
        self.H = r1 - r0 + 1
        for rm in self.rooms:
            rm['seed'] = [rm['seed'][0] - c0, rm['seed'][1] - r0]
            if self.grid[rm['seed'][1]][rm['seed'][0]] == 'x':
                self.grid[rm['seed'][1]][rm['seed'][0]] = '.'
        self.door_specs = [((c - c0, r - r0), s) for (c, r), s in self.door_specs]
        self.unblock()
        self.validate()

    def unblock(self):
        """道具把地板隔成孤島時，拿掉相鄰的 x 直到全部連通"""
        for _ in range(200):
            walk = [(c, r) for r in range(self.H) for c in range(self.W) if self.walkable(self.grid[r][c])]
            if not walk:
                return
            comps = []
            seen = set()
            for p0 in walk:
                if p0 in seen:
                    continue
                comp = {p0}
                st = [p0]
                seen.add(p0)
                while st:
                    c, r = st.pop()
                    for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        n = (c + dc, r + dr)
                        if n not in seen and self.walkable(self.get(*n)):
                            seen.add(n)
                            comp.add(n)
                            st.append(n)
                comps.append(comp)
            if len(comps) == 1:
                return
            comps.sort(key=len)
            small = comps[0]
            fixed = False
            for (c, r) in sorted(small):
                for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(c + dc, r + dr) == 'x':
                        self.grid[r + dr][c + dc] = '.'
                        fixed = True
                        break
                if fixed:
                    break
            if not fixed:
                return

    def get(self, c, r):
        if 0 <= c < self.W and 0 <= r < self.H:
            return self.grid[r][c]
        return ' '

    def walkable(self, ch):
        if ch in WALK_FIXED:
            return True
        p = self.pois.get(ch)
        return bool(p and not p['solid'])

    def validate(self):
        sid = self.id
        errs = []
        W, H = self.W, self.H
        for r in range(H):
            for c in range(W):
                ch = self.grid[r][c]
                if ch not in FIXED and ch not in self.pois:
                    errs.append(f'未定義字元 {ch!r} @{c},{r}')
        # 地板不鄰接太空
        for r in range(H):
            for c in range(W):
                ch = self.grid[r][c]
                if ch in '# ':
                    continue
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        if self.get(c + dc, r + dr) == ' ' and ch != '=':
                            errs.append(f'{ch!r} @{c},{r} 鄰接太空')
                            break
        # 連通
        walk = [(c, r) for r in range(H) for c in range(W) if self.walkable(self.grid[r][c])]
        if walk:
            seen = {walk[0]}
            st = [walk[0]]
            while st:
                c, r = st.pop()
                for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (c + dc, r + dr)
                    if n not in seen and self.walkable(self.get(*n)):
                        seen.add(n)
                        st.append(n)
            lost = [p for p in walk if p not in seen]
            if lost:
                errs.append(f'有 {len(lost)} 格地板不連通，例如 {lost[:6]}')
        # 房間 flood
        region = {}
        rid = 0
        blockers = set('# D=')
        for r in range(H):
            for c in range(W):
                if self.grid[r][c] in blockers or (c, r) in region:
                    continue
                st = [(c, r)]
                region[(c, r)] = rid
                while st:
                    cc, rr = st.pop()
                    for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        n = (cc + dc, rr + dr)
                        if n in region or self.get(*n) in blockers:
                            continue
                        region[n] = rid
                        st.append(n)
                rid += 1
        seeded = {}
        for rm in self.rooms:
            sc, sr = rm['seed']
            ch = self.get(sc, sr)
            if ch in blockers or not self.walkable(ch):
                errs.append(f'房間 {rm["id"]} 種子 {sc},{sr} 不在可走地板上（{ch!r}）')
                continue
            g = region[(sc, sr)]
            if g in seeded:
                errs.append(f'房間 {rm["id"]} 與 {seeded[g]} 在同一 flood 區')
            seeded[g] = rm['id']
        counts = {}
        for p, g in region.items():
            counts.setdefault(g, []).append(p)
        for g, cells in counts.items():
            if g not in seeded:
                errs.append(f'未指定房間的區域 {len(cells)} 格，例如 {cells[:3]}')
        self.region = region
        self.region_room = seeded
        # 每個房間要有焦點（道具或設施）
        for g, name in seeded.items():
            rm = next(x for x in self.rooms if x['id'] == name)
            if rm['type'] == 'corridor':
                continue
            has = any(self.grid[r][c] == 'x' or self.grid[r][c] in self.pois or self.grid[r][c] == 'P' for (c, r) in counts[g])
            if not has:
                errs.append(f'房間 {name} 沒有道具或設施')
        # 門
        seen = set()
        for r in range(H):
            for c in range(W):
                if self.grid[r][c] != 'D' or (c, r) in seen:
                    continue
                horiz = self.get(c + 1, r) == 'D' or self.get(c, r + 1) != 'D'
                run = []
                cc, rr = c, r
                while self.get(cc, rr) == 'D':
                    run.append((cc, rr))
                    seen.add((cc, rr))
                    if horiz:
                        cc += 1
                    else:
                        rr += 1
                if not 2 <= len(run) <= 4:
                    errs.append(f'門 @{c},{r} 寬 {len(run)}')
                (fc, fr), (lc, lr) = run[0], run[-1]
                if horiz:
                    ends = [self.get(fc - 1, fr), self.get(lc + 1, lr)]
                    sides = [[self.get(x, y - 1) for x, y in run], [self.get(x, y + 1) for x, y in run]]
                else:
                    ends = [self.get(fc, fr - 1), self.get(lc, lr + 1)]
                    sides = [[self.get(x - 1, y) for x, y in run], [self.get(x + 1, y) for x, y in run]]
                if any(e not in '#=' for e in ends):
                    errs.append(f'門 @{c},{r} 兩端不是牆 {ends}')
                for s in sides:
                    if not all(self.walkable(x) for x in s):
                        errs.append(f'門 @{c},{r} 一側被擋 {s}')
        for (c, r), _ in self.door_specs:
            if self.get(c, r) != 'D':
                errs.append(f'門設定 @{c},{r} 不在門上')
        # 設施可互動
        for r in range(H):
            for c in range(W):
                ch = self.grid[r][c]
                p = self.pois.get(ch)
                if p and p['solid'] and p['kind'] not in ('cannonBody', 'cannonBreech'):
                    if not any(self.walkable(self.get(c + dc, r + dr)) for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        errs.append(f'設施 {ch}({p["kind"]}) @{c},{r} 四周沒有可走格')
        # 停機坪
        pads = [(c, r) for r in range(H) for c in range(W) if self.grid[r][c] == 'P']
        for i, (c, r) in enumerate(pads):
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    ch = self.get(c + dc, r + dr)
                    if not self.walkable(ch) or ch == 'D':
                        errs.append(f'停機坪 @{c},{r} 5×5 內有障礙 {ch!r} @{c + dc},{r + dr}')
            for (c2, r2) in pads[i + 1:]:
                if max(abs(c - c2), abs(r - r2)) < 6:
                    errs.append(f'停機坪 @{c},{r} 與 @{c2},{r2} 太近')
        spawns = sum(row.count('S') for row in self.grid)
        if 'spawns' in self.expect and spawns != self.expect['spawns']:
            errs.append(f'出生點 {spawns} ≠ {self.expect["spawns"]}')
        if 'pads' in self.expect and len(pads) != self.expect['pads']:
            errs.append(f'停機坪 {len(pads)} ≠ {self.expect["pads"]}')
        for ch, n in self.expect.get('poi', {}).items():
            have = sum(row.count(ch) for row in self.grid)
            if have != n:
                errs.append(f'POI {ch} 數量 {have} ≠ {n}')
        if errs:
            print(self.ascii())
            raise SystemExit(f'[{sid}] 驗證失敗：\n  ' + '\n  '.join(errs[:40]))

    def ascii(self):
        g = getattr(self, 'grid', self.c.g)
        w = len(g[0])
        head = '    ' + ''.join(str(c // 10 % 10) for c in range(w)) + '\n    ' + ''.join(str(c % 10) for c in range(w))
        return head + '\n' + '\n'.join(f'{r:3d} ' + ''.join(row) for r, row in enumerate(g))

    def stats(self):
        n_floor = sum(1 for r in range(self.H) for c in range(self.W) if self.grid[r][c] not in '# ')
        return f'{self.id}: {self.W}×{self.H}，可用格 {n_floor}，房間 {len(self.rooms)}，POI 字元 {len(self.pois)}'

    # ───── 輸出 ─────
    def emit(self, const, header, meta):
        rows = [''.join(r).rstrip() for r in self.grid]
        lines = [f'// {header}', '// 版面由 tools/stations_gen.py 產生（改版面請改產生器再重跑，不要手改 rows）。', "import type { StationDef } from './types'", '', f'export const {const}: StationDef = {{']
        lines += ['  ' + m for m in meta.strip('\n').split('\n')]
        lines.append('  layout: {')
        lines.append('    rows: [')
        lines += [f'      {ts_str(r)},' for r in rows]
        lines.append('    ],')
        lines.append('    pois: {')
        for ch, p in self.pois.items():
            key = ch if ch.isalpha() else ts_str(ch)
            lines.append(f'      {key}: {p["ts"]},')
        lines.append('    },')
        if self.door_specs:
            lines.append('    doors: {')
            for (c, r), s in self.door_specs:
                lines.append(f"      '{c},{r}': {s},")
            lines.append('    },')
        lines.append('    rooms: [')
        for rm in self.rooms:
            acc = f", accent: {ts_str(rm['accent'])}" if rm['accent'] else ''
            lines.append(
                f"      {{ id: {ts_str(rm['id'])}, name: {{ zh: {ts_str(rm['zh'])}, en: {ts_str(rm['en'])} }}, type: {ts_str(rm['type'])}, seed: [{rm['seed'][0]}, {rm['seed'][1]}], light: {ts_str(rm['light'])}{acc} }},"
            )
        lines.append('    ],')
        lines.append('  },')
        lines.append('}')
        return '\n'.join(lines) + '\n'


def space_pos(x, y):
    return (round((x - 11472) / 100, 1), round((y + 11472) / 100, 1))


STATIONS = {}


def station(fn):
    STATIONS[fn.__name__] = fn
    return fn


# ════════════════════════════════════════════════════════════════
# 裁決者號 Adjudicatrix：通訊感測站。中央艦橋＋環形走廊，四方放射配置。
# ════════════════════════════════════════════════════════════════
@station
def adjudicatrix():
    s = St('adjudicatrix', 80, 60)
    c = s.c
    s.poi('c', 'console', 'adjudicatrix')
    s.poi('r', 'vendor', 'radar')
    s.poi('f', 'fabricator', facing='Math.PI')
    s.poi('q', 'fabricatorPad', solid=False)
    s.poi('m', 'moduleSocket', data={'module': 'modScanAmp'})
    s.poi('h', 'vendor', 'medical')
    s.poi('a', 'vendor', 'suitA')
    s.poi('d', 'vendor', 'suitD')
    s.poi('z', 'vendor', 'fusion')
    s.poi('n', 'vendor', 'maintenance')
    s.poi('o', 'vendor', 'outpost')
    s.poi('y', 'vendor', 'escapePod')
    s.poi('w', 'patrol', solid=False)
    # 環形走廊與中央艦橋
    s.rect(24, 15, 45, 35)
    s.rect(27, 18, 42, 32, '#')
    s.octa(29, 20, 40, 30, 3)
    s.door_ns(34, 2, 17, 20)
    s.door_ns(34, 2, 30, 33)
    s.door_ew(24, 3, 26, 29)
    s.door_ew(24, 3, 40, 43)
    s.win_ns(32, 33, 17, 20)
    s.win_ns(36, 37, 17, 20)
    s.win_ns(32, 33, 30, 33)
    s.win_ns(36, 37, 30, 33)
    # 雷達穹頂（北）
    s.octa(26, 1, 43, 12, 4)
    s.door_ns(34, 2, 12, 15)
    # 感測陣列（西）＋補給區（西南）
    s.rect(5, 15, 20, 25)
    s.door_ew(19, 3, 20, 24)
    s.rect(5, 28, 20, 35)
    s.door_ew(31, 2, 20, 24)
    # 鑄造廠（東）＋宿舍（東南）
    s.rect(49, 15, 64, 25)
    s.door_ew(19, 3, 45, 49)
    s.rect(49, 28, 64, 35)
    s.door_ew(29, 2, 45, 49)
    # 環廊四角的隔艙門：把環形走廊切成四段
    s.bulkhead([(42, r) for r in range(15, 18)])
    s.bulkhead([(cc, 32) for cc in range(43, 46)])
    s.bulkhead([(27, r) for r in range(33, 36)])
    s.bulkhead([(cc, 18) for cc in range(24, 27)])
    # 停機坪（南）＋救生艙＋維修間
    s.rect(14, 39, 55, 49)
    s.door_ns(33, 4, 35, 39)
    s.rect(58, 39, 64, 46)
    s.door_ew(41, 2, 55, 58)
    s.rect(5, 39, 11, 46)
    s.door_ew(41, 2, 11, 14)
    # 設施
    s.at(34, 25, 'c')
    s.at(34, 6, 'r')
    for r in range(19, 22):
        for cc in range(59, 62):
            s.at(cc, r, 'q')
    s.at(63, 20, 'f')
    s.at(12, 20, 'm')
    for cc, ch in ((7, 'h'), (10, 'a'), (13, 'd'), (16, 'z')):
        s.at(cc, 28, ch)
    s.at(5, 33, 'o')
    s.at(11, 46, 'n')
    s.at(64, 43, 'y')
    for cc in (20, 29, 40, 49):
        s.at(cc, 44, 'P')
    for cc in (53, 57, 61):
        s.at(cc, 32, 'S')
    for cc, r in ((30, 16), (39, 34), (25, 25), (34, 41), (44, 20)):
        s.at(cc, r, 'w')
    # 道具
    for cc, r in ((31, 22), (38, 22), (31, 28), (38, 28), (33, 21), (36, 21)):
        s.at(cc, r, 'x')
    s.edge_props(26, 1, 43, 12, pattern='x..')
    for cc, r in ((31, 4), (38, 4), (30, 8), (39, 8)):
        s.at(cc, r, 'x')
    s.edge_props(5, 15, 20, 25, sides='ns', pattern='xxx..')
    for cc in (8, 9, 15, 16):
        for r in (19, 21):
            s.at(cc, r, 'x')
    s.edge_props(5, 28, 20, 35, sides='s', pattern='xx.')
    s.edge_props(49, 15, 64, 25, sides='ns', pattern='x.xx...')
    for r in (17, 23):
        s.at(54, r, 'x')
        s.at(55, r, 'x')
    s.edge_props(49, 28, 64, 35, sides='ns', pattern='xx..')
    s.edge_props(14, 39, 55, 49, sides='s', pattern='xxx.....')
    s.edge_props(14, 39, 55, 49, sides='ew', pattern='x.x')
    for cc in (16, 17, 52, 53):
        s.at(cc, 39, 'x')
    s.edge_props(58, 39, 64, 46, sides='ns', pattern='x.')
    s.edge_props(5, 39, 11, 46, sides='nw', pattern='xx.')
    # 房間
    s.room('bridge', '指揮艦橋', 'Command Bridge', 'bridge', (34, 27), '#6c93e0', '#ffb000')
    s.room('radar', '雷達穹頂', 'Radar Dome', 'radar', (34, 9), '#4d7fd6', '#ffc23d')
    s.room('ringN', '北環廊', 'North Ring', 'corridor', (30, 16), '#ffb46b')
    s.room('ringE', '東環廊', 'East Ring', 'corridor', (44, 22), '#ffb46b')
    s.room('ringS', '南環廊', 'South Ring', 'corridor', (40, 34), '#ffb46b')
    s.room('ringW', '西環廊', 'West Ring', 'corridor', (25, 28), '#ffb46b')
    s.room('sensor', '感測陣列', 'Sensor Array', 'comms', (12, 23), '#4f79d8', '#ffb000')
    s.room('commissary', '補給區', 'Commissary', 'commissary', (12, 32), '#dce8ff', '#ffb46b')
    s.room('foundry', '鑄造廠', 'Foundry', 'foundry', (55, 20), '#ffb000', '#e6e6e6')
    s.room('quarters', '宿舍', 'Crew Quarters', 'quarters', (55, 30), '#ffd9a8', '#6c93e0')
    s.room('hangar', '停機坪', 'Hangar', 'hangar', (34, 41), '#c8d8f0', '#ffc23d')
    s.room('pods', '救生艙室', 'Escape Pods', 'pods', (61, 41), '#ffb46b', '#ff3b3b')
    s.room('workshop', '維修間', 'Workshop', 'cargo', (8, 42), '#ffb46b', '#6c93e0')
    s.expect = {'spawns': 3, 'pads': 4}
    s.finish()
    px, py = space_pos(14236.8, -8238)
    meta = f"""
id: 'adjudicatrix',
name: {{ zh: '裁決者號', en: 'Adjudicatrix' }},
theme: 'adjudicatrix',
enable: 'core',
scanTime: 4.27,
podLanding: 'y',
dockable: true,
space: {{
  hp: 400000,
  hpRegen: 200,
  radius: 1.8,
  pos: [{px}, {py}],
  speed: 0.45,
  attack: {{ dmg: [124, 124], cd: 0.5, range: 24, kind: 'projectile', projSpeed: 30, fx: 'stationGun' }},
  abilities: ['st.sweep'],
  pilotable: true,
  model: 'station.adjudicatrix',
}},
docked: [
  {{ ship: 'kestrel', pad: 0 }},
  {{ ship: 'kestrel', pad: 1 }},
],
"""
    return s, 'ADJUDICATRIX', '裁決者號 Adjudicatrix：通訊感測站（GDD §6.2）。中央指揮艦橋＋環形走廊，雷達穹頂、感測陣列、仿生人鑄造廠放射配置。', meta



def add_space_windows(cells):
    """修邊後把外殼牆改成窗（窗外直接是太空）"""
    def f(s):
        for (cc, r) in cells:
            s.c.put(cc, r, '=')
    return f


# ════════════════════════════════════════════════════════════════
# 天守砲台 Tenshu Battery：軍事砲台。北側主砲廊（巨型砲管貫穿整個廳）、射控室，南側電容環室。
# ════════════════════════════════════════════════════════════════
@station
def tenshu():
    s = St('tenshu', 64, 48)
    s.poi('c', 'console', 'tenshu')
    s.poi('k', 'cannonBreech', '32.6', facing='Math.PI')
    s.poi('u', 'cannonBody')
    s.poi('m', 'moduleSocket', data={'module': 'modAntimatter'})
    s.poi('l', 'vendor', 'lq')
    s.poi('h', 'vendor', 'medical')
    s.poi('b', 'vendor', 'suitB')
    s.poi('z', 'vendor', 'fusion')
    s.poi('o', 'vendor', 'outpost')
    s.poi('y', 'vendor', 'escapePod')
    s.poi('w', 'patrol', solid=False)
    # 北：主砲廊＋射控室
    s.rect(2, 2, 40, 13)
    s.rect(43, 2, 53, 13)
    s.door_ew(7, 2, 40, 43)
    s.win_ew(3, 5, 40, 43)
    s.win_ew(10, 12, 40, 43)
    # 走廊
    s.rect(2, 16, 53, 18)
    s.door_ns(37, 3, 13, 16)
    s.door_ns(47, 2, 13, 16)
    # 南：停機坪、電容環室、醫療、救生艙、軍械、LQ 倉儲
    s.rect(2, 21, 18, 37)
    s.door_ns(9, 3, 18, 21)
    s.octa(21, 22, 35, 36, 4)
    s.door_ns(27, 3, 18, 22)
    s.rect(38, 21, 45, 27)
    s.door_ns(40, 2, 18, 21)
    s.rect(38, 30, 45, 37)
    s.door_ew(30, 2, 35, 38)
    s.rect(48, 21, 53, 28)
    s.door_ns(50, 2, 18, 21)
    s.rect(48, 31, 53, 37)
    s.door_ns(50, 2, 28, 31)
    # 砲管：砲尾在東、砲口穿進西側外牆
    for r in range(7, 10):
        for cc in range(2, 34):
            s.at(cc, r, 'u')
    for r in range(6, 11):
        for cc in range(34, 37):
            s.at(cc, r, 'u')
    s.at(35, 8, 'k')
    s.at(49, 7, 'c')
    s.at(28, 29, 'm')
    s.at(41, 21, 'h')
    s.at(45, 34, 'y')
    s.at(48, 23, 'b')
    s.at(53, 23, 'z')
    s.at(48, 26, 'o')
    s.at(53, 34, 'l')
    for cc, r in ((6, 26), (14, 26), (10, 33)):
        s.at(cc, r, 'P')
    for cc, r in ((10, 17), (30, 17), (45, 17), (38, 4), (28, 25)):
        s.at(cc, r, 'w')
    # 道具：能量導管沿砲廊牆、電容柱環繞反應爐
    s.edge_props(2, 2, 40, 13, sides='ns', pattern='xx.x..', skip_door=2)
    for cc, r in ((46, 4), (51, 4), (46, 10), (51, 10), (45, 7), (53, 7)):
        s.at(cc, r, 'x')
    for a in range(8):
        ang = a / 8 * math.tau + math.pi / 8
        s.at(round(28 + math.cos(ang) * 5), round(29 + math.sin(ang) * 5), 'x')
    s.edge_props(2, 21, 18, 37, sides='ew', pattern='x..', skip_door=2)
    s.edge_props(2, 21, 18, 37, sides='s', pattern='xx...')
    for r in (24, 26):
        s.at(44, r, 'x')
    s.edge_props(38, 30, 45, 37, sides='nsw', pattern='x.')
    s.edge_props(48, 31, 53, 37, sides='nsw', pattern='xx.')
    s.room('gunhall', '主砲廊', 'Main Gun Gallery', 'cannon', (38, 11), '#ffb88a', '#ff7a2a')
    s.room('fire', '射控室', 'Fire Control', 'bridge', (49, 10), '#ffc8a0', '#7fd8ff')
    s.room('corridor', '主走廊', 'Main Corridor', 'corridor', (20, 17), '#ffb07a')
    s.room('hangar', '停機坪', 'Hangar', 'hangar', (10, 30), '#ffe0c0', '#ff7a2a')
    s.room('reactor', '電容環室', 'Capacitor Ring', 'reactor', (28, 32), '#ffa070', '#ff7a2a')
    s.room('medbay', '醫療站', 'Aid Station', 'medbay', (42, 25), '#f2f6ff', '#5cf2a5')
    s.room('pods', '救生艙室', 'Escape Pods', 'pods', (41, 33), '#ffb88a', '#ff3b3b')
    s.room('armory', '軍械庫', 'Armory', 'armory', (50, 25), '#ffc89a', '#ff5a3a')
    s.room('lq', 'LQ 倉儲', 'LQ Storage', 'cargo', (50, 35), '#ffd0a8', '#c0c8d0')
    s.expect = {'spawns': 0, 'pads': 3}
    s.finish()
    px, py = space_pos(7809.9, -12085.6)
    meta = f"""
id: 'tenshu',
name: {{ zh: '天守砲台', en: 'Tenshu Battery' }},
theme: 'tenshu',
enable: 'core',
scanTime: 1.74,
podLanding: 'y',
dockable: true,
space: {{
  hp: 200000,
  hpRegen: 100,
  radius: 2.3,
  pos: [{px}, {py}],
  speed: 0.4,
  attack: {{ dmg: [125, 125], cd: 0.4, range: 24, kind: 'projectile', projSpeed: 30, fx: 'stationGun' }},
  abilities: ['st.sweep', 'st.cannon'],
  pilotable: true,
  model: 'station.tenshu',
}},
docked: [],
"""
    return s, 'TENSHU', '天守砲台 Tenshu Battery：軍事砲台（GDD §6.2）。砲管貫穿主砲廊、射控室隔窗俯瞰，南側電容環室安裝反物質模組。', meta


# ════════════════════════════════════════════════════════════════
# 七號廢站 Hulk-7：預定拆除的空站。清潔工門把守入口，殘骸滿地、反應爐漏電。
# ════════════════════════════════════════════════════════════════
@station
def hulk7():
    s = St('hulk7', 56, 46)
    s.poi('w', 'patrol', solid=False)
    s.poi('a', 'arcLeak')
    s.rect(4, 2, 19, 9)
    s.rect(22, 2, 33, 9)
    s.rect(4, 12, 28, 20)
    s.door_ns(11, 2, 9, 12)
    s.door_ns(26, 2, 9, 12)
    s.octa(31, 12, 44, 25, 3)
    s.door_ew(16, 2, 28, 31)
    s.rect(2, 23, 26, 32)
    s.door_ns(12, 3, 20, 23, spec="{ clearance: 'janitor' }")
    s.rect(29, 28, 42, 34)
    s.door_ew(30, 2, 26, 29)
    s.door_ns(36, 2, 25, 28)
    # 停機坪
    s.at(8, 28, 'P')
    s.at(20, 28, 'P')
    # 漏電危險區
    for cc, r in ((37, 18), (38, 18), (39, 18), (37, 19), (38, 19), (36, 20), (40, 17), (20, 14), (21, 14), (21, 15), (31, 31), (32, 31)):
        s.at(cc, r, '~')
    for cc, r in ((10, 16), (24, 16), (38, 31), (10, 6)):
        s.at(cc, r, 'w')
    # 漏電點：放在每團危險區旁、最靠近重心的空地上（模型的電弧向四周亂跳）
    for hz in (((37, 18), (38, 18), (39, 18), (37, 19), (38, 19), (36, 20), (40, 17)), ((20, 14), (21, 14), (21, 15)), ((31, 31), (32, 31))):
        gx = sum(c for c, _ in hz) / len(hz)
        gy = sum(r for _, r in hz) / len(hz)
        cand = [(abs(cc - gx) + abs(r - gy), cc, r) for cc in range(int(gx) - 3, int(gx) + 4) for r in range(int(gy) - 3, int(gy) + 4)
                if s.c.get(cc, r) == '.' and any((cc + dc, r + dr) in hz for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        _, cc, r = min(cand)
        s.at(cc, r, 'a')
    # 殘骸：大量 x
    s.edge_props(4, 2, 19, 9, sides='nsew', pattern='xx..x.')
    s.edge_props(22, 2, 33, 9, sides='nsew', pattern='x.xx..')
    s.edge_props(4, 12, 28, 20, sides='ns', pattern='xxx...x..')
    s.edge_props(2, 23, 26, 32, sides='sew', pattern='xx..')
    s.edge_props(29, 28, 42, 34, sides='nse', pattern='xxx.')
    s.scatter(5, 3, 18, 8, 4, 11)
    s.scatter(23, 3, 32, 8, 4, 12)
    s.scatter(6, 13, 27, 19, 9, 13)
    s.scatter(32, 13, 43, 24, 10, 14)
    s.scatter(30, 29, 41, 33, 4, 15)
    for cc in range(3, 26, 5):
        s.at(cc, 23, 'x') if abs(cc - 13) > 3 else None
    s.room('observation', '觀景廊', 'Observation Deck', 'derelict', (11, 5), '#9fb3c0', '#ff9a4a')
    s.room('quarters', '廢棄宿舍', 'Abandoned Bunks', 'derelict', (27, 5), '#c99a6b', '#7fd8ff')
    s.room('hall', '主廳', 'Main Hall', 'derelict', (12, 15), '#d0a070', '#ff7a2a')
    s.room('reactor', '熄火反應爐', 'Cold Reactor', 'derelict', (37, 15), '#ff8a4a', '#8fd0ff')
    s.room('dock', '殘破船塢', 'Derelict Dock', 'derelict', (14, 27), '#b8a890', '#ffc23d')
    s.room('storage', '貨艙', 'Cargo Hold', 'derelict', (35, 32), '#a89070', '#ff9a4a')
    s.expect = {'spawns': 0, 'pads': 2}
    s.post.append(add_space_windows([(cc, r) for cc in range(7, 17) for r in (0, 1)]))
    s.finish()
    px, py = space_pos(15028.6, -13410.3)
    meta = f"""
id: 'hulk7',
name: {{ zh: '七號廢站', en: 'Hulk-7' }},
theme: 'hulk7',
enable: 'core',
scanTime: 0.46,
dockable: true,
hazardDps: 15,
space: {{
  hp: 120000,
  hpRegen: 100,
  radius: 1.0,
  pos: [{px}, {py}],
  speed: 0,
  // 原作數值保留，但站永遠中立、沒有控制台，不會開火
  attack: {{ dmg: [12500, 12500], cd: 0.4, range: 24, kind: 'projectile', projSpeed: 30, fx: 'stationGun' }},
  abilities: [],
  pilotable: false,
  model: 'station.hulk7',
}},
docked: [],
"""
    return s, 'HULK7', '七號廢站 Hulk-7：預定拆除的空站（GDD §6.2）。沒有控制台；船塢進站要清潔工卡，反應爐漏電。', meta


# ════════════════════════════════════════════════════════════════
# 豪勇號 Bravado：戰艦。艦艏楔形艦橋、龍骨主走廊、北側軍械／宿舍／艦長室、南側飛行甲板。
# ════════════════════════════════════════════════════════════════
@station
def bravado():
    s = St('bravado', 92, 60)
    s.poi('c', 'console', 'bravado')
    s.poi('L', 'landingPortal', solid=False)
    s.poi('a', 'vendor', 'suitA')
    s.poi('b', 'vendor', 'suitB')
    s.poi('u', 'vendor', 'suitC')
    s.poi('d', 'vendor', 'suitD')
    s.poi('z', 'vendor', 'fusion')
    s.poi('h', 'vendor', 'medical')
    s.poi('n', 'vendor', 'maintenance')
    s.poi('o', 'vendor', 'outpost')
    s.poi('y', 'vendor', 'escapePod')
    s.poi('k', 'captainSpawn', solid=False)
    s.poi('w', 'patrol', solid=False)
    sec = '{ security: true }'
    # 龍骨主走廊
    s.rect(4, 23, 64, 25)
    # 北側
    s.rect(2, 7, 15, 20)
    s.rect(18, 5, 31, 20)
    s.rect(34, 7, 47, 20)
    s.rect(50, 11, 60, 20)
    s.door_ns(8, 2, 20, 23)
    s.door_ns(24, 2, 20, 23, sec)
    s.door_ns(40, 2, 20, 23)
    s.door_ns(55, 2, 20, 23, sec)
    # 艦橋（楔形艦艏）
    for r in range(15, 34):
        s.rect(67, r, 80 - abs(r - 24), r)
    s.door_ew(23, 3, 64, 67, sec)
    # 南側
    s.rect(2, 28, 13, 34)
    s.rect(16, 28, 27, 34)
    s.rect(30, 28, 41, 34)
    s.rect(44, 28, 46, 35)
    s.rect(49, 28, 55, 34)
    s.rect(58, 28, 64, 34)
    s.door_ns(7, 2, 25, 28)
    s.door_ns(21, 2, 25, 28)
    s.door_ns(35, 2, 25, 28, sec)
    s.door_ns(44, 3, 25, 28)
    s.door_ns(51, 2, 25, 28)
    s.door_ns(60, 2, 25, 28)
    # 飛行甲板
    s.rect(4, 38, 62, 47)
    s.door_ns(44, 3, 35, 38, sec)
    s.door_ns(7, 2, 34, 38)
    # 設施
    s.at(74, 24, 'c')
    s.at(35, 31, 'L')
    for cc, ch in ((20, 'a'), (23, 'b'), (26, 'u'), (29, 'd')):
        s.at(cc, 5, ch)
    s.at(31, 12, 'z')
    s.at(2, 10, 'n')
    s.at(19, 28, 'h')
    s.at(55, 31, 'h')
    s.at(64, 31, 'o')
    s.at(2, 31, 'y')
    s.at(57, 14, 'k')
    for cc in (37, 41, 45, 44):
        pass
    for cc, r in ((37, 14), (41, 14), (45, 14), (41, 17)):
        s.at(cc, r, 'S')
    for cc in (9, 19, 29, 38, 48, 57):
        s.at(cc, 43, 'P')
    for cc, r in ((12, 24), (30, 24), (52, 24), (45, 31), (33, 40)):
        s.at(cc, r, 'w')
    # 道具
    s.edge_props(2, 7, 15, 20, sides='ns', pattern='x..x.')
    for cc, r in ((6, 12), (6, 15), (11, 12), (11, 15)):
        s.at(cc, r, 'x')
    s.edge_props(18, 5, 31, 20, sides='w', pattern='xx.')
    s.edge_props(18, 5, 31, 20, sides='s', pattern='x.x..')
    for r in (10, 13, 16):
        s.at(24, r, 'x')
        s.at(25, r, 'x')
    s.edge_props(34, 7, 47, 20, sides='nwe', pattern='xx..')
    s.edge_props(50, 11, 60, 20, sides='nw', pattern='x.x')
    for cc, r in ((71, 19), (71, 29), (70, 22), (70, 26), (76, 21), (76, 27)):
        s.at(cc, r, 'x')
    s.edge_props(2, 28, 13, 34, sides='ns', pattern='x.')
    s.edge_props(16, 28, 27, 34, sides='s', pattern='x..')
    s.edge_props(30, 28, 41, 34, sides='s', pattern='xx..')
    s.edge_props(49, 28, 55, 34, sides='s', pattern='x.')
    s.edge_props(58, 28, 64, 34, sides='s', pattern='xx.')
    s.edge_props(4, 38, 62, 47, sides='s', pattern='xxx......')
    s.edge_props(4, 38, 62, 47, sides='ew', pattern='x.')
    s.room('spine', '龍骨走廊', 'Keel Corridor', 'corridor', (20, 24), '#ff5a4a')
    s.room('engineering', '輪機艙', 'Engineering', 'engine', (8, 17), '#ffb46b', '#ff3b3b')
    s.room('armory', '軍械庫', 'Armory', 'armory', (22, 18), '#d8dde2', '#ff3b3b')
    s.room('quarters', '船員艙', 'Crew Berths', 'quarters', (40, 18), '#ffd9a8', '#ff5a4a')
    s.room('captain', '艦長室', "Captain's Quarters", 'captain', (54, 17), '#ffc89a', '#ff3b3b')
    s.room('bridge', '艦橋', 'Bridge', 'bridge', (72, 24), '#b8c6d4', '#ff3b3b')
    s.room('pods', '救生艙室', 'Escape Pods', 'pods', (8, 31), '#ff9d5c', '#ff3b3b')
    s.room('medbay', '醫務室', 'Medbay', 'medbay', (22, 31), '#eef4ff', '#5cf2a5')
    s.room('dropbay', '降落艙', 'Drop Bay', 'dropbay', (38, 30), '#9fb4c8', '#ff3b3b')
    s.room('lift', '甲板升降道', 'Deck Lift', 'corridor', (45, 33), '#ff5a4a')
    s.room('sickbay', '傷患艙', 'Sickbay', 'medbay', (52, 30), '#eef4ff', '#5cf2a5')
    s.room('quartermaster', '軍需處', 'Quartermaster', 'commissary', (61, 30), '#e2e6ea', '#ff5a4a')
    s.room('flightdeck', '飛行甲板', 'Flight Deck', 'hangar', (33, 45), '#c8d0d8', '#ff3b3b')
    s.expect = {'spawns': 4, 'pads': 6}
    s.finish()
    px, py = space_pos(9336.7, -14374.2)
    meta = f"""
id: 'bravado',
name: {{ zh: '豪勇號', en: 'Bravado' }},
theme: 'bravado',
enable: 'core',
scanTime: 6.68,
podLanding: 'y',
dockable: true,
space: {{
  hp: 300000,
  hpRegen: 100,
  radius: 2.6,
  pos: [{px}, {py}],
  speed: 0.65,
  attack: {{ dmg: [700, 700], cd: 2.5, range: 16, kind: 'projectile', projSpeed: 26, fx: 'stationGun' }},
  abilities: ['st.sweep', 'st.land', 'st.autopilot'],
  pilotable: true,
  model: 'station.bravado',
}},
docked: [
  {{ ship: 'kestrel', pad: 0 }},
  {{ ship: 'kestrel', pad: 1 }},
],
"""
    return s, 'BRAVADO', '豪勇號 Bravado：戰艦（GDD §6.2）。楔形艦艏艦橋、龍骨走廊、保全門（艦長卡可鎖）、降落傳送門、六坪飛行甲板。', meta


# ════════════════════════════════════════════════════════════════
# 火口號 Caldera：採礦工程艦。精煉爐房、礦石輸送帶、狹窄的工程師艙；不可停靠，從出口登艦。
# ════════════════════════════════════════════════════════════════
@station
def caldera():
    s = St('caldera', 56, 44)
    s.poi('c', 'console', 'caldera')
    s.poi('m', 'moduleSocket', data={'module': 'refinedOre,modNeurotoxin'})
    s.poi('h', 'vendor', 'medical')
    s.poi('y', 'vendor', 'escapePod')
    s.poi('g', 'engineerSpawn', solid=False)
    s.poi('w', 'patrol', solid=False)
    # 北
    s.rect(2, 2, 17, 13)
    s.rect(20, 2, 27, 7)
    s.rect(20, 10, 27, 13)
    s.door_ns(22, 2, 7, 10)
    s.rect(30, 2, 41, 13)
    s.win_ew(4, 6, 27, 30)
    # 走廊
    s.rect(2, 16, 41, 18)
    s.door_ns(9, 3, 13, 16)
    s.door_ns(24, 2, 13, 16)
    s.door_ns(35, 2, 13, 16)
    # 南
    s.rect(2, 21, 23, 31)
    s.door_ns(11, 3, 18, 21)
    s.rect(26, 21, 33, 31)
    s.door_ns(29, 2, 18, 21)
    s.rect(36, 21, 41, 31)
    s.door_ns(37, 3, 18, 21)
    # 設施
    s.at(36, 6, 'c')
    s.at(9, 7, 'm')
    s.at(27, 3, 'h')
    s.at(27, 12, 'y')
    s.at(29, 26, 'g')
    s.at(41, 26, 'E')
    s.at(41, 27, 'E')
    for cc, r in ((5, 17), (30, 17), (12, 24), (38, 23)):
        s.at(cc, r, 'w')
    # 道具：熔爐沿北牆、輸送帶兩條
    s.edge_props(2, 2, 17, 13, sides='nw', pattern='xx.')
    s.edge_props(2, 2, 17, 13, sides='e', pattern='x.')
    for cc in range(5, 21):
        s.at(cc, 25, 'x')
        if cc < 19:
            s.at(cc, 28, 'x')
    s.edge_props(2, 21, 23, 31, sides='s', pattern='x..')
    s.edge_props(26, 21, 33, 31, sides='ew', pattern='xx.')
    s.edge_props(20, 2, 27, 7, sides='n', pattern='x.')
    s.edge_props(30, 2, 41, 13, sides='ne', pattern='x..')
    s.at(33, 9, 'x')
    s.at(39, 9, 'x')
    s.edge_props(36, 21, 41, 31, sides='w', pattern='x..')
    s.room('refinery', '精煉爐房', 'Refinery', 'furnace', (9, 11), '#ffb070', '#ff7a1a')
    s.room('medbay', '醫療角', 'Med Nook', 'medbay', (23, 5), '#f2f6ff', '#5cf2a5')
    s.room('pods', '救生艙室', 'Escape Pods', 'pods', (23, 12), '#ffb46b', '#ff3b3b')
    s.room('bridge', '駕駛艙', 'Bridge', 'bridge', (36, 10), '#ffe08a', '#7fd8ff')
    s.room('corridor', '工程走廊', 'Service Corridor', 'corridor', (20, 17), '#ffc23d')
    s.room('conveyor', '輸送帶艙', 'Conveyor Bay', 'conveyor', (12, 22), '#ffd23d', '#ff8a2a')
    s.room('quarters', '工程師艙', 'Engineer Bunks', 'quarters', (29, 23), '#ffd9a8', '#ffc23d')
    s.room('airlock', '登艦氣閘', 'Boarding Airlock', 'airlock', (38, 29), '#e8f0f6', '#ffc23d')
    s.expect = {'spawns': 0, 'pads': 0}
    s.finish()
    px, py = space_pos(14243.8, -11157.7)
    meta = f"""
id: 'caldera',
name: {{ zh: '火口號', en: 'Caldera' }},
theme: 'caldera',
enable: 'auto',
scanTime: 0.3,
podLanding: 'y',
dockable: false,
space: {{
  hp: 130000,
  hpRegen: 70,
  radius: 1.3,
  pos: [{px}, {py}],
  speed: 0.7,
  attack: {{ dmg: [185, 185], cd: 0.5, range: 9, kind: 'hitscan', fx: 'lightning' }},
  abilities: ['st.sweep', 'st.repair', 'st.cordon'],
  pilotable: true,
  model: 'station.caldera',
}},
docked: [],
"""
    return s, 'CALDERA', '火口號 Caldera：採礦工程艦（GDD §6.2）。精煉爐房、礦石輸送帶、工程師艙；不可停靠，從出口登艦。', meta


# ════════════════════════════════════════════════════════════════
# 活體庫號 Vivarium：標本收容站。北側停機坪，U 形觀察走廊夾著兩列共 6 間玻璃隔間，中央收容控制室。
# ════════════════════════════════════════════════════════════════
@station
def vivarium():
    s = St('vivarium', 76, 64)
    s.poi('c', 'cellConsole')
    s.poi('g', 'cageConsole')
    s.poi('q', 'cagePad', solid=False)
    s.poi('n', 'vendor', 'maintenanceB')
    s.poi('o', 'vendor', 'outpost')
    s.poi('h', 'vendor', 'medical')
    s.poi('y', 'vendor', 'escapePod')
    s.poi('w', 'patrol', solid=False)
    for i in range(1, 7):
        s.poi(str(i), f'specimen{i}', solid=False)
    # 停機坪
    s.rect(10, 2, 54, 14)
    # U 形走廊
    s.rect(17, 17, 19, 51)
    s.rect(45, 17, 47, 51)
    s.rect(17, 49, 47, 51)
    s.door_ns(17, 3, 14, 17)
    s.door_ns(45, 3, 14, 17)
    s.bulkhead([(cc, 48) for cc in range(17, 20)])
    s.bulkhead([(cc, 48) for cc in range(45, 48)])
    # 中央：控制室、補給、救生艙
    s.rect(22, 17, 42, 29)
    s.door_ns(31, 3, 14, 17)
    s.door_ew(22, 2, 19, 22)
    s.door_ew(22, 2, 42, 45)
    s.win_ew(18, 20, 19, 22)
    s.win_ew(25, 27, 19, 22)
    s.win_ew(18, 20, 42, 45)
    s.win_ew(25, 27, 42, 45)
    s.rect(22, 32, 42, 39)
    s.door_ew(35, 2, 19, 22)
    s.door_ew(35, 2, 42, 45)
    s.rect(22, 42, 42, 46)
    s.door_ns(31, 2, 46, 49)
    # 隔間：西 1–3（上到下）、東 4–6（下到上，與原作同為 U 形編號）
    cells = []
    for k, (r0, r1) in enumerate(((17, 25), (28, 36), (39, 47))):
        cells.append((k + 1, 3, r0, 14, r1, 'w'))
        cells.append((6 - k, 50, r0, 61, r1, 'e'))
    lock = '{ locked: true }'
    for n, c0, r0, c1, r1, side in cells:
        s.rect(c0, r0, c1, r1)
        if side == 'w':
            s.win_ew(r0 + 1, r0 + 3, c1, 17)
            s.door_ew(r0 + 5, 2, c1, 17, lock)
        else:
            s.win_ew(r0 + 1, r0 + 3, 47, c0)
            s.door_ew(r0 + 5, 2, 47, c0, lock)
        s.at((c0 + c1) // 2, (r0 + r1) // 2, str(n))
    # 設施
    s.at(28, 18, 'c')
    s.at(36, 18, 'g')
    for r in range(23, 26):
        for cc in range(31, 34):
            s.at(cc, r, 'q')
    s.at(25, 32, 'n')
    s.at(32, 32, 'o')
    s.at(39, 32, 'h')
    s.at(40, 44, 'y')
    for cc, r in ((17, 6), (32, 6), (47, 6), (17, 12), (32, 12), (47, 12)):
        s.at(cc, r, 'P')
    for cc, r in ((18, 30), (46, 30), (32, 50), (32, 9)):
        s.at(cc, r, 'w')
    # 道具
    s.edge_props(10, 2, 54, 14, sides='ew', pattern='x..')
    s.edge_props(10, 2, 54, 14, sides='n', pattern='xx.......')
    for cc, r in ((24, 22), (24, 26), (40, 22), (40, 26), (27, 28), (37, 28)):
        s.at(cc, r, 'x')
    s.edge_props(22, 32, 42, 39, sides='s', pattern='xx..')
    for cc in (27, 28, 36, 37):
        s.at(cc, 36, 'x')
    s.edge_props(22, 42, 42, 46, sides='new', pattern='x.')
    for n, c0, r0, c1, r1, side in cells:
        if side == 'w':
            s.edge_props(c0, r0, c1, r1, sides='nsw', pattern=['x..x.', '.x.xx', 'x.x..'][n % 3], skip_door=2)
        else:
            s.edge_props(c0, r0, c1, r1, sides='nse', pattern=['x..x.', '.x.xx', 'x.x..'][n % 3], skip_door=2)
    s.room('hangar', '停機坪', 'Hangar', 'hangar', (25, 9), '#d4f0dc', '#ffc23d')
    s.room('galleryW', '西觀察廊', 'West Gallery', 'corridor', (18, 40), '#7dffb0')
    s.room('galleryE', '東觀察廊', 'East Gallery', 'corridor', (46, 40), '#7dffb0')
    s.room('galleryS', '南走廊', 'South Passage', 'corridor', (25, 50), '#7dffb0')
    s.room('control', '收容控制室', 'Containment Control', 'lab', (32, 21), '#9fffd0', '#33ffd1')
    s.room('commissary', '補給區', 'Commissary', 'commissary', (32, 35), '#e0fff0', '#ffb46b')
    s.room('pods', '救生艙室', 'Escape Pods', 'pods', (26, 44), '#ffb46b', '#ff3b3b')
    names = {1: ('吼顎獸隔間', 'Murmaw Pen'), 2: ('異常體隔間', 'Anomaly Pen'), 3: ('地球動物隔間', 'Earth Fauna Pen'),
             4: ('蛞蝓仔隔間', 'Slugling Pen'), 5: ('竄蟲隔間', 'Skitter Pen'), 6: ('失敗實驗體隔間', 'Failed Experiment Pen')}
    lights = {1: '#6dff8a', 2: '#7dffd8', 3: '#c8ff7a', 4: '#5cf2a5', 5: '#8aff6a', 6: '#b6ff3a'}
    for n, c0, r0, c1, r1, side in sorted(cells):
        s.room(f'cell{n}', names[n][0], names[n][1], 'cell', ((c0 + c1) // 2, (r0 + r1) // 2 + 2), lights[n], '#33ffd1')
    s.expect = {'spawns': 0, 'pads': 6}
    s.finish()
    px, py = space_pos(13467.5, -14562.4)
    meta = f"""
id: 'vivarium',
name: {{ zh: '活體庫號', en: 'Vivarium' }},
theme: 'vivarium',
enable: 'auto',
scanTime: 2.44,
podLanding: 'y',
dockable: true,
space: {{
  hp: 220000,
  hpRegen: 0,
  radius: 2.2,
  pos: [{px}, {py}],
  speed: 0,
  // 沒有太空控制台，永遠中立
  attack: {{ dmg: [185, 185], cd: 0.5, range: 9, kind: 'projectile', projSpeed: 30, fx: 'stationGun' }},
  abilities: [],
  pilotable: false,
  model: 'station.vivarium',
}},
docked: [],
"""
    return s, 'VIVARIUM', '活體庫號 Vivarium：標本收容站（GDD §6.2）。U 形觀察走廊夾著 6 間玻璃隔間（開局上鎖），中央收容控制室與籠子平台。', meta


# ════════════════════════════════════════════════════════════════
# 擺渡號 Portage：人員轉運站。八角傳送大廳、隔窗控制室、候車室、登艦氣閘。
# ════════════════════════════════════════════════════════════════
@station
def portage():
    s = St('portage', 56, 44)
    s.poi('c', 'console', 'portage')
    s.poi('t', 'teleportPad', solid=False)
    s.poi('l', 'podLanding', solid=False)
    s.poi('w', 'patrol', solid=False)
    s.octa(2, 2, 20, 16, 5)
    s.rect(23, 4, 33, 14)
    s.door_ew(8, 2, 20, 23)
    s.win_ew(7, 7, 20, 23)
    s.win_ew(10, 11, 20, 23)
    s.rect(36, 4, 41, 14)
    s.door_ew(8, 2, 33, 36)
    s.rect(2, 19, 41, 21)
    s.door_ns(10, 3, 16, 19)
    s.door_ns(27, 2, 14, 19)
    s.door_ns(38, 2, 14, 19)
    s.rect(2, 24, 26, 32)
    s.door_ns(12, 3, 21, 24)
    s.rect(29, 24, 41, 32)
    s.door_ns(34, 3, 21, 24)
    for r in range(8, 11):
        for cc in range(10, 13):
            s.at(cc, r, 't')
    s.at(28, 6, 'c')
    s.at(41, 28, 'E')
    s.at(41, 29, 'E')
    s.at(14, 30, 'l')
    for cc, r in ((6, 20), (22, 20), (36, 20), (11, 13)):
        s.at(cc, r, 'w')
    # 傳送台周圍的導能柱
    for cc, r in ((7, 5), (15, 5), (7, 13), (15, 13), (5, 9), (17, 9)):
        s.at(cc, r, 'x')
    for cc, r in ((25, 9), (31, 9), (26, 12), (30, 12)):
        s.at(cc, r, 'x')
    s.edge_props(36, 4, 41, 14, sides='ne', pattern='xx.')
    # 候車座位：兩排長椅
    for r in (26, 29):
        for cc in list(range(5, 11)) + list(range(15, 22)):
            s.at(cc, r, 'x')
    s.edge_props(2, 24, 26, 32, sides='s', pattern='x...')
    s.edge_props(29, 24, 41, 32, sides='ns', pattern='x..')
    s.room('portal', '傳送大廳', 'Transit Hall', 'teleport', (11, 4), '#6fb8ff', '#9fe7ff')
    s.room('control', '調度室', 'Dispatch Control', 'bridge', (28, 11), '#8fc8ff', '#ffb46b')
    s.room('office', '站務室', 'Station Office', 'quarters', (38, 10), '#ffd9a8', '#6fb8ff')
    s.room('concourse', '中央大道', 'Concourse', 'corridor', (30, 20), '#9fd0ff')
    s.room('lounge', '候車室', 'Waiting Lounge', 'lounge', (12, 31), '#ffe2b8', '#6fb8ff')
    s.room('airlock', '登艦氣閘', 'Boarding Airlock', 'airlock', (34, 27), '#e8f0f6', '#6fb8ff')
    s.expect = {'spawns': 0, 'pads': 0, 'poi': {'t': 9}}
    s.finish()
    px, py = space_pos(11449.9, -15084.1)
    meta = f"""
id: 'portage',
name: {{ zh: '擺渡號', en: 'Portage' }},
theme: 'portage',
enable: 'auto',
scanTime: 0.31,
podLanding: 'l',
dockable: false,
space: {{
  hp: 180000,
  hpRegen: 0,
  radius: 2.2,
  pos: [{px}, {py}],
  speed: 0,
  attack: {{ dmg: [51, 51], cd: 0.2, range: 16, kind: 'projectile', projSpeed: 30, fx: 'stationGun' }},
  abilities: ['st.sweep', 'st.portTarget', 'st.portActivate'],
  pilotable: true,
  model: 'station.portage',
}},
docked: [],
"""
    return s, 'PORTAGE', '擺渡號 Portage：人員轉運站（GDD §6.2）。八角傳送大廳（9 格傳送台）、隔窗調度室、候車室；不可停靠，從出口登艦。', meta


def outdoor_rock_noise(s, seed, n, c0, r0, c1, r1, rmin=1.2, rmax=3.0, keep=()):
    """在室外地面上撒岩丘（牆）"""
    rnd = random.Random(seed)
    for _ in range(n):
        cx = rnd.uniform(c0, c1)
        cy = rnd.uniform(r0, r1)
        if any(abs(cx - kx) < kr and abs(cy - ky) < kr for kx, ky, kr in keep):
            continue
        rx = rnd.uniform(rmin, rmax)
        s.blob(cx, cy, rx, rx * rnd.uniform(0.6, 1.2), rnd.randint(0, 9999), 0.3, '#', only='.')


# ════════════════════════════════════════════════════════════════
# 翠原星 Verdance：地形改造中的行星地表。岩壁圍出的異星草原，西北軍事基地、中南前哨商店群、東側雷達丘。
# ════════════════════════════════════════════════════════════════
@station
def verdance():
    s = St('verdance', 100, 70)
    s.poi('r', 'vendor', 'radar')
    s.poi('h', 'vendor', 'medical')
    s.poi('a', 'vendor', 'suitA')
    s.poi('b', 'vendor', 'suitB')
    s.poi('d', 'vendor', 'suitD')
    s.poi('z', 'vendor', 'fusion')
    s.poi('n', 'vendor', 'maintenance')
    s.poi('L', 'landingSite', solid=False)
    s.poi('T', 'landingPortal', solid=False)
    s.poi('p', 'penguinStatue')
    s.poi('s', 'slugSpawn', solid=False)
    s.poi('f', 'freakSpawn', solid=False)
    s.poi('k', 'foxSpawn', solid=False)
    s.poi('q', 'anomalySpawn', solid=False)
    s.poi('e', 'elderSpawn', solid=False)
    s.poi('l', 'podLanding', solid=False)
    s.poi('j', 'rummageBox')
    # 草原：幾個大塊不規則地形拼起來
    s.blob(50, 38, 46, 30, 3, 0.12)
    s.blob(20, 50, 18, 16, 4, 0.2)
    s.blob(80, 50, 18, 16, 5, 0.2)
    s.blob(78, 18, 18, 14, 6, 0.2)
    s.blob(30, 22, 26, 16, 7, 0.15)
    for r in range(70):
        for cc in range(100):
            if r < 3 or r > 66 or cc < 3 or cc > 96:
                s.c.put(cc, r, '#')
    # 岩脊：切出幾條動線與遮蔽
    for cx, cy, rx, ry, sd in ((33, 34, 4.5, 2.2, 1), (40, 31, 3, 2, 2), (63, 25, 3.5, 5, 3), (66, 37, 2.5, 3, 4),
                               (14, 30, 3, 2.5, 5), (80, 44, 4, 2.2, 6), (86, 41, 2.6, 2, 7), (28, 60, 3.5, 2, 8),
                               (8, 40, 2, 3, 9), (54, 64, 3, 1.5, 10), (91, 55, 2.5, 4, 11), (73, 33, 2, 2, 12)):
        s.blob(cx, cy, rx, ry, sd, 0.35, '#', only='.')
    keep = [(26, 12, 23), (49, 53, 16), (83, 19, 13), (22, 43, 7), (55, 30, 4)]
    outdoor_rock_noise(s, 21, 40, 6, 22, 94, 64, 0.8, 1.8, keep=keep)
    # 軍事基地（西北）：8 坪停機坪＋營舍
    s.rect(4, 3, 47, 21, '#')
    s.rect(6, 4, 32, 19)
    s.rect(35, 6, 45, 19)
    # 前哨商店群（中南）＋清潔工門後的補給掩體
    s.rect(36, 46, 62, 61, '#')
    s.rect(38, 48, 60, 59)
    s.rect(63, 48, 72, 58, '#')
    s.rect(65, 50, 70, 56)
    # 雷達丘（東）
    s.octa(73, 9, 93, 29, 6, '#')
    s.octa(75, 11, 91, 27, 6)
    # 門
    s.door_ns(17, 4, 19, 22)
    s.door_ew(10, 3, 32, 35)
    s.door_ns(39, 3, 19, 22)
    s.door_ns(48, 4, 45, 48)
    s.door_ew(53, 3, 35, 38)
    s.door_ew(52, 3, 60, 65, "{ clearance: 'janitor' }")
    s.door_ew(18, 4, 72, 75)
    # 停機坪 8（4×2）
    for cc in (10, 17, 24, 30):
        for r in (8, 15):
            s.at(cc, r, 'P')
    s.at(40, 11, 'S')
    s.at(83, 19, 'r')
    s.at(38, 51, 'h')
    s.at(42, 48, 'a')
    s.at(45, 48, 'b')
    s.at(48, 48, 'd')
    s.at(60, 50, 'z')
    s.at(60, 56, 'n')
    s.at(70, 53, 'j')
    s.at(22, 43, 'L')
    s.at(27, 40, 'T')
    s.at(88, 33, 'p')
    s.at(67, 43, 'l')
    s.at(87, 60, 'f')
    s.at(74, 62, 'k')
    s.at(12, 60, 'q')
    s.at(55, 30, 'e')
    rnd = random.Random(77)
    placed = 0
    while placed < 24:
        cc = rnd.randint(6, 94)
        r = rnd.randint(23, 64)
        if s.c.get(cc, r) == '.' and not s.near(cc, r, 'sLTDplfkqe#', 2) and not (16 <= cc <= 28 and 37 <= r <= 49) \
                and not (35 <= cc <= 73 and 45 <= r <= 62) and not (72 <= cc <= 94 and 8 <= r <= 30):
            s.c.put(cc, r, 's')
            placed += 1
    # 草原上的異星灌木／岩塊（x），降落場周圍留空
    s.scatter(6, 23, 94, 65, 80, 31, clear=2)
    for cc in range(16, 29):
        for r in range(37, 50):
            if s.c.get(cc, r) == 'x':
                s.c.put(cc, r, '.')
    for a in range(10):
        ang = a / 10 * math.tau
        s.at(round(83 + math.cos(ang) * 6), round(19 + math.sin(ang) * 6), 'x')
    s.edge_props(6, 4, 32, 19, sides='n', pattern='xx....')
    s.edge_props(35, 6, 45, 19, sides='nse', pattern='x.x..')
    s.edge_props(38, 48, 60, 59, sides='s', pattern='xx..')
    s.edge_props(65, 50, 70, 56, sides='ns', pattern='xx.')
    for cc, r in ((19, 12), (20, 12), (27, 12), (28, 12)):
        s.at(cc, r, 'x')
    s.room('meadow', '異星草原', 'Alien Meadow', 'grass', (60, 40), '#5e5680', '#9fe7ff')
    s.room('base', '軍事基地停機場', 'Base Airfield', 'base', (12, 12), '#686678', '#ffc23d')
    s.room('barracks', '營舍', 'Barracks', 'quarters', (40, 15), '#806a50', '#c9b8ff')
    s.room('outpost', '前哨商店群', 'Outpost Bazaar', 'outpost', (49, 54), '#7a7262', '#c9b8ff')
    s.room('bunker', '補給掩體', 'Supply Bunker', 'closet', (67, 54), '#7a5434', '#ffb46b')
    s.room('radar', '雷達丘', 'Radar Hill', 'radar', (83, 24), '#545c7c', '#ffc23d')
    s.expect = {'spawns': 1, 'pads': 8, 'poi': {'s': 24}}
    s.finish(trim=0)
    meta = """
id: 'verdance',
name: { zh: '翠原星', en: 'Verdance' },
theme: 'verdance',
enable: 'core',
scanTime: 5.0,
podLanding: 'l',
dockable: true,
weather: 'rain',
outdoor: true,
space: {
  hp: 999999,
  hpRegen: 9999,
  radius: 3.5,
  pos: [-13.0, -5.0],
  speed: 0,
  // 不受控（中立），數值照原作保留
  attack: { dmg: [125, 125], cd: 0.4, range: 24, kind: 'projectile', projSpeed: 30, fx: 'stationGun' },
  abilities: [],
  pilotable: false,
  model: 'station.verdance',
  orbit: { around: 'center', radius: 23, degPerSec: 0.25 },
},
docked: [{ ship: 'harrier', pad: 0 }],
"""
    return s, 'VERDANCE', '翠原星 Verdance：地形改造中的行星地表（GDD §6.2），室外、下雨。岩壁圍出的異星草原、軍事基地停機場、前哨商店群、雷達丘。', meta


# ════════════════════════════════════════════════════════════════
# 餘燼衛星 Cinder：低重力岩石衛星。碎石原、模組工廠、重力坑（重力控制裝置）。
# ════════════════════════════════════════════════════════════════
@station
def cinder():
    s = St('cinder', 62, 47)
    s.poi('f', 'moduleFactory')
    s.poi('o', 'moduleOut', solid=False)
    s.poi('g', 'vendor', 'gravity')
    s.poi('l', 'podLanding', solid=False)
    s.blob(31, 23, 28, 20, 41, 0.12)
    s.blob(14, 34, 11, 9, 42, 0.2)
    for r in range(47):
        for cc in range(62):
            if r < 2 or r > 44 or cc < 2 or cc > 59:
                s.c.put(cc, r, '#')
    # 模組工廠（西北，建物）
    s.rect(3, 3, 22, 16, '#')
    s.rect(5, 5, 20, 14)
    # 重力坑（東）
    s.disk(42, 25, 11, '#')
    s.disk(42, 25, 9)
    keep = [(13, 10, 12), (42, 25, 13), (15, 35, 9), (28, 25, 4)]
    outdoor_rock_noise(s, 51, 16, 4, 4, 58, 43, 1.0, 2.4, keep=keep)
    s.door_ns(11, 3, 14, 17)
    s.door_ew(9, 3, 20, 23)
    s.door_ew(24, 3, 30, 34)
    s.door_ns(41, 3, 13, 17)
    s.at(11, 7, 'f')
    s.at(17, 7, 'o')
    s.at(18, 7, 'o')
    s.at(42, 25, 'g')
    s.at(26, 34, 'l')
    for cc, r in ((10, 30), (18, 30), (11, 36), (19, 36)):
        s.at(cc, r, 'P')
    # 重力坑四周的環形導光柱、工廠輸送帶
    for a in range(12):
        ang = a / 12 * math.tau + 0.13
        s.at(round(42 + math.cos(ang) * 6.5), round(25 + math.sin(ang) * 6.5), 'x')
    for cc in range(13, 17):
        s.at(cc, 7, 'x')
    s.edge_props(5, 5, 20, 14, sides='nw', pattern='x.x..')
    s.edge_props(5, 5, 20, 14, sides='s', pattern='xx...')
    s.scatter(4, 4, 58, 43, 40, 52, clear=2)
    s.room('surface', '碎石原', 'Rubble Plain', 'rock', (28, 22), '#585a64', '#ff9a4a')
    s.room('factory', '模組工廠', 'Module Works', 'factory', (12, 12), '#7a6850', '#7fd8ff')
    s.room('crater', '重力坑', 'Gravity Crater', 'crater', (42, 30), '#3e6274', '#b28cff')
    s.expect = {'spawns': 0, 'pads': 4}
    s.finish(trim=0)
    meta = """
id: 'cinder',
name: { zh: '餘燼衛星', en: 'Cinder' },
theme: 'cinder',
enable: 'core',
scanTime: 0.88,
podLanding: 'l',
dockable: true,
outdoor: true,
space: {
  hp: 100000,
  hpRegen: 0,
  radius: 1.5,
  pos: [-6.1, 11.8],
  speed: 0,
  attack: { dmg: [125, 125], cd: 0.4, range: 24, kind: 'projectile', projSpeed: 30, fx: 'stationGun' },
  abilities: [],
  pilotable: false,
  model: 'station.cinder',
  orbit: { around: 'verdance', radius: 8, degPerSec: 1.5 },
},
docked: [],
"""
    return s, 'CINDER', '餘燼衛星 Cinder：繞翠原星公轉的低重力岩石衛星（GDD §6.2），室外。碎石原、模組工廠、重力坑。', meta


# ════════════════════════════════════════════════════════════════
# 未識別物體 Unidentified Object：蟲洞事件才出現。有機曲面的腔室、殉職研究員、看不見的東西。
# ════════════════════════════════════════════════════════════════
@station
def uo():
    s = St('uo', 52, 42)
    s.poi('k', 'codePanel', facing='-Math.PI / 2')
    s.poi('d', 'deadScientist', solid=False)
    s.poi('e', 'entitySpawn', solid=False)
    s.blob(11, 25, 9, 7, 61, 0.12)
    s.blob(33, 13, 10, 8, 62, 0.18)
    s.blob(38, 31, 5, 3.5, 63, 0.12)
    s.blob(12, 8, 6, 4, 64, 0.2)
    # 腔室之間的「喉管」與門
    s.rect(21, 16, 22, 25, '#')
    s.rect(17, 19, 20, 22)
    s.rect(23, 19, 25, 22)
    s.door_ew(20, 2, 20, 23)
    s.rect(35, 24, 37, 26, '#')
    s.rect(35, 20, 37, 23)
    s.rect(35, 27, 37, 29)
    s.door_ns(35, 2, 23, 27)
    s.rect(10, 13, 13, 16, '#')
    s.rect(10, 11, 12, 12)
    s.rect(10, 17, 12, 19)
    s.door_ns(10, 2, 12, 17)
    s.at(7, 25, 'P')
    s.at(15, 26, 'P')
    s.at(39, 28, 'k')
    for cc, r in ((4, 21), (12, 30), (18, 24), (28, 9), (36, 8), (39, 16), (30, 18), (9, 6), (15, 9)):
        s.at(cc, r, 'd')
    for cc, r in ((27, 13), (38, 12), (13, 7), (5, 28)):
        s.at(cc, r, 'e')
    s.scatter(2, 2, 49, 39, 26, 65, clear=1)
    for cc, r in ((36, 30), (41, 29), (35, 33)):
        s.at(cc, r, 'x')
    s.room('maw', '入口腔', 'Maw', 'alien', (11, 22), '#8a5cff', '#6dff9a')
    s.room('hollow', '主腔', 'Hollow', 'alien', (33, 12), '#7a3cff', '#9dff5c')
    s.room('rift', '裂隙', 'Rift', 'alien', (11, 7), '#6dff9a', '#7a3cff')
    s.room('code', '啟用碼室', 'Glyph Chamber', 'code', (37, 31), '#b6ff6a', '#b28cff')
    s.expect = {'spawns': 0, 'pads': 2, 'poi': {'d': 9, 'e': 4}}
    s.finish()
    px, py = space_pos(15920, -7888)
    meta = f"""
id: 'uo',
name: {{ zh: '未識別物體', en: 'Unidentified Object' }},
theme: 'uo',
enable: 'event',
scanTime: 0.16,
dockable: true,
space: {{
  hp: 999999,
  hpRegen: 0,
  radius: 1.2,
  pos: [{px}, {py}],
  speed: 0,
  attack: {{ dmg: [1, 1], cd: 0.4, range: 24, kind: 'projectile', projSpeed: 30, fx: 'stationGun' }},
  abilities: [],
  pilotable: false,
  model: 'station.uo',
}},
docked: [],
"""
    return s, 'UO', '未識別物體 Unidentified Object：蟲洞事件才出現（GDD §6.2）。有機曲面的腔室、殉職研究員、看不見的危害、啟用碼室。', meta


# ════════════════════════════════════════════════════════════════
# 黑鷗號 Black Gull：海盜船（事件）。四坪機庫、船員艙、楔形艦橋、貨艙、禁閉室、引擎艙。
# ════════════════════════════════════════════════════════════════
@station
def pirate():
    s = St('pirate', 60, 40)
    s.poi('c', 'console', 'pirate')
    s.poi('k', 'pirateCaptain', solid=False)
    s.poi('p', 'pirateSpawn', solid=False)
    s.poi('t', 'sentrySpawn', solid=False)
    s.poi('j', 'rummageBox')
    s.rect(2, 2, 21, 16)
    s.rect(24, 4, 33, 16)
    for r in range(4, 17):
        s.rect(36, r, 46 - abs(r - 10) // 2, r)
    s.rect(2, 19, 44, 21)
    s.rect(2, 24, 15, 30)
    s.rect(18, 24, 29, 30)
    s.rect(32, 24, 42, 30)
    s.door_ns(10, 3, 16, 19)
    s.door_ns(28, 2, 16, 19)
    s.door_ns(38, 2, 16, 19)
    s.door_ew(9, 2, 21, 24)
    s.door_ns(8, 2, 21, 24)
    s.door_ns(23, 2, 21, 24)
    s.door_ns(37, 2, 21, 24)
    for cc, r in ((7, 6), (16, 6), (7, 12), (16, 12)):
        s.at(cc, r, 'P')
    s.at(42, 10, 'c')
    s.at(40, 13, 'k')
    for cc, r in ((27, 8), (31, 12), (24, 27)):
        s.at(cc, r, 'p')
    for cc, r in ((12, 20), (33, 20), (21, 9)):
        s.at(cc, r, 't')
    s.at(4, 26, 'j')
    s.at(12, 29, 'j')
    s.edge_props(2, 2, 21, 16, sides='nw', pattern='xx..')
    s.edge_props(24, 4, 33, 16, sides='new', pattern='x.x.')
    for cc, r in ((39, 7), (39, 13), (44, 10)):
        s.at(cc, r, 'x')
    s.edge_props(2, 24, 15, 30, sides='sw', pattern='xx.')
    for cc, r in ((7, 26), (8, 26), (7, 28), (8, 28)):
        s.at(cc, r, 'x')
    s.edge_props(18, 24, 29, 30, sides='se', pattern='x.')
    s.edge_props(32, 24, 42, 30, sides='nse', pattern='xx.')
    s.at(36, 27, 'x')
    s.at(37, 27, 'x')
    s.room('hangar', '機庫', 'Hangar', 'hangar', (11, 4), '#ff8a6a', '#ffc23d')
    s.room('crew', '船員艙', 'Crew Deck', 'quarters', (28, 14), '#ffa070', '#ff3b3b')
    s.room('bridge', '艦橋', 'Bridge', 'bridge', (38, 10), '#ff6a5a', '#ffb000')
    s.room('corridor', '通道', 'Gangway', 'corridor', (25, 20), '#ff5a4a')
    s.room('hold', '貨艙', 'Cargo Hold', 'cargo', (10, 25), '#ff9a6a', '#ffc23d')
    s.room('brig', '禁閉室', 'Brig', 'brig', (22, 29), '#ff4a4a', '#ffb000')
    s.room('engine', '引擎艙', 'Engine Room', 'engine', (35, 29), '#ff7a3a', '#ff3b3b')
    s.expect = {'spawns': 0, 'pads': 4, 'poi': {'p': 3, 't': 3, 'j': 2, 'k': 1}}
    s.finish()
    px, py = space_pos(12000, -11824)
    meta = f"""
id: 'pirate',
name: {{ zh: '黑鷗號', en: 'Black Gull' }},
theme: 'pirate',
enable: 'event',
scanTime: 0.22,
dockable: true,
space: {{
  hp: 300000,
  hpRegen: 0,
  radius: 1.4,
  // 事件時隨機出現在海盜生成區；這裡是生成區中心
  pos: [{px}, {py}],
  speed: 1.4,
  attack: {{ dmg: [360, 360], cd: 2.5, range: 13, kind: 'projectile', projSpeed: 26, fx: 'stationGun' }},
  abilities: ['st.sweep'],
  pilotable: true,
  model: 'station.pirate',
}},
docked: [],
"""
    return s, 'PIRATE', '黑鷗號 Black Gull：海盜船（事件，GDD §7.8）。四坪機庫、船員艙、楔形艦橋、貨艙（兩個補給箱）、禁閉室、引擎艙。', meta

def main(argv):
    only = [a for a in argv if not a.startswith('-')]
    write = '--print' not in argv
    for name, fn in STATIONS.items():
        if only and name not in only:
            continue
        s, const, header, meta = fn()
        print(s.ascii())
        print(s.stats())
        if write:
            path = os.path.join(OUT, f'{s.id}.ts')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(s.emit(const, header, meta))
            print('寫入', os.path.relpath(path))


if __name__ == '__main__':
    main(sys.argv[1:])
