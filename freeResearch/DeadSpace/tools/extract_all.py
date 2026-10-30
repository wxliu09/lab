"""一鍵從原圖 .w3x 解出研究用資料。

用法（在 freeResearch/DeadSpace 目錄下）：
    python3 -I tools/extract_all.py

輸出：
    docs/research/_raw/          原始檔案（war3map.j、war3map.wts、物件資料、地形…）→ 已 gitignore，不進版控
    docs/research/extracted/     objects.json + units/items/abilities/upgrades-buffs 資料表
    docs/research/img/terrain-layout.png  地形配置圖
    （標註版 layout-labeled.png 另用：python3 -I tools/label_layout.py docs/research/img/terrain-layout.png docs/research/extracted/placements.json docs/research/img/layout-labeled.png）

注意：原圖檔被外部工具植入了作弊碼（Cheatz / DirectCheat / CheatUse / StringRaw2 / -PICCOLO），
閱讀 war3map.j 時請忽略那些函式，見 docs/research/01-map-analysis.md。
"""
import os, sys, json, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import mpq, objdata  # noqa: E402

W3X = os.path.join(ROOT, 'Metastasis 1.8.2.w3x')
RAW = os.path.join(ROOT, 'docs', 'research', '_raw')
EXT = os.path.join(ROOT, 'docs', 'research', 'extracted')
IMG = os.path.join(ROOT, 'docs', 'research', 'img')
FILES = ['scripts\\war3map.j', 'war3map.wts', 'war3map.w3i', 'war3map.w3u', 'war3map.w3t', 'war3map.w3a',
         'war3map.w3b', 'war3map.w3d', 'war3map.w3h', 'war3map.w3q', 'war3map.w3e', 'war3map.doo',
         'war3map.mmp', 'war3map.shd', 'war3map.wpm', 'war3mapMisc.txt', 'war3mapSkin.txt', 'war3mapMap.blp']

def main():
    os.makedirs(RAW, exist_ok=True); os.makedirs(EXT, exist_ok=True); os.makedirs(IMG, exist_ok=True)
    m = mpq.MPQ(W3X)
    for n in FILES:
        data = m.read(n)
        if data is None:
            print('missing', n); continue
        open(os.path.join(RAW, n.split('\\')[-1]), 'wb').write(data)
    wts = objdata.load_wts(os.path.join(RAW, 'war3map.wts'))
    out = {}
    for ext, lv in [('w3u', 0), ('w3t', 0), ('w3b', 0), ('w3d', 1), ('w3h', 0), ('w3a', 1), ('w3q', 1)]:
        _, r = objdata.parse(os.path.join(RAW, 'war3map.' + ext), lv, wts)
        out[ext] = r
    json.dump(out, open(os.path.join(RAW, 'objects.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(out, open(os.path.join(EXT, 'objects.json'), 'w'), ensure_ascii=False, indent=1)
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'make_tables.py'), RAW, EXT], check=True)
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'render_terrain.py'), RAW, os.path.join(IMG, 'terrain-layout.png')], check=True)
    print('done ->', RAW)

if __name__ == '__main__':
    main()
