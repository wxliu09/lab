"""產生內容總表的資料表段落（道具、防護服、販賣機、型態、飛船、地點）。

用法：python3 -I tools/make_catalog_tables.py > /tmp/tables.md
數值來源：docs/research/extracted/objects.json；命名來源：tools/homage_names.py。
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from homage_names import ITEMS, FORMS, PLACES, SHIPS  # noqa: E402

ROOT = os.path.dirname(HERE)
o = json.load(open(os.path.join(ROOT, 'docs', 'research', 'extracted', 'objects.json')))
U = {x['id']: x['mods'] for x in o['w3u']['custom']}
T = {x['id']: x['mods'] for x in o['w3t']['custom']}
A = {x['id']: x['mods'] for x in o['w3a']['custom'] + o['w3a']['orig']}
SKIP_AB = {'Avul', 'Aloc', 'Apit', 'Aneu', 'A07Q', 'Amov', 'Aatk', 'AInv', 'Ahar'}

def clean(s):
    s = re.sub(r'\|[cC][0-9a-fA-F]{8}|\|[rR]', '', str(s or ''))
    return s.replace('|n', ' ').replace('\n', ' ').replace('|', '/').strip()

def n(v):
    if v is None or v == '': return '—'
    if isinstance(v, float) and v == int(v): return str(int(v))
    return str(v)

def abil_names(ids):
    out = []
    for a in str(ids or '').split(','):
        a = a.strip()
        if not a or a in SKIP_AB: continue
        nm = clean(A.get(a, {}).get('anam', ''))
        out.append(f'{nm}（{a}）' if nm else a)
    return '、'.join(out) or '—'

def desc_of(m):
    d = clean(m.get('utub', m.get('ides', '')))
    d = re.sub(r'Item-Type:.*?Description:\s*', '', d)
    return d[:140] + ('…' if len(d) > 140 else '')

SUITS = [k for k, v in ITEMS.items() if v[1].endswith('Rig') or k == 'I00Y']

def suit_unit_map():
    s = A.get('S001', {})
    return {lv: s.get(f'Cha1{lv}') for lv in range(1, 20)}

def main():
    out = []
    vendors = {}
    for uid, m in U.items():
        for i in str(m.get('usei') or '').split(','):
            if i: vendors.setdefault(i, []).append(clean(m.get('unam')))
    lv_of = {'I000': 2, 'I001': 3, 'I007': 4, 'I008': 5, 'I009': 6, 'I00A': 7, 'I00B': 8, 'I00C': 9, 'I00D': 10,
             'I00E': 11, 'I00X': 12, 'I00Y': 13, 'I00Z': 14, 'I011': 15, 'I01E': 16, 'I01G': 17, 'I020': 18, 'I021': 19}
    units = suit_unit_map()
    out += ['### 防護服（18 套）', '',
            '穿上防護服＝把人類單位變身成對應的「著裝單位」（原作 S001 Personnel Suit Change 的等級 2–19；等級 1 是未著裝 h00H：HP 400、攻擊 19、移速 319）。異形／變種人形態不能穿。', '',
            '| ☐ | 原作 id | 致敬名稱 | English | 等級→單位 | HP | 攻擊 | CD | 射程 | 移速 | 原作技能 | 取得 |',
            '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for k in sorted(SUITS, key=lambda x: lv_of[x]):
        zh, en = ITEMS[k]; lv = lv_of[k]; uid = units[lv]; m = U.get(uid, {})
        src = '、'.join(sorted(set(vendors.get(k, [])))) or '掉落／事件'
        out.append(f"| ☐ | {k} | {zh} | {en} | {lv}→{uid} | {n(m.get('uhpm'))} | {n(m.get('ua1b'))} | {n(m.get('ua1c'))} | {n(m.get('ua1r'))} | {n(m.get('umvs'))} | {abil_names(m.get('uabi'))} | {src} |")
    out += ['', '各防護服的功能定位（原作摘要，遊戲內文字需重寫）：', '']
    for k in sorted(SUITS, key=lambda x: lv_of[x]):
        out.append(f'- **{ITEMS[k][0]}**：{desc_of(T.get(k, {}))}')
    out += ['', '### 一般道具', '',
            '| ☐ | 原作 id | 致敬名稱 | English | 充能 | 庫存 | 補貨 s | 開局延遲 s | 取得 | 原作功能摘要 |', '|---|---|---|---|---|---|---|---|---|---|']
    for k, (zh, en) in ITEMS.items():
        if k in SUITS or en == 'internal': continue
        m = T.get(k, {})
        src = '、'.join(sorted(set(vendors.get(k, [])))) or '職業／掉落／事件'
        out.append(f"| ☐ | {k} | {zh} | {en} | {n(m.get('iuse'))} | {n(m.get('isto'))} | {n(m.get('istr'))} | {n(m.get('isst'))} | {src} | {desc_of(m)} |")
    out += ['', '### 販賣機', '', '| ☐ | 原作 id | 原作名稱 | 販售（致敬名稱）|', '|---|---|---|---|']
    for uid, m in U.items():
        if m.get('usei'):
            items = '、'.join(ITEMS.get(i, (i,))[0] for i in str(m['usei']).split(','))
            out.append(f"| ☐ | {uid} | {clean(m.get('unam'))} | {items} |")
    out += ['', '### 異類與仿生人型態', '',
            '| ☐ | 陣營 | 階 | 原作 id | 致敬名稱 | English | HP | MP | 攻擊 | CD | 射程 | 移速 | 原作技能 |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for uid, (zh, en, fac, tier) in FORMS.items():
        m = U.get(uid, {})
        out.append(f"| ☐ | {fac} | {tier} | {uid} | {zh} | {en} | {n(m.get('uhpm'))} | {n(m.get('umpm'))} | {n(m.get('ua1b'))} | {n(m.get('ua1c'))} | {n(m.get('ua1r'))} | {n(m.get('umvs'))} | {abil_names(m.get('uabi'))} |")
    out += ['', '### 飛船', '',
            '| ☐ | 原作 id | 致敬名稱 | English | HP | 攻擊 | 射程 | 移速 | 原作技能 |', '|---|---|---|---|---|---|---|---|---|']
    for uid, (zh, en) in SHIPS.items():
        m = U.get(uid, {})
        out.append(f"| ☐ | {uid} | {zh} | {en} | {n(m.get('uhpm'))} | {n(m.get('ua1b'))} | {n(m.get('ua1r'))} | {n(m.get('umvs'))} | {abil_names(m.get('uabi'))} |")
    out += ['', '### 地點（太空層實體）', '',
            '| ☐ | 原作 id | 致敬名稱 | English | HP | 攻擊 | 原作技能 |', '|---|---|---|---|---|---|---|']
    for uid, (zh, en) in PLACES.items():
        m = U.get(uid, {})
        out.append(f"| ☐ | {uid} | {zh} | {en} | {n(m.get('uhpm'))} | {n(m.get('ua1b'))} | {abil_names(m.get('uabi'))} |")
    print('\n'.join(out))

if __name__ == '__main__':
    main()
