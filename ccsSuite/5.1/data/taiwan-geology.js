/*
 * taiwan-geology.js — 2D 圖台的地質脈絡圖層（可替換）
 *
 * 資料性質說明（重要）：
 *  - basins / highs：新生代沉積盆地與基盤高區的「概略範圍」，依 Lin, Watts & Hesselbo (2003, Basin Research)
 *    及中油／地調所區域構造圖示意手繪，僅供區域脈絡參考，非精確邊界。
 *  - faults：西部主要活動斷層的「概略線形」，依地質調查及礦業管理中心（GSMMA，前中央地質調查所）
 *    活動斷層分布圖示意簡化（每條僅 3–6 個節點），不具測繪精度；正式使用請以 GSMMA 公開圖資取代。
 *  - sources：主要 CO2 點排放源，排放量為公開資料（環境部排放量申報、台電/業者永續報告）之概估級距（Mt CO2/yr），
 *    供源匯配對（source–sink matching）示意。
 *  - fields：台灣既有油氣田概略位置（中油探採事業部公開資訊），供枯竭油氣田封存脈絡參考。
 * 座標皆為 WGS84 [lon, lat]。
 * 匯入格式：可用同結構的 GeoJSON FeatureCollection 覆蓋（見 index.html「資料」頁籤說明）。
 */
