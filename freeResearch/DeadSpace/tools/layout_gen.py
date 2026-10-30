"""站體 ASCII 版面產生小工具：用矩形挖房間、開門、放設施，輸出可貼進 TS 的 rows 陣列。

用法：在腳本裡 import 後呼叫 Canvas 的方法，最後 print(c.ts())。
座標都是 (col, row)，row 0 在最上方；rect 是含兩端的地板範圍。
"""


class Canvas:
    def __init__(self, w, h, fill=' '):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]

    def put(self, c, r, ch):
        if 0 <= c < self.w and 0 <= r < self.h:
            self.g[r][c] = ch

    def get(self, c, r):
        if 0 <= c < self.w and 0 <= r < self.h:
            return self.g[r][c]
        return ' '

    def rect(self, c0, r0, c1, r1, ch):
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                self.put(c, r, ch)

    def room(self, c0, r0, c1, r1, floor='.'):
        """挖出地板並在外圍（若是太空）補上牆"""
        for r in range(r0 - 1, r1 + 2):
            for c in range(c0 - 1, c1 + 2):
                if self.get(c, r) == ' ':
                    self.put(c, r, '#')
        self.rect(c0, r0, c1, r1, floor)

    def hdoor(self, c, r, width=2):
        """門板沿 x（通道南北向）"""
        for i in range(width):
            self.put(c + i, r, 'D')

    def vdoor(self, c, r, width=2):
        for i in range(width):
            self.put(c, r + i, 'D')

    def hull(self, c0, r0, c1, r1):
        """先把整個船體範圍填滿牆，再用 room() 挖房間"""
        self.rect(c0, r0, c1, r1, '#')

    def trim(self, thick=2):
        """把離地板超過 thick 格的牆改回太空，讓外型貼合房間"""
        open_ = {(c, r) for r in range(self.h) for c in range(self.w) if self.g[r][c] not in '# '}
        for r in range(self.h):
            for c in range(self.w):
                if self.g[r][c] != '#':
                    continue
                near = any((c + dc, r + dr) in open_ for dr in range(-thick, thick + 1) for dc in range(-thick, thick + 1))
                if not near:
                    self.g[r][c] = ' '

    def door_ns(self, c, width, r_above, r_below, ch='D'):
        """南北向通道穿過牆：r_above = 上方房間最後一列地板，r_below = 下方房間第一列地板。
        牆中間那列放門，其餘牆列改成地板。"""
        wall_rows = list(range(r_above + 1, r_below))
        mid = wall_rows[(len(wall_rows) - 1) // 2]
        for r in wall_rows:
            for i in range(width):
                self.put(c + i, r, ch if r == mid else '.')

    def door_ew(self, r, width, c_left, c_right, ch='D'):
        wall_cols = list(range(c_left + 1, c_right))
        mid = wall_cols[(len(wall_cols) - 1) // 2]
        for cc in wall_cols:
            for i in range(width):
                self.put(cc, r + i, ch if cc == mid else '.')

    def window_ns(self, c0, c1, r_above, r_below):
        for r in range(r_above + 1, r_below):
            for cc in range(c0, c1 + 1):
                self.put(cc, r, '=')

    def rows(self):
        return [''.join(row).rstrip() for row in self.g]

    def ts(self, indent='    '):
        return '\n'.join(f"{indent}'{row}'," for row in self.rows())

    def check(self):
        for r, row in enumerate(self.g):
            for c, ch in enumerate(row):
                if ch == '.':
                    for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if self.get(c + dc, r + dr) == ' ':
                            raise ValueError(f'地板 {c},{r} 鄰接太空，缺牆')
