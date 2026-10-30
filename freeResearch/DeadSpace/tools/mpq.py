import struct, zlib, bz2, sys

def _crypt_table():
    t = [0]*0x500; seed = 0x00100001
    for i in range(0x100):
        idx = i
        for _ in range(5):
            seed = (seed*125+3) % 0x2AAAAB; t1 = (seed & 0xFFFF) << 0x10
            seed = (seed*125+3) % 0x2AAAAB; t2 = (seed & 0xFFFF)
            t[idx] = t1 | t2; idx += 0x100
    return t
CT = _crypt_table()

def hash_str(s, ht):
    s = s.upper().replace('/', '\\')
    seed1, seed2 = 0x7FED7FED, 0xEEEEEEEE
    for ch in s.encode('latin-1'):
        seed1 = (CT[(ht<<8)+ch] ^ (seed1+seed2)) & 0xFFFFFFFF
        seed2 = (ch + seed1 + seed2 + (seed2<<5) + 3) & 0xFFFFFFFF
    return seed1

def decrypt(data, key):
    n = len(data)//4
    vals = struct.unpack('<%dI' % n, data[:n*4]); out = []
    seed = 0xEEEEEEEE
    for v in vals:
        seed = (seed + CT[0x400 + (key & 0xFF)]) & 0xFFFFFFFF
        r = (v ^ (key + seed)) & 0xFFFFFFFF
        key = (((~key << 0x15) + 0x11111111) | (key >> 0x0B)) & 0xFFFFFFFF
        seed = (r + seed + (seed << 5) + 3) & 0xFFFFFFFF
        out.append(r)
    return struct.pack('<%dI' % n, *out) + data[n*4:]

class MPQ:
    def __init__(self, path):
        self.f = open(path, 'rb'); d = self.f.read()
        self.data = d
        off = 0
        while True:
            i = d.find(b'MPQ\x1a', off)
            if i < 0: raise ValueError('no MPQ')
            if i % 512 == 0: break
            off = i+1
        self.base = i
        hs, asz, ver, shift, hto, bto, htn, btn = struct.unpack('<IIHHIIII', d[i+4:i+32])
        self.sector = 512 << shift
        ht = decrypt(d[i+hto:i+hto+htn*16], hash_str('(hash table)', 3))
        bt_raw = d[i+bto:i+bto+btn*16]
        bt = decrypt(bt_raw.ljust(btn*16, b'\0'), hash_str('(block table)', 3))
        self.hash = [struct.unpack('<IIHHI', ht[j*16:j*16+16]) for j in range(htn)]
        self.block = [struct.unpack('<IIII', bt[j*16:j*16+16]) for j in range(btn)]
        self.htn = htn

    def find(self, name):
        a, b, idx = hash_str(name, 1), hash_str(name, 2), hash_str(name, 0) % self.htn
        start = idx
        while True:
            h1, h2, loc, plat, bi = self.hash[idx]
            if bi == 0xFFFFFFFF: return None
            if h1 == a and h2 == b and bi != 0xFFFFFFFE and bi < len(self.block): return bi
            idx = (idx+1) % self.htn
            if idx == start: return None

    def decompress(self, buf, usize):
        if len(buf) >= usize: return buf
        m = buf[0]; buf = buf[1:]
        if m & 0x10: buf = bz2.decompress(buf)
        if m & 0x08: buf = explode(buf)
        if m & 0x02: buf = zlib.decompress(buf)
        if m & ~0x1A & 0xFF: raise ValueError('unsupported compression %02x' % m)
        return buf

    def read(self, name, block_index=None):
        bi = self.find(name) if block_index is None else block_index
        if bi is None: return None
        pos, csize, fsize, flags = self.block[bi]
        if not flags & 0x80000000: return None
        p = self.base + pos
        raw = self.data[p:p+csize]
        key = None
        if flags & 0x00010000:
            if name is None: raise ValueError('need name')
            key = hash_str(name.replace('/', '\\').split('\\')[-1], 3)
            if flags & 0x00020000: key = ((key + pos) ^ fsize) & 0xFFFFFFFF
        if flags & 0x01000000:  # single unit
            if key is not None: raw = decrypt(raw, key)
            if flags & 0x200: return self.decompress(raw, fsize)
            return raw
        if not (flags & 0x0000FF00):
            if key is not None:
                out = b''
                for s in range(0, len(raw), self.sector):
                    out += decrypt(raw[s:s+self.sector], (key + s//self.sector) & 0xFFFFFFFF)
                raw = out
            return raw[:fsize]
        ns = (fsize + self.sector - 1)//self.sector
        tbl = raw[:(ns+1)*4]
        if key is not None: tbl = decrypt(tbl, (key-1) & 0xFFFFFFFF)
        offs = struct.unpack('<%dI' % (ns+1), tbl)
        out = b''
        for s in range(ns):
            chunk = raw[offs[s]:offs[s+1]]
            if key is not None: chunk = decrypt(chunk, (key+s) & 0xFFFFFFFF)
            us = min(self.sector, fsize - s*self.sector)
            out += self.decompress(chunk, us) if flags & 0x200 else chunk
        return out

def explode(buf):
    raise ValueError('implode not supported')