window.CCS_GEOLOGY = {
  basins: { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: '台西盆地', nameEn: 'Taihsi (Taixi) Basin', kind: 'basin',
        note: '古近紀裂谷 + 新近紀被動陸緣／前陸沉積；台灣海峽主要鹽水層封存潛能區' },
      geometry: { type: 'Polygon', coordinates: [[[119.05, 24.05], [119.55, 23.9], [120.0, 23.88], [120.5, 24.0], [120.78, 24.25], [120.88, 24.55], [120.7, 24.8], [120.25, 24.85], [119.65, 24.7], [119.2, 24.45], [119.05, 24.05]]] } },
    { type: 'Feature', properties: { name: '台南盆地', nameEn: 'Tainan Basin', kind: 'basin',
        note: '北港高區以南；中新世—更新世厚層沉積，南段受泥貫入作用影響' },
      geometry: { type: 'Polygon', coordinates: [[[119.3, 22.4], [119.9, 22.35], [120.35, 22.6], [120.52, 23.0], [120.48, 23.35], [120.05, 23.28], [119.55, 23.12], [119.25, 22.8], [119.3, 22.4]]] } },
    { type: 'Feature', properties: { name: '澎湖盆地', nameEn: 'Penghu Basin', kind: 'basin', note: '澎湖西南方古近紀裂谷盆地（概略）' },
      geometry: { type: 'Polygon', coordinates: [[[118.55, 22.45], [119.15, 22.35], [119.3, 22.85], [119.05, 23.25], [118.6, 23.15], [118.55, 22.45]]] } },
    { type: 'Feature', properties: { name: '北港高區', nameEn: 'Peikang High', kind: 'high',
        note: '中生代基盤高區，新生代蓋層薄；分隔台西與台南盆地，向西南延伸至澎湖' },
      geometry: { type: 'Polygon', coordinates: [[[119.45, 23.35], [119.9, 23.3], [120.5, 23.55], [120.66, 23.75], [120.45, 23.9], [119.9, 23.78], [119.45, 23.6], [119.45, 23.35]]] } },
    { type: 'Feature', properties: { name: '觀音高區', nameEn: 'Kuanyin High', kind: 'high',
        note: '東北走向基盤高區，分隔台西盆地與北方之南日島盆地' },
      geometry: { type: 'Polygon', coordinates: [[[120.15, 24.85], [120.45, 24.65], [121.15, 25.1], [121.45, 25.35], [121.2, 25.5], [120.5, 25.05], [120.15, 24.85]]] } }
  ] },

  faults: { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: '彰化斷層', nameEn: 'Changhua Fault', type: '逆衝（盲斷層）', note: '西部麓山帶變形前緣；八卦山台地西緣' },
      geometry: { type: 'LineString', coordinates: [[120.60, 24.36], [120.57, 24.2], [120.53, 24.05], [120.51, 23.9], [120.50, 23.78]] } },
    { type: 'Feature', properties: { name: '車籠埔斷層', nameEn: 'Chelungpu Fault', type: '逆衝', note: '1999 集集地震主震斷層' },
      geometry: { type: 'LineString', coordinates: [[120.80, 24.45], [120.73, 24.35], [120.70, 24.2], [120.70, 24.05], [120.68, 23.9], [120.67, 23.78]] } },
    { type: 'Feature', properties: { name: '三義斷層', nameEn: 'Sanyi Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.62, 24.48], [120.75, 24.42], [120.86, 24.38]] } },
    { type: 'Feature', properties: { name: '新城斷層', nameEn: 'Hsincheng Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.95, 24.78], [121.02, 24.72], [121.10, 24.65]] } },
    { type: 'Feature', properties: { name: '湖口斷層', nameEn: 'Hukou Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.98, 24.93], [121.08, 24.90], [121.20, 24.88]] } },
    { type: 'Feature', properties: { name: '梅山斷層', nameEn: 'Meishan Fault', type: '右移', note: '1906 梅山地震' },
      geometry: { type: 'LineString', coordinates: [[120.45, 23.55], [120.55, 23.57], [120.65, 23.60]] } },
    { type: 'Feature', properties: { name: '觸口斷層', nameEn: 'Chukou Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.60, 23.65], [120.58, 23.50], [120.55, 23.35], [120.50, 23.20]] } },
    { type: 'Feature', properties: { name: '新化斷層', nameEn: 'Hsinhua Fault', type: '右移', note: '1946 新化地震' },
      geometry: { type: 'LineString', coordinates: [[120.28, 23.05], [120.36, 23.06], [120.42, 23.07]] } },
    { type: 'Feature', properties: { name: '後甲里斷層', nameEn: 'Houchiali Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.22, 23.05], [120.23, 22.98], [120.24, 22.92]] } },
    { type: 'Feature', properties: { name: '旗山斷層', nameEn: 'Chishan Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.35, 22.75], [120.45, 22.85], [120.55, 22.95], [120.62, 23.05]] } },
    { type: 'Feature', properties: { name: '小崗山斷層', nameEn: 'Hsiaokangshan Fault', type: '逆衝' },
      geometry: { type: 'LineString', coordinates: [[120.30, 22.78], [120.32, 22.72], [120.33, 22.66]] } }
  ] },

  sources: { type: 'FeatureCollection', features: [
    src('台中發電廠', 'Taichung Power Plant', 120.483, 24.212, 28, '燃煤（逐步改燃氣）', '台電；台灣最大單一排放源'),
    src('麥寮工業區（六輕）', 'Mailiao Complex', 120.19, 23.79, 25, '石化 + 燃煤電廠', '台塑集團'),
    src('中鋼高雄廠', 'China Steel (Kaohsiung)', 120.37, 22.59, 20, '鋼鐵', '中鋼集團'),
    src('林口發電廠', 'Linkou Power Plant', 121.31, 25.12, 12, '燃煤', '台電'),
    src('大潭發電廠', 'Datan Power Plant', 121.05, 25.03, 10, '燃氣', '台電'),
    src('興達發電廠', 'Hsinta Power Plant', 120.19, 22.85, 9, '燃煤/燃氣', '台電；燃煤機組除役中'),
    src('大林發電廠', 'Talin Power Plant', 120.36, 22.53, 9, '燃煤', '台電'),
    src('和平發電廠', 'Hoping Power Plant', 121.75, 24.30, 7, '燃煤', '和平電力'),
    src('通霄發電廠', 'Tongxiao Power Plant', 120.68, 24.49, 5, '燃氣', '台電'),
    src('中油大林／林園廠區', 'CPC Talin & Linyuan', 120.40, 22.48, 4, '煉油/石化', '中油'),
    src('協和發電廠', 'Hsieh-ho Power Plant', 121.72, 25.15, 2, '燃油（除役中）', '台電')
  ] },

  fields: { type: 'FeatureCollection', features: [
    fld('鐵砧山氣田', 'Tiechenshan', 120.695, 24.415, '陸域；桂竹林層／打鹿頁岩砂岩；中油 CO2 封存試驗場址'),
    fld('錦水氣田', 'Chinshui', 120.85, 24.53, '陸域；苗栗'),
    fld('出磺坑油氣田', 'Chuhuangkeng', 120.85, 24.45, '陸域；台灣最早開發油氣田'),
    fld('永和山氣田', 'Yunghoshan', 120.90, 24.60, '陸域；苗栗'),
    fld('青草湖氣田', 'Chingtsaohu', 121.00, 24.75, '陸域；新竹'),
    fld('新營氣田', 'Hsinying', 120.30, 23.30, '陸域；台南'),
    fld('長康氣田', 'Changkang (CBK)', 120.66, 24.90, '海域；新竹外海')
  ] },

  cities: [
    ['台北', 121.56, 25.04], ['基隆', 121.74, 25.13], ['桃園', 121.31, 24.99], ['新竹', 120.97, 24.80], ['苗栗', 120.82, 24.56],
    ['台中', 120.67, 24.15], ['彰化', 120.54, 24.08], ['南投', 120.68, 23.91], ['斗六', 120.54, 23.71], ['嘉義', 120.45, 23.48],
    ['台南', 120.21, 23.00], ['高雄', 120.30, 22.63], ['屏東', 120.49, 22.67], ['宜蘭', 121.75, 24.76], ['花蓮', 121.60, 23.99],
    ['台東', 121.14, 22.76], ['馬公', 119.58, 23.57], ['金城', 118.32, 24.43]
  ]
};

function src(name, nameEn, lon, lat, mtpa, sector, operator) {
  return { type: 'Feature', properties: { name, nameEn, emission_mtpa: mtpa, sector, operator, kind: 'source' }, geometry: { type: 'Point', coordinates: [lon, lat] } };
}
function fld(name, nameEn, lon, lat, note) {
  return { type: 'Feature', properties: { name, nameEn, note, kind: 'field' }, geometry: { type: 'Point', coordinates: [lon, lat] } };
}
