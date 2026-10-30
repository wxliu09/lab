import struct, re, sys, json
def load_wts(path):
    s = open(path,'rb').read().decode('utf-8','replace')
    return {int(m.group(1)): m.group(2) for m in re.finditer(r'STRING (\d+)\s*(?://[^\n]*\n)?\s*\{\r?\n(.*?)\r?\n\}', s, re.S)}
def parse(path, leveled, wts):
    d = open(path,'rb').read(); p = 0
    def i32():
        nonlocal p; v = struct.unpack_from('<i', d, p)[0]; p += 4; return v
    def f32():
        nonlocal p; v = struct.unpack_from('<f', d, p)[0]; p += 4; return v
    def cc():
        nonlocal p; v = d[p:p+4]; p += 4; return v.decode('latin-1')
    def cstr():
        nonlocal p; e = d.index(b'\0', p); v = d[p:e].decode('utf-8','replace'); p = e+1; return v
    ver = i32(); res = {'orig':[], 'custom':[]}
    for tbl in ('orig','custom'):
        n = i32()
        for _ in range(n):
            oid, nid = cc(), cc()
            sets = 1
            if ver >= 3: sets = i32()
            mods = {}
            for _s in range(sets):
                if ver >= 3: i32()
                mc = i32()
                for _m in range(mc):
                    mid = cc(); t = i32(); lvl = 0
                    if leveled: lvl = i32(); i32()
                    if t == 0: v = i32()
                    elif t in (1,2): v = round(f32(), 3)
                    else:
                        v = cstr()
                        m = re.fullmatch(r'TRIGSTR_0*(\d+)', v)
                        if m: v = wts.get(int(m.group(1)), v)
                    cc()
                    mods[mid if lvl == 0 else '%s%d' % (mid, lvl)] = v
            res[tbl].append({'base': oid, 'id': nid if tbl=='custom' else oid, 'mods': mods})
    return ver, res
if __name__ == '__main__':
    wts = load_wts('war3map.wts')
    out = {}
    for ext, lv in [('w3u',0),('w3t',0),('w3b',0),('w3d',1),('w3h',0),('w3a',1),('w3q',1)]:
        ver, r = parse('war3map.'+ext, lv, wts)
        out[ext] = r
        print(ext, 'ver', ver, 'orig', len(r['orig']), 'custom', len(r['custom']))
    json.dump(out, open('objects.json','w'), ensure_ascii=False, indent=1)
