import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
o = json.load(open(src + '/objects.json'))
def clean(s):
    s = str(s)
    s = re.sub(r'\|[cC][0-9a-fA-F]{8}|\|[rR]', '', s)
    return s.replace('|n', ' / ').replace('\r', '').replace('\n', ' / ').replace('|', '\\|').strip()
def num(v):
    return '' if v is None else (str(int(v)) if isinstance(v, float) and v == int(v) else str(v))
ab = {x['id']: x for x in o['w3a']['custom'] + o['w3a']['orig']}
def abname(i):
    x = ab.get(i)
    return f"{i}:{clean(x['mods'].get('anam',''))}" if x else i
# ---------- units ----------
cat_rules = [
    ('Alien forms & spawns', lambda n, b: n.startswith('Alien') or n in ('Eldritch Beast',)),
    ('Mutant forms & spawns', lambda n, b: n.startswith('Mutant') or n in ('Mini Fleshy','Spiderling','Swarm','Harbinger','Carrier Sack','Worm','Tentacle','Overlord Hive','Overlord Guardian','Monster Pod','Overlord')),
    ('Personnel (human classes)', lambda n, b: n in ('Personnel','Scientist')),
    ('Androids & bots', lambda n, b: n in ('Android','Defense Drone','Pacification Bot','Robo-Butler','Sentry Gun','Security Camera','Motion Sensor')),
    ('Stations, planets & ships (space layer)', lambda n, b: b in ('hgyr','hmtt')),
    ('Vendors, consoles & facilities', lambda n, b: b == 'hhou'),
    ('Creeps & NPCs', lambda n, b: b in ('necr','nwld','ngnw','nzom') or n in ('Pirate','Pirate Captain','Snoeglay','Spichen','Spichen Overseer','Murmusk','Freakman','Unknown Entity','Monstrosity','Firefly','Magnetic Saw','Metal','Energy Bank','Cage')),
]
groups = {k: [] for k, _ in cat_rules}; groups['Dummies & technical'] = []
for x in o['w3u']['custom']:
    m = x['mods']; n = clean(m.get('unam', ''))
    for k, f in cat_rules:
        if f(n, x['base']): groups[k].append(x); break
    else: groups['Dummies & technical'].append(x)
L = ['# 單位資料表（從 war3map.w3u 自動產生）', '', '> 僅供重製參考：數值、名稱用來理解原作設計與平衡，不要把原文直接放進遊戲。欄位：HP / 魔力(能量) / 護甲 / 攻擊(基礎+骰) / 攻速冷卻 / 射程 / 移速。', '']
for k, xs in groups.items():
    if k == 'Dummies & technical':
        L += [f'## {k}', '', '共 %d 個（e0xx dummy、投射物、技能冷卻顯示等技術單位），略。' % len(xs), '']; continue
    L += [f'## {k}（{len(xs)}）', '', '| id | 名稱 | HP | MP | 甲 | 攻擊 | CD | 射程 | 移速 | 技能 | 說明 |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for x in xs:
        m = x['mods']
        atk = num(m.get('ua1b'))
        if m.get('ua1d') is not None: atk += f"+{num(m.get('ua1d'))}d{num(m.get('ua1s'))}"
        abis = ', '.join(abname(a) for a in str(m.get('uabi','')).split(',') if a and a not in ('Avul','Aloc','Apit','Aneu','A07Q'))
        L.append('| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (x['id'], clean(m.get('unam','')), num(m.get('uhpm')), num(m.get('umpm')), num(m.get('udef')), atk, num(m.get('ua1c')), num(m.get('ua1r')), num(m.get('umvs')), abis, clean(m.get('utub',''))[:400]))
    L.append('')
open(dst + '/units.md', 'w').write('\n'.join(L))
# ---------- items ----------
L = ['# 道具資料表（從 war3map.w3t 自動產生）', '', '> 物件資料中所有道具 `igol`（金幣價格）皆為 0；庫存上限 / 補貨秒數 / 開局延遲由 isto / istr / isst 控制。販賣機對照見 vendors 段落。', '',
     '| id | 名稱 | 充能 | 庫存上限 | 補貨(s) | 開局延遲(s) | 技能 | 說明 |', '|---|---|---|---|---|---|---|---|']
for x in o['w3t']['custom']:
    m = x['mods']
    abis = ', '.join(abname(a) for a in str(m.get('iabi','')).split(',') if a)
    L.append('| %s | %s | %s | %s | %s | %s | %s | %s |' % (x['id'], clean(m.get('unam','')), num(m.get('iuse')), num(m.get('isto')), num(m.get('istr')), num(m.get('isst')), abis, clean(m.get('utub', m.get('ides','')))[:500]))
items = {x['id']: clean(x['mods'].get('unam','')) for x in o['w3t']['custom']}
L += ['', '## 販賣機 → 販售道具', '', '| 販賣機 id | 名稱 | 販售 |', '|---|---|---|']
for x in o['w3u']['custom']:
    m = x['mods']
    if m.get('usei'):
        L.append('| %s | %s | %s |' % (x['id'], clean(m.get('unam','')), ', '.join(f"{i} {items.get(i,i)}" for i in str(m['usei']).split(','))))
open(dst + '/items.md', 'w').write('\n'.join(L))
# ---------- abilities ----------
L = ['# 技能資料表（從 war3map.w3a 自動產生）', '', '> 只列有名稱與說明的自訂技能；CD/耗能/持續/範圍列出第 1 級（多級以 / 分隔）。', '',
     '| id | 名稱 | 等級 | CD | 耗能 | 持續 | 施放距離 | 範圍 | 說明 |', '|---|---|---|---|---|---|---|---|---|']
def lv(m, f):
    n = int(m.get('alev', 1) or 1); vals = [m.get(f'{f}{i}') for i in range(1, n+1)]
    vals = [num(v) for v in vals if v is not None]
    return '/'.join(dict.fromkeys(vals)) if vals else ''
for x in o['w3a']['custom']:
    m = x['mods']; name = clean(m.get('anam',''))
    tip = clean(m.get('aub11', m.get('aub1', '')))
    if not name: continue
    L.append('| %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (x['id'], name, num(m.get('alev', 1)), lv(m,'acdn'), lv(m,'amcs'), lv(m,'adur'), lv(m,'aran'), lv(m,'aare'), tip[:450]))
open(dst + '/abilities.md', 'w').write('\n'.join(L))
# ---------- upgrades & buffs ----------
L = ['# 升級與 Buff（war3map.w3q / w3h）', '', '## Upgrades', '', '| id | 名稱 | 說明 |', '|---|---|---|']
for x in o['w3q']['custom']:
    m = x['mods']; L.append('| %s | %s | %s |' % (x['id'], clean(m.get('gnam1', m.get('gnam',''))), clean(m.get('gub11', m.get('gub1', '')))[:300]))
L += ['', '## Buffs', '', '| id | 名稱 | 說明 |', '|---|---|---|']
for x in o['w3h']['custom']:
    m = x['mods']; L.append('| %s | %s | %s |' % (x['id'], clean(m.get('fnam','')), clean(m.get('fube',''))[:300]))
open(dst + '/upgrades-buffs.md', 'w').write('\n'.join(L))
print('ok')
