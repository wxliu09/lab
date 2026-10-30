# Metastasis 1.8.2 — 世界 / 太空層 / 載具 / 經濟 / 隨機事件 逆向工程報告

來源：`docs/research/_raw/war3map.j`（用 `python3 -I tools/extract_all.py` 產生）（下稱 J，行號皆指此檔）、`objects.json`、`war3map.wts`。
已排除注入的作弊碼（行 1–2200、`Cheatz`/`DirectCheat`/`CheatUse` 等）。
標記「推斷」者為依程式碼推得、但無直接字串或常數證明的結論。

座標系：WC3 world units，地圖範圍 (-16384,-16384)–(16384,16384)。所有「室內」都是地圖上分離的房間；「太空」是右下角正方形 rect `di`。

---

## 0. 核心資料結構（理解全部系統的鑰匙）

| 結構 | 意義 | 位置 |
|---|---|---|
| `di` = Rect(6560,-16384,16384,-6560) | 太空層（9824×9824，中心 (11472,-11472)）。所有玩家開局得到 `di` 的永久可見 fog modifier（`zJ` 6457 → `YJ`、`Vo[]`），Player 12 也全程可見（`Vj` 5603）。 | 21711 |
| `fi` = Rect(14720,14752,16352,16352) | 「倉庫/隱藏區」。未在太空中的太空船（Raptor 等）、停泊時的太空船、事件前的海盜船/UO 都放在這裡；`G` = `fi` 中心 (15536,15552) 是通用的「藏起來」座標。 | 21713, `Vj` 5610 |
| `Mo[GetUnitUserData(space unit)]` | 太空單位 → 室內 rect 對照表（station/ship ↔ interior）。 | `Bj` 5779–5790；`CS` 10181 |
| `Hx[i]` / `lo[i]` / `Ag(loc)` | `Ag` 3888：給一個座標回傳「屬於哪個室內 index」；`Hx[i]` = 該 index 的 rect（5984–6008, 9125）；`lo[i]` = 該 index 的太空單位（`Bj` 5756–5776）。 | |
| `mo[userdata]` | 大型天體的碰撞/抵達半徑：Niffy 370、Minertha 350、Errun 150、Arbitress 180、Defunct 100、Kyo 230、Swagger 260、Syllus 220、Pown 220、Overlord 150、Hapyir 300、Erstwhile/Cameroon 200。 | `Vj` 5677–5713, `ZP` 9130, `vGv` 18117 |
| `Lo` group | 上述大型天體；每 0.25 s 把半徑 `mo` 內的其他單位推開（`NG(u,30,10,angle)` = 初速 30 u/s、每秒衰減 10）。逃生艙每被推一次推力除以累計次數。 | `Nt` 10932 (`QR` 22795) |
| `P[n]` | 停泊坪（`DTrx` elevator destructable）。`L[n]`=是否被占用。 | 21922–21972，指派於各站 init |
| Unit point value (`upoi`) | 身分代碼：`2xxxxx`=可駕駛角色（220000=人類 Personnel、210000=外星人/突變體/android/海盜/生物）；`1xxxxx`=裝置與召喚物（不可駕駛）；`37`=dummy（所有觸發器忽略）。太空單位另有 50/60/80/110/130/150/180/200/240/300/900 等。 | `tS` 10465 前後、`Wl` 7477 |
| `A071` IsExplorer Tag / `A072` IsStation Tag | 太空船 / 太空站 標記能力，許多系統（Kyo 砲、小行星、雷達）以此分辨。 | objects |

---

## 1. 地點 / 太空站

### 1.1 總表（太空座標 = 開局 CreateUnit 位置，`qf` 3222 起）

| 地點 | rawcode / 變數 | 開局太空座標 | 室內 rect（變數：x1,y1–x2,y2） | HP / regen | 攻擊（dmg / cd / range） | 太空能力 | 控制台（unit @座標，踏板 rect） | 停泊坪 P[] | 逃生艙落點 rect |
|---|---|---|---|---|---|---|---|---|---|
| U.S.I. Queen Niffy | h009 `UB` | (9715.5,-8272.5) | `Yi` (-16384,-9952)–(2624,2624)（19008×12576，最大） | 500000 / 100 | 200 / 0.06 / 2400 chaos | A04D Force Dock；裝 ARD 後 +A074 | h00A `wB` @(-13058.3,2436.5) hp11000；`zi` (-13120,2240)–(-12992,2368) | 29–33（Obda 艙），9–16（Raptor 艙） | `vn` (-9664,-2112)–(-9536,-1984) |
| U.S.I. Arbitress | h003 `MB` | (14236.8,-8238) | `Ei` (-16096,8736)–(-7584,16256) | 400000 / 200 | 124 / 0.05 / 2400 | — | h000 `mB` @(-11514.4,12559.8) hp6000；`Xi` (-11584,12416)–(-11456,12544) | 1–4 | `rn` (-11360,15040)–(-11104,15296) |
| Kyo Station | h007 `uB` | (7809.9,-12085.6) | `Mi` (-16384,3424)–(-11264,8512) | 200000 / 100 | 125 / 0.04 / 2400 | A005 Kyo Cannon；裝 ATM 後 +A06U | h006 `TB` @(-15145.7,6876.8) hp3000；`Ji` (-15232,6720)–(-15040,6848) | 7、8、34 | `on` (-11744,4288)–(-11488,4512) |
| Defunct Station | h005 `tB` | (15028.6,-13410.3) | `ji` (-7296,13536)–(-4832,16352)（天氣 FDwl） | 120000 / 100 | 12500 / 0.04 / 2400（永遠中立，不會開火） | — | **無**（不可駕駛） | 5、6 | 無（逃生艙不可指定 h005） |
| U.S.I. Swagger（戰巡艦） | h00X `Rc` | (9336.7,-14374.2) ms 65 | `Da` (-16384,-16384)–(736,-10528) | 300000 / 100 | 700 / 0.25 / 1600 | A04O Landing、A02P Autopilot | h00Y `Ic` @(-15030.1,-13317.7) hp11000；`fa` (-14944,-13440)–(-14752,-13152) | 17–20、39、40 | `xn` (-11584,-12544)–(-11456,-12416) |
| Minertha（行星） | h008 `hc` | (10173.9,-11967.6)→立即改為公轉軌道 | `Ga` (3616,1600)–(11872,10688)（天氣 RAhr 雨） | 999999 / 9999；mana 上限 30000（作為「轟炸進度」） | 125/0.04/2400（不受控） | — | 無 | 21–24、35–38 | `en` (10976,4000)–(11104,4128) |
| Errun（衛星） | h03T `bc` | (10863.7,-10295.3)→繞 Minertha | `fn` (8704,-4576)–(12416,-1024) | 100000；mana 300000/300000（A04Z Shielding=mana shield） | 125/0.04/2400 | — | h04B `iC` @(11378.8,-2097.5)（模組工廠）；`Kn` (11296,-2304)–(11456,-2144) | 41–44 | `Fn` (12032,-3136)–(12160,-3008) |
| Sun | h01A `Hc` | (12050.4,-11774.9) | 無 | 800000，Aloc+Avul，pv 37 | — | 600 內進入→持續灼燒 | — | — | — |
| U.S.I. Calipea（可移動工程艦，有條件出現） | h04E `aC` | (14243.8,-11157.7) ms 70 | `mn` (-7104,10784)–(-5056,12992) | 130000 / 70；mana 250/1000 | 185 / 0.05 / 900（AFOD 閃電特效 `LM` 8279） | A02U External Repair（治療 1200、cd 0.5、1 mana、目標 structure）、A02J Board、A07A Cordoning Beacon；裝模組後 +A07D Neurotoxins | h04F `VC` @(-6063.5,12873.4)；`Mn` (-6176,12640)–(-5984,12800) | 不可停靠（「請用 boarding」） | `pn` (-5344,12064)–(-5120,12288) |
| U.S.I. Syllus（標本收容站） | h04T `zc` | (13467.5,-14562.4) ms 0 | `qn` (-4288,4064)–(1280,10624) | 220000；mana 250/1000 | 185/0.05/900（無太空控制台，永遠中立） | — | h04I `XC` @(-1484.6,9428.8)（牢房門）`Qn`；h04R `Zc` @(-1475.2,8824.7)（籠子）`iV` — 兩者都只控制自己 | 47–52 | `sn` (-1728,4352)–(-1440,4608) |
| U.S.I. Pown（人員傳送站） | h04V `EC` | (11449.9,-15084.1) ms 0 | `aV` (-7200,8064)–(-5024,10176) | 180000；mana 250/1000 | 51 / 0.02 / 1600 | A04D Force Dock、A02J Board | h04U `Yc` @(-6316.2,8988.4)；`nV` (-6528,8928)–(-6368,9088)；傳送台 `EV` (-5920,8736)–(-5376,9312) | 不可停靠 | `OV` (-6720,8320)–(-6464,8544) |
| Unidentified Object | h029 `Mc` | 倉庫 (14933.6,14934.6)；事件時移到 `Ha` 中心 (15920,-7888) | `ha` (3648,-13280)–(5056,-11712) | 999999 | 1 dmg | — | 無 | 25、26 | 無（逃生艙不可指定） |
| Pirate Vessel | h02B `Pc` | 倉庫 (14877.9,16272.2)；事件時隨機在 `ga` | `ja` (1312,-15424)–(2240,-11904) | 300000 | 360 / 0.25 / 1300，ms 140 | A02B Shield Attachment（純視覺，Idef=0） | h02A `pc` @(1759.4,-11992.8) hp2000（Player 12） | 27、28、45、46 | 無 |
| Overlord（突變體 T4，動態） | h04G | 由突變體進化產生 | `IV` (-9728,2688)–(-5344,7424)（由 `bV..qV` 多個小 rect 拼成器官形狀） | 300000 / 300 | 9000 / 3 / 1600 | A08N Guardian、A08M View Intestines、A08H Launch | — | 53–57（P[58] 未設） | `AV` (-9568,4256)–(-9280,4512) |

**行星軌道**（`yq` 9433、`hQ` 9653、`uq` 9400、`fQ` 9631）：
- Minertha：每 0.08 s 角度 +0.02° → 0.25°/s（週期 1440 s = 24 分），半徑 2300，圓心 `Wv` = `di` 中心 (11472,-11472)，起始角 `yv` 隨機 0–360（`Vj` 5626）。若 Minertha 身上有 buff `B000`（Hunter 的 Gravitational Beam 帶此 buff）則暫停公轉（`wq` 9428）。
- Errun：每 0.04 s 角度 +0.06° → 1.5°/s（週期 240 s），半徑 800，繞 Minertha 當下位置；同樣被 `B000` 暫停（`gQ` 9648）。
- Sun 不在軌道圓心（偏 653 u）。

**站點「出現與否」由開局人數/隨機決定**（`eKv` 18675、`e6v` 18839、`xhv` 19065）：
- 玩家數 ≥7 時 `qr = GetRandomInt(1,3)`；≤6 人時 `qr=0`。
- Calipea：僅當 `hr`（`qr==1` 且有人抽到 Engineer 職業，該 Engineer 出生在 (-6016,11980)）或單人測試模式。否則 `RemoveUnit(aC)`（內部房間仍在但無法到達）。
- Syllus / Pown：條件 `CountPlayersInForceBJ(bj_FORCE_ALL_PLAYERS)>=11` 成立時兩者都啟用；否則 Syllus 需 `qr==2`、Pown 需 `qr==3`，未啟用者以 `zM` 8426 / `BP` 8804 移除站體與內部所有單位。推斷：`bj_FORCE_ALL_PLAYERS` 在 WC3 開局即含全部玩家槽位（含空槽），此條件實際上恆成立 → Syllus 與 Pown 永遠存在；設計意圖應是「≥11 人兩者皆開，否則三選一」。

**玩家出生點**：19 個 `e003` Dummy（位置見附錄 placements；Niffy 10、Swagger 4、Arbitress 3、Minertha 1、Obda#19 內 1）。每位玩家隨機取一個（`e2v` 18801），Engineer 在 `qr==1` 時固定出生於 Calipea。

### 1.2 各站內部設施

| 地點 | 內部設施（unit @座標） |
|---|---|
| Queen Niffy (`Yi`) | 主控台 h00A；**動力分配台** h048 `oC` @(-6867.2,-1149.7)（踏 `kn` (-7072,-1248)–(-6912,-1056)）；防衛無人機 h00B ×2 @(-12807.2,376.1)/(-11780.6,387.3)（控制圈 `Zi` (-12608,256)–(-12480,384)、`va` (-12096,256)–(-11968,384)，閘門 XTmp `hC`(-12800,384)/`GC`(-11776,384)）；GIT h011 `Gc` @(-7808,-6400)；Life Regenerator h010 ×2 @(-7136.7,-4593.4)、(-8309.6,-4588.9)（A016 Life Regen Aura 6 hp/s）；Pacification Bot h04A `rC` @(-14594.7,-6775)；Experimental Teleport Device Factory h016 @(-15872,-3968)；Portal 落點 `Fa` (-15936,-3168)–(-15680,-2880)；Escape Pod Device `ec` @(-10496,-3648)；性能強化點 `ta` (-14656,-5280)–(-14464,-5056)；實驗室失敗品生成點 `vn`；失敗實驗體 n000×4、n001×4 @(-11008…-9701,≈-4740)；docked Raptor h001 ×4（`rc` (-4629.8,-3198.9)、`ac` (-2279.9,-3713.7)、`nc` (-1595.3,-3675.5)、`ic` (241.1,-1904.4)）；docked Obda h02K ×2（`Dc` (-15882.1,-4950.5)、`fc` (-15882.9,-7273.2)）；商店見 §5。門 `HC` (-10624,-448) 需 Janitor's ID。 |
| Arbitress (`Ei`) | 控制台 h000；Radar Station h019 `jc` @(-11545.6,15628.2)（ASAD 介面生成於 (-11410,15466)）；Metallic Fabricator h03Z `qc` @(-9664,10112)（android 重建，房間 `hn`/`Hn`/`jn`）；Escape Pod Device `Wc` @(-12160,13056)；docked Raptor h001 ×2（`pB` (-14969.3,12654.1) pad1、`QB` (-8091.9,12158.2) pad4）；商店見 §5。 |
| Kyo (`Mi`) | 控制台 h006；LQ Storage h049 `wc` @(-11776,7360)（開局被 `pG` 暫停，只有 Laboratory Power 時運作）；Escape Pod Device `kc` @(-13696,5184)；商店見 §5。 |
| Defunct (`ji`) | 空的（「All valuables have been cleared out」）；入口門 `fC` (-5888,14272) 需 Janitor's ID。 |
| Swagger (`Da`) | 控制台 h00Y；降落傳送門 e012 `xC` @(-7143.6,-13306.4)（rect `Dn` (-7232,-13376)–(-7040,-13248)）；Escape Pod Device `xc` @(-11904,-11968)；docked Raptor h001 ×2（`Qc` (-213.9,-12106.4) pad17、`sc` (-194.2,-14028.3) pad19）；4 個 Suit Vendor、Fusion Bomb Factory、Medical ×2、Maintenance、Outpost；門可被 Captain's ID 上鎖（僅在 `Da` 內有效）。 |
| Minertha (`Ga`) | Radar Station h019 `Jc` @(10246.4,6316.2)；Swagger 降落模型 h03O `Lc` @(7349.7,6069.8)、傳送門 e012 `Bc` @(7469.5,6053.6)（rect `Cn` (7392,5984)–(7552,6144)）；docked Hunter h02I `Nc` @(6922.8,8278.4) pad36；前哨商店群 @(8192–8896, 3456–4160)；門 `pC` (8576,3008) 需 Janitor's ID；B005 破壞物 @(11360,6176)（毀壞掉 Penguin Doll）；生物見 §7。 |
| Errun (`fn`) | 模組工廠控制台 h04B；Gravitational Control Device h012 `gc` @(10304,-4096)（12000 hp）；模組輸送帶出口 rect `ln` (11008,-2208)–(11136,-2112)。 |
| Calipea (`mn`) | 控制台 h04F；Medical h00G @(-6592,12608)；Escape Pod Device `nC` @(-6848,12544)；出口踏板 `Pn` (-6144,10944)–(-5856,11040)。 |
| Syllus (`qn`) | 兩個控制台（h04I 牢房、h04R 籠子）；Maintenance Station h04S @(-1088,8576)（Avul，賣重力推/拉器、Calming Incense）；Escape Pod Device `yc` @(-1856,8576)；Outpost h023 @(-832,8064)、Medical @(-2240,8064)；6 個牢房（§4.5）；運輸平台 `rV` (-1664,8352)–(-1312,8672)；開局所有門上鎖（`WM` 8399 / `wM`）。 |
| Pown (`aV`) | 控制台 h04U；傳送台 `EV`；出口踏板 `VV` (-6912,8896)–(-6848,9152)。 |
| UO (`ha`) | Scientist h025 ×9（Avul、ms 0，開局播放 death 動畫 `Zm` 8084）、Unknown Entity h026 ×4（Aloc+A027 Locust Hit 10 dmg/2 s，隱形危害）；啟用碼 rect `Jn` (4000,-13056)–(4160,-12896)（進入顯示 "Activation code ####" `eM` 8097，碼 `er`=隨機 1000–9999）。 |
| Pirate Vessel (`ja`) | 控制台 h02A；Pirate Captain h02C（帶 I002）、Pirate h02D ×3、Sentry Gun h01Z ×3（全 Player 12 敵對）；補給箱 LTcr ×2 @(1792,-15296)、(2112,-14976)（毀壞掉 Emergency Medical Pack，`Kf`/`lf`）。 |

### 1.3 站被摧毀時（全部站共通流程）

以 Arbitress `Ak` 6556 為例（Defunct `vK` 6785、Kyo `KK` 6967、Niffy `Kl` 7383、Swagger `Rm` 7854、Calipea `JM` 8245、Syllus `Np` 8515、Pown `LP` 8890、Minertha `nQ` 9498、Errun `kQ` 9685、Pirate `XM` 8150、Explorer `at` 10841、UO `N8` 17691、Overlord `Iq` 9188）：
1. 全員畫面 DreamFilter 淡出 7 s、爆炸音、全域訊息 "The X has been destroyed!"；太空位置生成 2–4 個 e01E 爆炸。
2. **室內 rect 內所有單位必死**：加 `A02T`（And Stay Dead，禁止復活）、移除 buff 與 A04T/A04U（外星人再生核心）、**刪除 6 格物品**（物品不掉落，直接消失），再以 `Yh` 4965 設 HP=1 並造成 421337 chaos 傷害（擊殺歸功於擊毀者）。
3. 5 s 後所有玩家對該室內 fog 遮蔽。
4. `qg(rect)` 4136：之後 300 s 內每 1 s 殺死進入該 rect 的任何單位（致命區）。
5. 個別：Niffy 死亡會重置動力模式（`eO`）、Portal Device 失效、Performance enhancer 事件無效；Minertha 死亡時若 Swagger 正降落其上（`Ao`）Swagger 一併被殺，Minertha 單位移到 `G`；Syllus/Pown/Minertha 太空單位移到 `G`；Swagger 死亡移除降落模型與傳送門。
6. 控制台被毀（不是站被毀）：`mJ` 6299 以灰色 1 HP 無敵複製品取代（A06R Destroyed Console），失去駕駛功能，直到用 Station Interface Device（I01R，A06Q，目標點 200 內）修復（`Fy` 13420）。

**被攻擊警報**（`gk` 6615 等）：受 ≥1 傷害時，站內有英雄的玩家看到 "X under attack!"、鏡頭震動 5 s、室內播放潛艇警報 10 s（最後一次受擊後 10 s 停）。

---

## 2. 駕駛與跨層移動

### 2.1 太空站駕駛（`SJ` 6371 / `sJ` 6352 / `qJ` 6331）

綁定（main 22368–22373 + 動態）：`SJ(mB,MB,Xi)` Arbitress、`SJ(TB,uB,Ji)` Kyo、`SJ(wB,UB,zi)` Niffy、`SJ(Ic,Rc,fa)` Swagger、`SJ(oC,oC,kn)` Niffy 動力台、`SJ(iC,iC,Kn)` Errun 模組台、`SJ(VC,aC,Mn)` Calipea（`IM` 8165）、`SJ(Yc,EC,nV)` Pown（`AP` 8794）、`SJ(XC,XC,Qn)`/`SJ(Zc,Zc,iV)` Syllus（`WM`）。
- 單位走進 console rect → 若 console 屬中立、單位非幻象、pv≠37、pv 首位≠"1"、全域旗標 `ao`=false（`ao` 從未被設為 true，推斷為已移除的「病毒」事件遺留）→ console 與太空單位改為該玩家所有，顯示 "<站名> Access Granted" 並選取 console。
- 每 0.3 s 檢查：駕駛者離開 rect / 死亡 / 換主 → 兩者還給中立。
- Console 能力：A073 Select Space（cd 3，鏡頭移到太空單位並選取，`WJ` 6397）、A000 Surveillance Sweep（cd 45，見 §4.1）。
- Alien（Player 14 形態）駕駛時訊息改送其真實玩家 `Bv`。

### 2.2 探索船（Explorer）登船、發射、駕駛（`CS` 10143 註冊、`KS` 10208）

每艘船由 `CS(docked, space, console, interior, entryRect, panelRect, idx)` 註冊：停泊模型（hmtt 版本，例如 h001）在站內 hangar、太空版本（hgyr 版本，例如 h002）平時在倉庫。

| 步驟 | 規則 | 行 |
|---|---|---|
| 登船 | 任何非中立單位（或籠子 h04Q）走到**停泊模型 128 範圍內**、且停泊模型飛行高度 ≤101（未在發射中）、且船不在太空 → 傳送到該船 entry rect 中心並移動鏡頭；每個單位兩次登船需間隔 **8 s**（"Please wait X seconds"）。 | `PS` 10373 |
| 下船 | 踏上 entry rect → 若船不在太空、未在發射（`K`=false）→ 傳送到停泊模型位置（停泊模型在倉庫 `fi` 時不傳送）。若船在太空但正被 Board 連結（`Le`）→ 傳到對方船的入口。 | `QS` 10406 |
| 發射 | 船停泊時踏上 **control panel rect**（pv 首位非 "1"）→ "launching in 10 seconds"，進度條 80×0.125 s；7 s 時檢查室內是否有任一 `2xxxxx` 非幻象單位且 `LaunchCleared` 仍為 true（被 EMP 打到會設 false），否則 "Explorer launch cancelled."；接著 3/2/1 秒訊息、打開 hangar 電梯門、停泊模型升空，總計約 10.4 s。完成後：太空船 HP% = 停泊模型 HP%，太空船放到**母站 `F[]` 的太空位置**，停泊模型移到 `G`，停泊坪釋放。Swagger 降落中時，停在 Swagger 的船不可發射。 | `US` 10465 |
| 駕駛 | 船在太空時踏上 control panel → console 與太空船歸該玩家；之後每 1 s 檢查室內仍有同玩家的 `2xxxxx` 單位（`zH`/`YH` 5497），且**離開 panel 立即失去控制**（`yS` 10569）。發射完成時腳本把仍站在 panel 上的駕駛者瞬移出入一次以重新觸發取得控制。 | 10546–10553 |
| 停靠 Dock | A001（range 180、cd 30）對站施放 → 在該站的空停泊坪中隨機選一（`ZS` 水塘抽樣）；太空船移到 `G`、停泊模型落到坪上（飛高 100）、4 s 後 "Dock complete."、停泊模型 HP%=太空船 HP%；母站 `F[]` 改為此站。無空坪 → "No landing pads are available."；Pown/Calipea → "請改用 boarding"。 | `vt` 10583 |
| 各站停泊坪 | Arbitress 1–4；Defunct 5–6；Kyo 7–8、34；Niffy 先 29–33 再 9–16；Swagger 17–20、39–40；Minertha 35–38、21–24；UO 25–26；Pirate 27–28、45–46；Errun 41–44；Syllus 47–52；Overlord 53–58。 | 10583–10760 |
| Board | A02J（range 200、施法 3 s、cd 0；Raptor/Hunter/Obda/Albadar/Sheepyship/Calipea/Pown 皆有）對另一艘 explorer：雙方暫停 **20 s**（進度條 20×1 s），期間雙方出口踏板互通（走進自己出口 → 到對方入口）。 | `Et` 10873 |
| Force Dock | A04D（Niffy、Pown；range 10000、cd 10）：目標若為 Albadar/Hunter/Obda/Raptor/Sheepyship → 強迫該船對 **Niffy** 施放 Dock（Pown 施放也是停到 Niffy，推斷為設計捷徑或 bug）。 | `Gt` 10975 |
| Lifeform Scan | A04X（所有探索船；range 1500、施法 2 s、cd 27）對有室內的目標：等待 `寬×高/15,000,000` 秒後回報室內英雄數。各站秒數：Niffy 15.94、Swagger 6.68、Minertha 5.00、Arbitress 4.27、Syllus 2.44、Kyo 1.74、Overlord 1.38、Errun 0.88、Albadar 0.52、Defunct 0.46、Pown 0.31、Calipea 0.30、Pirate 0.22、UO/Hunter 0.15–0.17、Obda 0.12、Raptor 0.08、Sheepyship 0.06。 | `Ct` 10943 |

**跨層連結**：室內 ↔ 太空只有三種連結：(a) `Mo[]` 站/船 → 室內 rect；(b) 登船/下船/發射/停靠時的瞬移；(c) 室內 rect 全部預先在地圖上存在（開局 `zJ` 6457、`yk` 6754、`HK` 6931、`Hl` 7312、`Vm`、`uq` 9400、`fQ` 9631、`WM`、`AP`、`ZP` 等一次性揭露 fog）。室內的物理位置與太空位置**沒有**幾何關係。

### 2.3 其他移動方式

| 方式 | 規則 | 行 |
|---|---|---|
| 逃生艙 | 在 Escape Pod Device（h02O，6 台：Arbitress/Niffy/Kyo/Swagger/Calipea/Syllus，`ue[]` 對應站 `Vj` 5611–5622）購買 I010（補貨 4 s）。限玩家主英雄 `A[]`；每玩家冷卻 **100 s**；Alien Cocoon、帶 A07E 者、Swagger 降落中的 Swagger 裝置皆拒絕。準備 4 s（40×0.1 s）期間移動 ≥90 或累計受傷 ≥35 → 失敗。成功：英雄隱藏暫停移到 `G`，在**該站太空位置**生成 h02P（18000 hp、ms 1、Amim、A004），保留 HP%。A004 Set Trajectory（range 9000、cd 2）目標須在太空且為站或船，排除 h02P/h02H/h02L/h002/h02B/h029/h005/h02Q/h03J（即只能飛往 Niffy/Arbitress/Kyo/Swagger/Minertha/Errun/Calipea/Syllus/Pown/Overlord）；之後逃生艙變中立、以 180 u/s 追蹤，抵達距離 `mo×1.2`（無則 250）→ 英雄出現在該站落點 rect 中心、恢復 HP%、4 s 無敵。艙被擊毀 → 英雄死亡（`f5`）。 | `C5` 16463、`K5` 16608、`f5` 16566 |
| Pown 傳送 | Console 能力 A082 Select Target Zone（選點）+ A081 Activate（cd 3）。目標點須：在某個存活站/船的室內（`Ag`）、該站在太空中且未隱藏（若是 explorer 則須在太空或停泊中）、地形非 `Vcbp`（太空地磚）、懸崖高度 ≤ 傳送台、可通行。啟動後 console 暫停、充能 20×0.975 = **19.5 s**，然後 `EV` 傳送台上**所有單位**移到目標點，5 s 無敵。A083 Explorer Targetting Aid（鏡頭看目標室內）、A084 View Last Destination。 | `tP` 8964、`sP`、`qP` 8922 |
| Niffy ARD | 模組 I01V 用在 Niffy 控制台 h00A → Niffy 得 A074（cd 240）；目標點須在太空；Niffy 暫停 20 s 充能（e021 特效）後瞬移。 | `FL` 7610、`CL` 7568 |
| Swagger 降落 Minertha | A04O（cd 240、施法 10 s、range 140）對 Minertha：Swagger 隱藏暫停，Minertha 上的降落模型/傳送門顯形，啟用雙向傳送門 `Dn`(Swagger 內) ↔ `Cn`(Minertha) ；控制台得 A04Q Swagger Launch（cd 40）→ 45 s 倒數 "Swagger Launch" → Swagger 出現在 Minertha 當下位置。降落期間 Minertha 每次轟炸對 Swagger 造成 20000（§4.6）。 | `Qm` 7989、`tm` 8036、`Um` 8052 |
| Autopilot | Swagger A02P（cd 10）：console 與 Swagger 交給中立，Swagger 沿朝向前進 5000。 | `ym` 8068 |
| 防衛無人機 | Niffy 兩台 h00B。走進控制圈（`Zi`/`va`）→ 取得無人機並炸開對應閘門（XTmp）；離開圈即還給中立；pv `1xxxxx` 單位不可駕駛；無人機本身 pv 100000 → 不能再去開站/船（說明文字 "not authorized to launch ships or control stations"）。h00B：350 hp、39 dmg、range 500、視野 1800、hover、A051 Rocket Reserves（35 dmg 群射，cd 24）。 | `Yl` 7477、`nL` 7519 |
| Experimental Portal Device | I00O → 放置 h015，3 s 後把 400 範圍內同一室內的非建築非中立單位傳送到 Niffy `Fa`；Niffy 已毀則失效。 | `gz` 14057、`Mz` 14115 |
| 地圖錯誤保護 | 單位進入 `RV` (-160,-192)–(288,256)（地圖中心）→ 移到 Minertha 中心，英雄得 Portal Device；超過 16 次後停用。 | `Yj` 6016 |

---

## 3. 太空船

### 3.1 可駕駛探索船

| 船 | 太空 unit / 停泊 unit | 數量與初始停泊（母站、pad、室內 rect、控制台） | HP | regen | ms | 攻擊 dmg / cd / range | 能力 | pv |
|---|---|---|---|---|---|---|---|---|
| Raptor | h002 / h001（15000 hp） | 8 艘：Niffy 4（#9 `qB` pad9 室內 `Ci`、#10 `sB` pad12 `Fi`、#11 `Vc` pad16 `xa`、#12 `Ec` pad14 `ia`）、Arbitress 2（#13 `Tc` pad1 `ka`、#14 `uc` pad4 `La`）、Swagger 2（#15 `Cc` pad17 `pa`、#16 `cc` pad19 `Pa`）。控制台 h004（Avul/Aloc，999999 hp）位於各室內。 | 60000 | — | 90 | 1299 / 預設 / 1300 | A071、A04X Lifeform Scan、A02J Board、A003 Armageddon Payload、A002 Overload、A001 Dock | 200 |
| Hunter | h02H / h02I（20000） | 1 艘 `Ac`：Minertha pad36（`Nc`），室內 `Ta` (4672,13760)–(5792,16096)，控制台 `lc` | 80000 | — | 100 | 3000 / 3.0 / 1600 | A071、A04X、A05D Focused Wave Cannon、A02J、A02K Gravitational Beam、A001 | 180 |
| Obda | h02L / h02K（15000） | 2 艘：#18 `YB` Niffy pad29（`Dc`）室內 `Wa`；#19 `dc` Niffy pad33（`fc`）室內 `Ya` | 60000 | 30 | 160 | 900 / 預設 / 1300 | A071、A04X、A03F Anti-boarding Pulse、A02J、A001 | 240 |
| Albadar（戰艦級） | h02Q / h02S（25000） | 1 艘 `ZB`：**開局就在太空**（15001.8,-14525.6），停泊模型在倉庫，無母站。室內 `En` (-3648,12864)–(-832,15616)（含 Maintenance、Medical）。只能用 Board/Pown 傳送/Force Dock 進入（推斷）。 | 95000 | — | 105 | 2000 / 1.5 / 1100 | A07L Barrage、A071、A04X、A050 Cloaking Device、A02J、A001 | 180 |
| Sheepyship | h03J / h03K（15000） | 隱藏船：把 Sheep Doll 給特殊 Sluggly `Fc` 後出現在太空隨機點，室內 `bn`（12 隻羊）、控制台 `vC`，以 `CS(...,26)` 註冊（`J7` 17404）。 | 60000 | 30 | 140 | 450 / 0.5 / 1100 | A071、A04X、A02J、A001 | 900 |
| Calipea / Pown | 見 §1 | 站兼船（有 A071），但不能 Dock、只能 Board | | | | | | 110 |
| Escape Pod | h02P | 逃生艙（§2.3） | 18000 | 99999（A04V，於英雄身上） | 1（飛行時 180） | 900 | Amim、A004 | 150 |

**誰能駕駛**：任何 point value 首位為 "2" 的非幻象單位（所有人類職業、android、外星人/突變體及其 spawn，甚至海盜等）。`1xxxxx`（裝置、Swarm/Spiderling/Tentacle/Firefly 等召喚物、防衛無人機）拒絕："This unit cannot pilot spaceships."。職業被動：Dr.（PhD in Gravitational Effects）所控制的船 +10% 移速（R007，另一份報告）。

**能力數值**（objects.json `w3a`）：
- A003 Armageddon Payload（Cluster Rockets）：L1 每發 3000、15 波、上限 37500、AoE 400、range 2900、cd 180；L2（RUM）5000、22 波、range 4500、cd 150。
- A002 Overload（Frenzy 類）：攻速 +1000%、移速 +400%、7.5 s、cd 60（L2 cd 45、range 800）。
- A05D Focused Wave Cannon（Hunter，range 4500、cd 80）：投射物 500 u/s，碰到第一個 100 內單位：explorer 受 15000、其他（站）受 60000 magic 傷害（`kt` 11013）。
- A02K Gravitational Beam（Hunter，Aerial Shackles，10 s、cd 40、range 600，buff `Bmlc,B000`）：可讓 Minertha/Errun 停止公轉（推斷，依 B000 檢查）。
- A03F Anti-boarding Pulse（Obda，Divine Shield 基底，4 s 無敵，cd 30；腳本未特別處理 buff B00C → 推斷只有無敵效果）。
- A07L Barrage（Albadar，channel，range 1200、cd 70）：每 0.1 s 對目標點 300 內隨機點發射火箭（2000 u/s），命中 150 內第一單位 450 傷害（`iT`/`xT` ≈11240）。
- A050 Cloaking Device（Albadar，Wind Walk，15 s、cd 120）。
- A001 Dock（range 180、cd 30）；A02J Board（range 200、施法 3 s）。

### 3.2 模組（Errun 模組工廠 h04B `iC` 生產）

踏 `Kn` 取得 Errun 控制台 → 以「訓練」介面下單（訓練 1 s 後由腳本計時），**同時只能一張單**（新單取消舊單；e01V Cancel Production），倒數文字在 (11345.9,-1960)，成品在 (11074.8,-1904) 出現並以 50 u/s 沿輸送帶滑到 `ln`（`As` 9900、`Cs` 9934）。所有模組都是免費的。

| 模組 | 生產時間 | 物品 | 使用（item 能力 range 250） | 效果 | 行 |
|---|---|---|---|---|---|
| ASAD (Arbitress Scan Augmentation Device) | 300 s | I01S | 對 Arbitress Radar Station `jc` | 在 (-11410,15466) 生成 h04C ASAD Interface（600 hp）；存活期間每 45 s "U.S.I. Arbitress Scanning..." 向**全體玩家**ping 所有不在太空的英雄與有人搭乘的探索船（7 s ping） | `hs` 9954、`Uk` 6729 |
| ATM (Antimatter Teleportation Matrix) | 700 s | I01T | 對 Kyo 控制台 h006（未毀） | Kyo 得一次性 A06U（range 15000、cd 40）：施放 → 全域 "ATM now has a targetting lock on X"、60 s 計時 "ATM- X"，然後對目標造成 **900000** 傷害；可選目標同 Kyo 砲限制 | `ks` 9966、`Rl` 7197、`Vl` 7160 |
| RUM (Raptor Upgrade Module) | 240 s | I01U | 對**停泊中的** Raptor 模型 h001 | 太空 Raptor：A003/A002 升 L2，+A06W 移速 +30、A06X 投射速 1800、A06Y +30000 HP、A06Z +400 傷害；每艘限一次 | `ms` 9978、`Zs` 10028 |
| ARD (Auxiliary Repositioning Drive) | 600 s | I01V | 對 Niffy 控制台 h00A | Niffy 得 A074 跳躍（§2.3） | `qs` 9990、`FL` 7610 |
| Refined Ore | 120 s | I01W | 對 Calipea 控制台 h04F | Calipea mana +150 | `ts` 10002、`oS` 10061 |
| Neurotoxin Module | 300 s | I01X | 對 Calipea 控制台 h04F | Calipea 得 A07D Neurotoxins（channel 180 s、cd 60、range 900）：目標須為有室內的站/船；每 1 s 對室內每位英雄（非 android 玩家 `Cv`、非中立、非建築）造成傷害，起始 5、每秒 +0.03，並對其中的探索船室內遞迴生效；受害者畫面變綠 | `ws` 10014、`nS` 10082、`QM` 8334、`PM` 8305 |

### 3.3 NPC / 敵方太空單位

| 單位 | 數值 | 出現 |
|---|---|---|
| Drone Fighter h02T | 7500 hp、199 dmg、range 700、ms 120、A02V | 事件 #9：50 架 |
| U.S.I. Raptor h043 | 60000 hp、1100 dmg、ms 80、A003/A002 | 末日 #1：6 架 |
| U.S.I. Cameroon h040 / Erstwhile h041 | 150000 hp、400 dmg、cd 0.25、range 1600、ms 60 | 末日 #1 |
| U.S.I. Hapyir h042 | 300000 hp、200 dmg、cd 0.05、range 2300、ms 60 | 末日 #1 |
| Pirate Vessel h02B | 300000 hp、360 dmg、cd 0.25、ms 140 | 事件 #4 |
| Asteroid h04D | 20000 hp × 隨機%、pv 37 | 事件 #12：50 顆 |
| Overlord Guardian h04Y / Monster Pod h04Z | 5000 hp 399 dmg / 14000 hp ms 240 | 突變體 Overlord |

敵方 AI（`LG` 4463 / `mG`）：每 10 s 對 `di` 內「第一個」非 Player 12 存活單位下 attack-move（若只剩 Minertha 則把它當目標）。

---

## 4. 站特殊系統

### 4.1 掃描類

| 系統 | 觸發 | 結果 | 行 |
|---|---|---|---|
| Surveillance Sweep A000 | Arbitress/Kyo/Niffy/Swagger 控制台，cd 45 | 全域訊息 "<站> initiating surveillance sweep..."；**只對施放者**ping 該站室內所有英雄（白色）與有人駕駛的探索船（粉紅 100/25/50），7 s | `Xk` 6526、`gK` 6908、`gl` 7263、`Qm` 7989 |
| Arbitress Radar Station `jc` 賣 I00T Radar Sweep（補貨 90 s） | 購買 | "Sector sweep complete."：對購買者 ping **全地圖**所有不在太空的玩家英雄 + 不在倉庫的有人探索船 | `Pk` 6677 |
| Minertha Radar Station `Jc` 賣 I00T | 購買 | "Planetary sweep complete."：對購買者 ping Minertha 表面所有非中立非敵對單位 | `Sq` 9391 |
| ASAD | 見 §3.2 | 每 45 s 全體可見的全圖掃描，摧毀 h04C（600 hp）可停止 | `Uk` 6729 |
| Lifeform Scan A04X | 探索船 | §2.2 | `Ct` 10943 |
| Inventory Scanner I027/A08Y | 物品 | "Your inventory has been scanned."（物品系統，略） | ~13781 |

### 4.2 Kyo Cannon（`YK` 7096、`wK` 7047、`WK` 7072、`ol` 7137）

- A005：range 15000，cd **220**（Station Power 讓等級+1 → L2 cd 160）。
- 不可選目標（`vl`/`al`）：不在太空者、Raptor h002、Hunter h02H、Obda h02L、Albadar h02Q、Drone Fighter h02T、Escape Pod h02P、Spacial Control Alien h031/h032、Sheepyship h03J（小型船）。
- 全域訊息 "The Kyo Cannon has been fired at X!"。生成 e00Z 能量球（飛高 60），每 0.04 s 前進 4.8（=120 u/s）並追蹤目標；目標離開太空或死亡 → **改追 Minertha**。
- 爆炸條件：任何帶 **A072（Station tag）**、非無敵、存活、非施放者的單位進入球 100 範圍 → 該單位在 5 s 內共受 **200000** 傷害（每 0.04 s 1600）。⇒ 實際只能傷害「站」（含 Calipea/Pown/Syllus/UO/Pirate/Overlord/行星），沿途撞到的其他站也會被打中；艦隊（無 A072）無法被它擊中，球會在目標死後轉向 Minertha（推斷）。
- 開局 120 s 內對 Defunct Station 開砲 → 記錄成就旗標 `jg(2,player)`。
- ATM 見 §3.2。
- **「Kyo 收容失效爆炸」事件**：只存在於字串 TRIGSTR_2311（"CONTAINMENT FIELD MALFUNCTION IN KYO ORBITAL ARTILLERY PLATFORM..."），J 中無引用 → 1.8.2 未實作。

### 4.3 Errun 重力控制（`LQ` 9709、`qQ` 9734、`uQ` 9768）

- Gravitational Control Device h012 `gc`（Errun 表面 (10304,-4096)）賣 I01C（補貨 80 s，PowerUp）。購買者在 Errun 位置得 e017 指揮 dummy（自動按 J 熱鍵）。
- A02V Gravitational Targetting（cd 10）選目標：須在太空、非建築、非 Errun/Minertha → "Target accepted. Select correction angle."；A052 Set Angle 選方向。
- 推動：每 0.04 s 位移 `force`，force 從 0 每 tick +0.25；持續 `4 × pv/100` 秒（外星人 h031/h032 固定 4 s）。例：Niffy(pv50) 2 s ≈306 u；Kyo(80) 3.2 s ≈ 790 u；站 110 → 4.4 s ≈1497 u；Raptor(200) 8 s ≈4975 u；Obda(240) 9.6 s；Sheepyship(900) 36 s（推出地圖）。全域訊息 "GRAVITATIONAL CORRECTIONS ACTIVATED FOR X"。可用來把站推進太陽。
- 放置 Black Hole Device 會直接殺死 `gc`（`Dz` 14043）。
- Errun 護盾：A04Z Shielding 以 Errun 300000 mana 吸收傷害；mana 歸零 → "Errun's atmospheric and debris shield has failed"，暴風雪天氣，之後每 0.5 s 對表面所有單位 5 傷害（10 dps）（`is` 9846、`Vs` 9858）。

### 4.4 Niffy 動力分配台 h048（`mL` 7659 … `ZL` 7734）

踏 `kn` 控制；四種模式互斥（切換時 `eO` 先撤銷前一模式）：
| 能力 | cd | 效果 |
|---|---|---|
| A06G Ambient Power | — | 給每位玩家與 Player 14 一個 e01U dummy（A06H，Brilliance Aura 基底，buff B014）；推斷為全體能量回復加成 |
| A06D Explorer Power | 40 | 所有探索船 +A06I 20 hp/s、+A06J 移速 +30、+A06K 攻速 +30% |
| A06E Station Power | 50 | 所有站 +A06L 100 hp/s、+A06M 攻速 +40%；Kyo Cannon 等級 +1（cd 220→160） |
| A06F Laboratory Power | 45 | 啟用 `aO`：每 45 s 在 `vn` 生成失敗實驗體（n000/n001 各 50%）；LQ Storage 解除暫停（可購買）；Pacification Bot 啟動（每 2 s 攻擊 600 內穿著 Suit（A070）或機械的玩家單位，20% 機率喊話；無目標時在 Niffy 內漫遊） |

### 4.5 Syllus 標本收容（`Jp` 8591、`up` 8666、`yp` 8733、`vP` 8757、`iP` 8773）

牢房控制台 h04I（訓練 e02M–e02R = Open Cell 1–6）：切換該牢房 rect 中心 900 範圍內所有門的鎖。

| 牢房 / rect | 內容（Player） |
|---|---|
| 1 `Sn` (-3680,7136)–(-2752,8032) | Murmusk h04P（1500 hp、90 dmg；AI 隊伍 "MURMUSK"，攻擊範圍 160、索敵 700，`qH`） |
| 2 `tn` (-3648,5568)–(-2784,6464) | Anomaly n00A ×5（5 hp、Amim、ms 65536；離開 rect 會被拉回，除非 YTab 欄杆被打開；開 cell 2 會同時破壞 5 根 YTab）；死亡掉隨機物品表（含 1% Black Hole Device） |
| 3 `Tn` (-3648,4160)–(-2752,5056) | 地球動物：Chicken ×4、Frog、Rabbit ×3、Sheep ×3、Stag（可被突變體 Devour） |
| 4 `un` (-320,4128)–(576,5056) | Sluggly n003 ×7 |
| 5 `Un` (-352,5536)–(576,6464) | Spichen h04J ×6、Spichen Overseer h04O（AI 隊伍 "AI"：攻擊範圍 300、索敵 1000，`pH`） |
| 6 `wn` (-352,7104)–(576,7968) | Failed Experiment n00B ×7、n00C ×2、n00D ×4（**Player 12 敵對**；n00B/n00C 死亡爆炸：80 範圍 60/150 傷害、150 範圍 45/75 傷害） |

籠子控制台 h04R：e02S Create Cage（施法 30×0.333 ≈10 s，把平台 `rV` 上的單位往南推 256，生成 h04Q 籠子 300 hp）；e02T–e02Y Cage Cell N：從牢房 N 取一隻（非 dummy）隱藏並放進平台上未滿的籠子（容量 3，`Cage_Weight<=2`），籠子對該標本擁有者共享視野。籠子被打破 → 放出所有標本。籠子可搭船（登船條件允許 h04Q）。

生物 AI（`LH` 5224/`PH` 5317）：ROAM（每 0.5 s 25% 機率隨機走 600）→ ATTACK（目標評分：越近越好、HP% 越低越好、非中立、非建築；**攜帶 Calming Incense I029 者 -100 分**）→ 低於 34% HP FLEE（+50 移速，>50% 恢復）→ EVADE（躲 Fusion Bomb 危險區 `FH`）。

### 4.6 Minertha 轟炸 / 輻射（`AQ` 9552、`CQ` 9621）

- 對 Minertha 造成的傷害累積在 `Ux`（顯示為 Minertha mana）；每滿 **30000** → 表面隨機點 600 半徑預警（特效+ping 10 s）→ 10 s 後撞擊：712 內破壞物全毀、600 內單位受 4900（探索船 10000）傷害、地形坑洞、荒蕪、留下 e014 輻射 dummy；輻射 `ho += 3`。
- 輻射：每 1 s 對表面所有非 Sluggly(n003) 單位造成 `ho` 傷害，`ho` 每秒 ×0.99 衰減。
- Swagger 降落時每次撞擊對 Swagger 造成 20000 並顯示 "Estimated N impacts remaining"。
- Minertha 999999 hp / 9999 regen，幾乎不死；死亡訊息見 9506。

### 4.7 Calipea 修理 / Cordoning（`Cord_*` 11032 起）

- A02U External Repair Apparatus：每次治療 1200、1 mana、cd 0.5、自動施放，目標 structure（各站）。
- A07A Construct Cordoning Beacon（40 mana、cd 1、range 600）：兩信標間形成光束（最大 3100），穿越的探索船（Albadar/Calipea 除外）被彈開 200 u/s、受 160 傷害、暫停 1.5 s。
- 「採礦」：腳本中僅有 Errun 生產的 Refined Ore（+150 mana）；推斷「mining」為設定文字。

### 4.8 門、鎖、監視

| 系統 | 規則 | 行 |
|---|---|---|
| 自動門 | 所有 B000/B001 門以門為中心 600×600 rect：有單位進入→開、全空→關。強制關門時門縫 55 內單位：HP≤175 設為 1，否則受 225，並被擊退（`CG`：初速 625×100/質量 u/s、每秒衰減 525；質量表見下）。 | `IJ` 6163、`xJ` 6060、`FJ` 6258 |
| Janitor 門 | `fC`(Defunct)、`HC`(Niffy)、`pC`(Minertha) 需持 Janitor's ID I00J（或 Electricity Alien h037/h039 直接通過）。 | `FJ`、`rJ` 6088 |
| Janitor's ID I00J | 使用：256 內的門 上鎖/解鎖切換（找不到門則返還次數）。 | `cz` 14031 |
| Captain's ID I00I | 同上，但只在 Swagger 室內 `Da` 有效。 | `Ez` 13984 |
| 門故障 | 事件 #11（§6）。 | `cJ` 6221 |
| Security Camera I00K | A014（cd 120、range 20）放置 h00Z（100 hp、視野 1400）。 | — |
| Motion Sensor I01M | A062（cd 25、15 mana、range 110）放置 h045；他人單位進入 325 → 擁有者收到 ping 4 s + "Sensors have detected an intruder."，4 s 冷卻。 | `uY` 13887、`TY` 13870 |
| Nanobot Barricade h044 | 100 hp、-3 hp/s、建造 14 s（object data；由職業建造，推斷）。 | — |
| Life Regenerator h010 | A016 Life Regen Aura 6 hp/s（Niffy 醫療區 ×2）。 | — |
| 重力推/拉器 I023/I022 | A080/A07Z（cd 2、10 mana、range 400，不可對控制台）：`CG(target,250,300,角度)` 把目標推離/拉向施放者（初速 250×100/質量、衰減 300/s，質量 100 時約 104 u）。 | `VP` 8781、`OP` 8787 |
| 地面推擠質量表 `Nf` | `CustomData_Mass`（main 22240–22303）：Alien Cocoon 2000、Android 330、Defense Drone 130、docked Albadar 4000 / Hunter 3500 / Obda 2500 / Raptor 3000 / Sheepy 3000、Personnel 80–130、Lightning Storm 4000、Flesh Golem 1000、所有控制台 999999999；未列者預設 100（`Af` 2454）。 | `Nf` 2462、`CG` 4338 |
| EMP（Electromagnetic Grenade I017 → e00X） | 250 內：mana 減 `(250-d)/1.6`；商店與控制台停機 120 s（console 失去駕駛者）；探索船取消發射。 | `Jy` 13465、`jy` 13450、`Hy` 13437 |

---

## 5. 經濟

### 5.1 金幣（credits）

- **起始金幣 = 0**（腳本未設定，`MeleeStartingResources` 不存在；所有職業相同）。
- **+1 金 / 60 s**：`mN` periodic 60（23419）→ `Z7` 17574 → `z7` 17571 對 `bj_FORCE_ALL_PLAYERS` 每人 +1。
- 腳本**從未讀取**金幣（`GetPlayerState(...GOLD)` 只出現在注入作弊碼 1733/1827）；所有自訂物品 `igol=0`；模組單位 `ugol=0`。⇒ 商店購買**完全免費**，限制只有庫存 `isto`、補貨間隔 `istr`、開局延遲 `isst`（未改者沿用基底物品預設值）與商店存活/EMP 停機。
- 不可賣回：商店只有 `Apit`/`Aneu`，無典當能力；`MAP_LOCK_RESOURCE_TRADING`（`Vj` 5607）。
- **+8000 credits 事件**（`c8` 17701）：`return` 寫在給錢之前 → 永遠只是佔一次事件並重排計時，無任何效果。
- **Cash ID I00P**：描述「撿起取得掉落者資金」，但 J 中無任何引用 → 1.8.2 未使用（推斷為舊版死亡掉錢的遺留）。
- Lumber = 演化點 EP、Food used = 進化進度條（另一份報告）。生物相關 EP：突變體 Devour（A05M）n002 Anomaly +125、其餘可吞者（n006 特殊 Sluggly、n000/n001、n00A、nech/nfro/necr/nder/nshe）+25；Cannibalize（A076）屍體（A077）140 內 +140（`otv` 19553、`oyv` 19602）。

### 5.2 商店表

| 商店 | 位置（實例） | 商品（isto 庫存上限 / istr 補貨 s / isst 開局延遲 s；「預」= 未修改沿用基底） |
|---|---|---|
| Medical Supplies h00G（1600 hp） | 13 台：Arbitress(-10816,11712)；Minertha(8320,3584)；Niffy(-14528,-5632)(-7936,-4096)(-4608,-1536)(-7552,-4096)；Kyo(-11584,3776)；Swagger(-4800,-14656)(-4800,-11968)；Hunter 室內(5568,14720)；Albadar 室內(-1216,13504)；Calipea(-6592,12608)；Syllus(-2240,8064) | I002 Emergency Medical Pack（預/40/預）、I004 Antibody Pack（預/10/預）、I01N Medical Regenerator（預/30/預）、I00M Genetic Testing Device（3/5/**420**） |
| Suit Vendor h00O（紅） | Arbitress(-11200,9152)、Minertha(8192,3584)、Niffy(-12224,-960)、Swagger(-9472,-11264) | I007 Cryo、I009 Flamethrower、I000 Tesla（皆 3/0/0） |
| Suit Vendor h00P（藍） | Niffy(-14528,-5888)、Minertha(8192,3456)、Kyo(-14400,6784)、Swagger(-9472,-15360) | I00E Radiation、I00A Photon、I008 Plasma、I021 Pulse（3/0/0） |
| Suit Vendor h00Q（青） | Niffy(-3840,-3776)、Swagger(-9216,-15360) | I001 Rocket、I00B Service、I01E Machinegun、I020 Magnetic（3/0/0） |
| Suit Vendor h00R（黃） | Arbitress(-11200,9280)、Minertha(8320,3456)、Niffy(-11840,-960)、Swagger(-9152,-11264) | I011 Acidic、I00Z Guard、I01G Force、I00C Dark Matter（3/0/0） |
| Genetic Integrity Tester h011（6000 hp） | Niffy(-7808,-6400) | I00M（3/5/420）。被毀 → "The blood tester has been destroyed!"，GIT 測試失效（`im` 7758） |
| GIT Resolver h038 | 動態（GIT 系統產生） | I01A Test Results（預/30/預） |
| Fusion Bomb Factory h014 | Minertha(8896,4160)、Arbitress(-11840,9728)、Niffy(-1088,-3712)(-10176,-3648)、Swagger(-12032,-14592)、Kyo(-15744,4416) | I00N Fusion Bomb（預/60/60）；開局及每次售出播放工作動畫 58 s（`U7` 17551、`y7` 17563） |
| Experimental Teleport Device Factory h016 | Niffy(-15872,-3968) | I00O Experimental Portal Device（預/預/預） |
| Maintenance Station h017 | Arbitress(-12224,11712)、Minertha(8896,3520)、Swagger(-3200,-11904)、Niffy(-4096,-3776)、Hunter 室內(5568,14912)、Albadar 室內(-3264,13504) | I005 Power Core（預/20/預）、I00Q Energy Battery（預/25/預）、I00S Rubble Clearing Device（預/15/預）、I01D Solace Shield（預/40/0） |
| Maintenance Station h04S（Avul） | Syllus(-1088,8576) | I023 Gravitational Push Device（3/預/預）、I022 Gravitational Pull Device（3/預/預）、I029 Calming Incense（3/0/預） |
| Outpost Supplies h023 | Arbitress(-10816,13120)、Niffy(-320,-1024)(-15872,-4288)(-13056,-896)、Swagger(-3200,-14720)、Kyo(-12928,3776)、Syllus(-832,8064) | I00U Tracking Device（預/15/預）、I00R Grenade（預/20/預）、I017 EMP Grenade（預/20/預）、I01M Motion Sensor（預/40/預）、I01Z Phase Cannon（預/180/預）、I025 Phase Cloak（預/15/0） |
| LQ Storage h049（僅 Laboratory Power 時運作） | Kyo(-11776,7360) | I01R Station Interface Device（預/300/預）、I01P Burst Grenade（預/180/預）、I01Q Concentrated Stimulant（預/180/0） |
| Radar Station h019 | Arbitress(-11545.6,15628.2)、Minertha(10246.4,6316.2) | I00T Radar Sweep（PowerUp，預/90/預） |
| Escape Pod Device h02O | Arbitress、Kyo、Swagger、Niffy、Syllus、Calipea（座標見 §1.2） | I010 Escape Pod（PowerUp，預/4/預） |
| Gravitational Control Device h012 | Errun(10304,-4096) | I01C Gravitational Corrections Field（PowerUp，預/80/預） |
| Errun Console h04B | Errun(11378.8,-2097.5) | 「訓練」6 種模組（§3.2，免費、計時） |

### 5.3 掉落表（`RandomDistAddItem`，死亡時 100% 掉一件）

| 來源 | 掉落 |
|---|---|
| Pirate Captain h02C | Pirate Hat I012（`Gf` 2577） |
| Freakman h018（Minertha，Player 12） | Experimental Portal Device I00O（`Ff` 2521） |
| Failed Experiment n001 @(-10127.9,-4715.3)（Niffy 實驗室） | **Sheep Doll I018**（→ Sheepyship）（`ff` 2493） |
| Anomaly n002 @(4869.4,2919.3)（Minertha） | Critical Care System I00L（`gf` 2549） |
| Fel Fox n004 @(11040,2515.5)（Minertha） | Penguin Doll I013（`Bf` 2465） |
| Syllus Anomaly n00A ×5 | 大隨機表：每項 1–2%（含 Captain's ID、各 Suit、各模組 ASAD/ATM/RUM/ARD/Refined Ore/Neurotoxin、Fusion Bomb、Portal 等；第一隻 `Hf` 另含 1% **Black Hole Device**），約 3–5% 不掉（`Hf` 2685、`hf` 2605、`jf` 2765、`Jf` 2845、`kf` 2925） |
| 海盜船補給箱 LTcr ×2 | Emergency Medical Pack I002（`Kf` 3005、`lf` 3033） |
| Minertha 破壞物 B005 @(11360,6176) | Penguin Doll（`Lf` 3061） |

---

## 6. 隨機事件與末日

### 6.1 排程器

- `e8` 17577（開局 `MN` 執行）建立事件表 `oe[1..15]`，啟動 `ee` 計時 **180–720 s**。
- `ee` 到期 → `r8` 17619：最多 100 次抽 `Q=GetRandomInt(1,16)` 直到 `xe[Q]` 未用過，然後 `TriggerExecute(oe[Q])`。每個事件自己決定是否標記 `xe[Q]=true`（一次性）及重設 `ee`。
- **`oe[16]` 從未被指定**（null）→ 抽到 16 時什麼都不發生，且**沒人重設 `ee` → 隨機事件鏈永久結束**。門故障（#11）也不重設 `ee` → 同樣終止事件鏈（推斷：原作者疏漏）。新聞（#7）`xe[7]` 從不設定，12 則頭條用完後會無限遞迴（推斷：執行緒崩潰 → 事件鏈終止）。

### 6.2 事件表

| # | 觸發器 / 函式 | 名稱與效果 | 一次性 | 下一事件延遲 | 反制 / 互動 |
|---|---|---|---|---|---|
| 1 | `PN` / `X8` 17647 | **晉升**：class 8（Commissar）存活且非外星人/突變體 → 全域 "has received a promotion!"、得 Operative Suit I00X、名字前綴改 "Rebarch "。不符 → 1 s 後重抽 | 是 | 180–900 | — |
| 2 | `qN` / `R8` 17663 | **蟲洞物體**：UO `Mc` 移到 (15920,-7888)，ping 15 s；"Estimated wormhole closure time in 6:37"，計時 **397 s** "LS Disintegration"；到期 `N8` 17691 殺死 UO 與室內 `ha` 所有單位（物品刪除、A02T）。UO 內有啟用碼（§7） | 是 | 90–900 | 停靠 pad 25/26 進入、取得啟用碼、及時撤離 |
| 3 | `sN` / `c8` 17701 | **+8000 credits**：無效（`return` 在前） | 是 | 90–1200 | — |
| 4 | `SN` / `D8` 17714 | **外星護盾海盜船**：`Pc` 移到 `ga` 隨機點、歸 Player 12、啟動 AI；全員揭露 `ja` 一次。"Board the ship and disable its main console" → 擊毀 h02A 控制台（2000 hp）→ 訊息 TRIGSTR_1355 "Beginning self destruction sequence."，**40 s** "Pirate Ship Explodes" → 船與室內全滅（`aM` 8124、`XM` 8150）；船被直接擊毀亦同 | 是 | 90–1200 | 停靠 pad 27/28/45/46 登船，殺海盜後打控制台並在 40 s 內撤離 |
| 5 | `tN` / `g8` 17737 | **Sluggly 繁殖季**：所有 n003 替換為 Snoeglay h02E（Player 12，900 hp、14 dmg）並各給 Hormonal Supplement I024；建議避開行星 | 是 | 90–1200 | 擊殺；第 15 次（非 P12）擊殺 Sluggly/Snoeglay 有 50% 出現 Snoeglay Warden（§7） |
| 6 | `TN` / `h8` 17744 | **12 個 Anomaly n002** 出現在隨機玩家英雄處（Player 15） | 是 | 90–1200 | 突變體可 Devour（每隻 +125 EP） |
| 7 | `uN` / `J8` 17755 | **KIRZ95 新聞**：12 則頭條隨機一則（各一次） | 否 | 10–300 | 純氛圍 |
| 8 | `UN` / `l8` 17768（+`wN` `p8`、`WN` `Q8`） | **政府性能強化劑**（需 Niffy 存活）：ping `ta` 中心 (-14560,-5168) 12 s；每位玩家一次，只限 point value 第 2 位為 "2" 的單位（人類 Personnel 220000；其他 → "We don't recognize you"）；對話框選一：Movement Speed R001 +30、Health R002 +100、Attack Speed R003 +10%、Energy Capacity R004 +50、Range R005 +125 | 是 | 10–1200（Niffy 已毀則 10–120 且無效） | 外星人/突變體以原形態無法領取 |
| 9 | `yN` / `S8` 17813 | **無人機艦隊**：每 1 s 在 `di` 隨機點生成 1 架 Drone Fighter（Player 12，帶 AI），共 **50 架** | 是 | 迴圈結束後 90–1200 | 站砲、探索船 |
| 10 | `YN` / `T8` 17838 | **太陽活動增強**：時間設為 12:00、太陽灼燒係數 `po` 1.7 → **6** | 是 | 90–1200 | 遠離太陽 |
| 11 | `ab` / `vdv` 18101 | **門控制器故障**：所有無權限要求的門每 2.25 s 開關（0.25 s 開 / 1.75 s 關），夾到即受 225 傷害並擊退；**300–600 s** 後 "Doors have been successfully repaired" | 否 | **不重設** → 事件鏈結束 | 繞路/小心門縫 |
| 12 | `zN` / `U8` 17847 | **小行星帶**（Errun 重力站疏失）：5 波（8、9、10、11、12 顆，共 **50**），波間 0.1–5 s，從底部帶 `Ln` 生成；每顆縮放 50–250%、HP=20000×隨機%、速度 20–90 u/s 直線；50% 瞄準隨機太空單位、否則朝北 90±20°；撞站（A072）造成「小行星當前 HP×4」並碎裂；撞探索船造成 3000 並擊退（500 u/s）；離開太空即消失（`Hh` 4826、`Fh` 4792、`hh` 4812） | 是 | 90–1200 | 擊碎、Errun 重力推動、閃避 |
| 13 | `ZN` / `W8` 17886 | 帽子廣告玩笑訊息 | 是 | 10–300 | — |
| 14 | `eb` / `Y8` 17892 | **"Something foul this way comes..."**：之後每隔 15–30 s 連續觸發 3 次隨機事件 | 是 | 240–600 | — |
| 15 | `xb` / `vev` 17910 | **假遊戲結束**：每次被抽到僅 1/6 機率生效（否則什麼都不做、可再被抽）；生效時 "Humanity has prevailed! ... game will end in 30 seconds"、全部單位播勝利動畫，約 6 s 後 "Wait, nevermind. Game's not over, folks." | 生效才一次 | 10–300 | — |
| 16 | （無） | `oe[16]`=null → 無事件、事件鏈終止 | — | — | — |

**死碼（1.8.2 不可達）**：`rb`/`vov` 17925「Sluggly 大量出現」（Niffy 5 區各 10、Arbitress/Kyo 各區 8、Swagger 24 隻 n003）與 `ib`/`vOv` 18037「通訊病毒」（所有玩家名字清空 10 s 後隨機互換名字與顏色）——兩者未放入 `oe[]`，`-forcerandom` 也叫不到。字串 TRIGSTR_2311（Kyo 收容失效）、2568–2579（「Sector reboot / 病毒源自本地行星」）在 J 中無引用；`ao` 旗標（駕駛禁用）亦從未被設定 → 皆為舊版移除事件的殘留。「Black hole」在 1.8.2 不是隨機事件，而是物品（§7）。

### 6.3 末日（Apocalypse）

- `nb`：單次計時器 **GetRandomReal(3300,4200) s（55:00–70:00）** → `vfv` 18110 以 50/50 選 `qo[1]` 或 `qo[2]`（23491）。

| 末日 | 函式 | 流程 |
|---|---|---|
| qo[1] **U.S.I. 子艦隊** | `vGv` 18117 | "Sector surveillance has detected an inbound USI sub-fleet. No hails were recieved."；若 Arbitress 存活，在抵達點 ping 120 s；**120 s** 倒數 "Fleet Arrives"；在 `di` 隨機點生成 Hapyir h042（mo 300）、Erstwhile h041（200）、Cameroon h040（200）、6 架 Raptor h043，全部 Player 12、加入推擠群並啟動 AI；海盜船改為中立 |
| qo[2] **軌道穩定器失效** | `vHv` 18166 + `vLv` 18198/`vlv` 18182 | 訊息 TRIGSTR_4187 "Orbital stabilizer systems have failed. Please evacuate the sector."；銷毀 Minertha 與 Errun 公轉觸發；`Xb` 每 0.04 s 把 `di` 內除太陽外的所有單位拉向太陽：探索船（A071）與 Spacial 外星人以 **(自身移速+15) u/s**（全速反向也每秒被拉近 15），其他（站、行星、逃生艙等）以 **25 u/s**。太陽灼燒（§6.4）。推斷：站約 112–146 s 進入 600 範圍後持續受 ≈1445 dps 而毀滅；Minertha（regen 9999）不會死 → 待在行星表面是唯一長期安全處 |

### 6.4 太陽灼燒（`XS` 10100 → `fG` 4370）

任何單位（非 dummy、非逃生艙）進入太陽 **600** 範圍 → 每 1 s 受 `po × (850 − 距離)` 傷害，直到距離 >850；`po`=1.7（太陽活動後 6）。被灼燒船/站的室內英雄畫面依距離閃白。

### 6.5 `-forceapocalypse` / 測試指令

- 只在 `bj_isSinglePlayer`（`Tr`，`Vj` 5604）時存在；多人遊戲時 0.5 s 的 `Bj` 5803–5821 會銷毀全部測試觸發器並不顯示提示。
- `-forceapocalypse<N>`（前綴比對，`ntv` 21294 → `nSv` 21291）：`TriggerExecute(qo[S2I(SubStringBJ(msg,17,999))])` → `N=1` 艦隊、`N=2` 軌道失效；其他值無效。不影響原本的 `nb` 計時器（仍會再觸發一次）。
- `-forcerandom N`（`nkv` 21233）：顯示 "kk" 並執行 `oe[N]`（1–15），事件照常設 `xe` 並重設 `ee`。
- 其他測試指令：`-EP`、`-help`、`-hostile`、`-mine`、`-nowin`、`-playerhero`、`-spawn`、`-spawncode`、`-spawnhelp`、`-test_abilities`（A087 Testing Warp）。
- 另：Iv 為 0 人時顯示 "Less than 4 players has been detected. Testing mode enabled."（`e6v` 18839，訊息與實際門檻不符）。

---

## 7. NPC / 生物

| 生物 | 位置 / 來源 | 數值 | 行為與玩家互動 |
|---|---|---|---|
| Sluggly n003 | Minertha 表面 ~27 隻（座標見附錄）、Syllus 牢房 4 ×7 | 基底 necr（兔子 critter）ms 200 | 無害漫遊；Minertha 輻射對其無效；被 Player 12 殺死 → Minertha 隨機處重生；被玩家殺第 15 次時 50% 召喚 **Snoeglay Warden** n005（Player 12、700 hp、19 dmg、ACpu，自 2000 高空落下），只檢查剛好第 15 次 → 失敗後永不出現（`xQ` 9454） |
| 特殊 Sluggly n006 `Fc` | Minertha (7884.5,4513.9) | 有物品欄、Awan | 給物品對話（`J7` 17404）：Penguin Doll → 收下；Worm Food → 退回並吐槽；**Sheep Doll → 7 s+4 s 後 Sheepyship 出現在太空隨機點並在其室內生成 12 隻羊**；Suit（level 7）→ "Wear it?"；其他 → 退回。可被突變體 Devour（+25 EP） |
| Snoeglay h02E | 事件 #5 | 900 hp、14 dmg、regen 0.75、Player 12 | 帶 Hormonal Supplement |
| `-iamthesluggly` | 死亡玩家（`ke`）每人一次 | 隨機一隻 n003 改歸該玩家，ms 330、+A02I/AIl2 | 與活人聯盟狀態調整；sluggly 死亡後恢復（`p7` 17514） |
| Sluggly Operative n008 | UO 啟用碼成功時在 `to[]` 7 個站落點生成 | 300 hp、ms 340、Player 15 | 攜 Fusion Bomb + Grenade，獵殺**持有 Black Hole Device** 的單位，跟隨距離 75（`qG` 4520、`SG` 4562） |
| Failed Experiment n000/n001 | Niffy 實驗室各 4（n001 其一掉 Sheep Doll）；Laboratory Power 時每 45 s +1 | 200 hp、無攻擊 | 突變體 Devour +25 EP |
| Failed Experiment n00B/n00C/n00D | Syllus 牢房 6（Player 12 敵對） | 200/800/300 hp | n00B、n00C 死亡爆炸（"may explode if provoked"） |
| Anomaly n002 | Minertha 1 隻（掉 Critical Care System）；事件 #6 ×12 | 5 hp、Amim、ms 65536 | Devour +125 EP（最高價值） |
| Anomaly n00A | Syllus 牢房 2 ×5 | 同上 | 被關在 `tn`（離開即拉回）；掉隨機物品（含 1% Black Hole Device）；Devour +25 |
| Spichen h04J ×6 / Overseer h04O | Syllus 牢房 5 | 300 hp 24 dmg ms 320 / 700 hp 24 dmg ms 340 | 敵對 AI（不分陣營），Calming Incense 降低被選為目標 |
| Murmusk h04P | Syllus 牢房 1 | 1500 hp、90 dmg、ms 200 | 敵對 AI（隊伍 MURMUSK） |
| 地球動物 | Syllus 牢房 3 | Chicken/Frog/Rabbit/Sheep/Stag | Devour +25 |
| Pirates | 海盜船：Captain h02C（800 hp）、Pirate h02D ×3（250 hp）、Sentry Gun h01Z ×3 | Player 12 | 海盜事件 |
| Freakman h018 | Minertha (11678,9460.5)，Player 12 | 600 hp、32 dmg | 掉 Portal Device |
| Fel Fox n004 | Minertha (11040,2515.5) | 800 hp、29 dmg、regen 25、Lord of Flames、永久隱形 Apiv | 掉 Penguin Doll（作者彩蛋） |
| Scientist h025 ×9 / Unknown Entity h026 ×4 | UO 室內 | Avul 不動 / Aloc 隱形 10 dmg/2 s | 氛圍與危害 |
| Pacification Bot h04A | Niffy (-14594.7,-6775) | 2000 hp、34 dmg、Rocket Reserves、Prism Rockets | 只在 Laboratory Power 期間啟動（§4.4） |
| Time Zombie n00E / Tactical n00F | 外星人能力 A08B 召喚（非預置） | 400 hp 79 dmg / 100 hp 39 dmg | 另一份報告 |
| Defense Drone h00B ×2 | Niffy | §2.3 | 玩家可駕駛 |

**UO 黑洞彩蛋**（`v3v` 18358）：在聊天群組指令中輸入某個雜湊比對字串（`StringHash(";"+群組+" "+前15字+")")==-0x4BD6D59B`，原字串未能還原）並附上 UO 內顯示的 4 位數啟用碼，且蟲洞事件已發生、遊戲時間 ≥ **2700 s** → "Protocol accepted. Test device now active."：在 Errun (11606.7,-3125) 生成 **Black Hole Device I01F**，並在 7 個站落點生成 Sluggly Operative；啟用碼失效。過早 → "Device power compromised. Power restored in X seconds."

**Black Hole Device**（`Dz` 14043、`Tz` 14228、`Sz` 14202）：放置 h02J（並殺死 Errun 重力裝置 `gc`）→ 10 s 倒數 → 4.2 s 後生成黑洞：若位於探索船室內則**該船立即被擊毀**；位於站內則每 0.02 s 對該站造成 80（4000 dps），並吸引 700 內單位（站已毀則 3000）。註：`lo[9..12]` 在 `Bj` 被以註冊順序覆寫（Ec,qB,sB,Vc），推斷在 Niffy 的 4 艘 Raptor 室內放黑洞會殺錯船（原作 bug）。

**Fusion Bomb**（I00N，`Hz` 14074、`VZ` 14309）：3 s 引信；同一室內 250 內 5000、550 內 200 傷害（兩者疊加，中心共 5200，與說明 TRIGSTR_1457 相符）；1800 內鏡頭震動閃白；周圍生成瓦礫 B003（需 Rubble Clearing Device）。

---

## 8. 遊戲時間軸

| 時間 | 事件 | 行 |
|---|---|---|
| 0 s | 初始化：揭露所有室內 fog、太空永久可見、註冊船、門、停泊坪；Minertha 跳到隨機軌道點；Fusion Bomb 工廠工作動畫 58 s | `CB` 23777 起、`Vj` 5603 |
| 0 s | 職業分派、出生點、決定 Calipea/Syllus/Pown 是否存在 | `e6v` 18839、`eKv` 18675 |
| 0.5 s | `Bj`：建立 `lo/Mo/to` 表；單人 → 顯示測試模式；多人 → 銷毀測試指令 | 5753 |
| 10 s | 啟用勝負判定觸發 `dN` | `Cj` 5824 |
| 25 s | 顯示 changelog 訊息 | `Ij` 5741 |
| 60 s | 首次 +1 金（之後每 60 s） | 23419 |
| 60 s | Fusion Bomb 首次可購（isst 60） | objects |
| ≤120 s | Kyo 砲轟 Defunct 成就窗口 | `ol` 7137 |
| 180 s | 禁止 `-rename` 與死亡系統投票 | `F7` 17386 |
| 180–720 s | 第一個隨機事件；之後依各事件 10–1200 s 不等，直到抽到 #16 或 #11 | `e8` 17577 |
| 420 s（7:00） | GIT（I00M）首次可購（Medical Supplies 與 GIT） | objects |
| 每 240 s | Errun 繞行 Minertha 一周 | `hQ` |
| 每 1440 s | Minertha 公轉一周 | `yq` |
| 事件 #2 後 397 s | 蟲洞關閉、UO 毀滅 | `R8` |
| 海盜控制台毀後 40 s | 海盜船自毀 | `aM` |
| ≥2700 s（45:00） | UO 黑洞啟用碼可被接受 | `v3v` |
| 3300–4200 s（55:00–70:00） | 末日：艦隊（警告後 120 s 抵達）或軌道失效 | `nb` 23491 |
| 模組 | ASAD 300 s、ATM 700 s（之後鎖定 60 s）、RUM 240 s、ARD 600 s（充能 20 s）、Refined Ore 120 s、Neurotoxin 300 s | §3.2 |
| 其他固定時長 | 探索船發射 ≈10.4 s；停靠 4 s；Board 20 s；逃生艙準備 4 s、冷卻 100 s；登船冷卻 8 s；Pown 充能 19.5 s；Swagger 降落施法 10 s、起飛 45 s；站毀致命區 300 s；EMP 停機 120 s；門故障 300–600 s | — |

**勝利/失敗**本身由另一份報告處理；唯一與世界相關的是假遊戲結束事件（#15）。

---

## 附錄 A. 主要 rect 一覽（main 21698–21905）

| 變數 | 範圍 | 用途 |
|---|---|---|
| `Ei` | (-16096,8736)–(-7584,16256) | Arbitress 室內 |
| `ji` | (-7296,13536)–(-4832,16352) | Defunct 室內 |
| `Mi` | (-16384,3424)–(-11264,8512) | Kyo 室內 |
| `Yi` | (-16384,-9952)–(2624,2624) | Niffy 室內 |
| `Da` | (-16384,-16384)–(736,-10528) | Swagger 室內 |
| `ha` | (3648,-13280)–(5056,-11712) | UO 室內 |
| `ja` | (1312,-15424)–(2240,-11904) | 海盜船室內 |
| `Ga` | (3616,1600)–(11872,10688) | Minertha 表面 |
| `fn` | (8704,-4576)–(12416,-1024) | Errun 表面 |
| `mn` | (-7104,10784)–(-5056,12992) | Calipea 室內 |
| `qn` | (-4288,4064)–(1280,10624) | Syllus 室內 |
| `aV` | (-7200,8064)–(-5024,10176) | Pown 室內 |
| `IV` | (-9728,2688)–(-5344,7424) | Overlord 室內 |
| `Ci` `Fi` `xa` `ia` | (11712,15072)–(12832,16192)、(11808,13824)–(12768,14816)、(10080,15040)–(11168,16288)、(10144,13856)–(11136,14848) | Niffy Raptor #9–#12 室內 |
| `ka` `La` | (8352,15136)–(9280,16032)、(8352,13856)–(9280,14784) | Arbitress Raptor #13–#14 |
| `pa` `Pa` | (6432,15136)–(7360,16096)、(6432,13856)–(7360,14784) | Swagger Raptor #15–#16 |
| `Ta` | (4672,13760)–(5792,16096) | Hunter |
| `Wa` `Ya` | (3008,14528)–(4096,16128)、(1408,14624)–(2432,16160) | Obda #18、#19 |
| `En` | (-3648,12864)–(-832,15616) | Albadar |
| `bn` | (-96,14752)–(832,15712) | Sheepyship |
| 探索船 entry / panel | Raptor#9 `Di`/`ci`、#10 `gi`/`Gi`、#11 `ra`/`oa`、#12 `aa`/`na`、#13 `Ka`/`la`、#14 `ma`/`Ma`、#15 `qa`/`Qa`、#16 `sa`/`Sa`、Hunter `ua`/`Ua`、Obda#18 `wa`/`ya`、#19 `Za`/`za`、Albadar `nn`/`Vn`、Sheepy `Bn`/`cn` | `KS` 10208、`J7` |
| `di` / `ga` / `Ln` / `Ha` / `fi` | 太空 / 海盜生成區 (7616,-16320)–(16384,-7328) / 小行星生成帶 (6592,-16160)–(16320,-16128) / 蟲洞點 (15808,-7968)–(16032,-7808) / 倉庫 | |

停泊坪座標（`DTrx`，21922–21972）：P1 (-14976,12672)、P2 (-14976,12160)、P3 (-8064,12672)、P4 (-8064,12160)、P5 (-5312,15680)、P6 (-5312,15168)、P7 (-12928,7616)、P8 (-12928,7168)、P34 (-12928,6784)、P9 (-4608,-3200)、P10 (-4608,-1984)、P11 (-4608,-2624)、P12 (-2240,-3712)、P13 (256,-2560)、P14 (256,-1920)、P15 (256,-1280)、P16 (-1600,-3712)、P29–33 (-15872, -4928/-5504/-6080/-6656/-7232)、P17 (-192,-12096)、P18 (-192,-12608)、P19 (-192,-14016)、P20 (-192,-14528)、P39 (-2496,-11328)、P40 (-2496,-15296)、P21–24 y=9600 x=4992/6272/6912/8192、P35 (4992,8320)、P36 (6912,8320)、P37 (6272,8320)、P38 (8192,8320)、P25 (3840,-11968)、P26 (3840,-12480)、P27 (1536,-14592)、P28 (1536,-15104)、P45 (1536,-14080)、P46 (1536,-13568)、P41 (9728,-1728)、P42 (10304,-1728)、P43 (11136,-3968)、P44 (11712,-3968)、P47 (-3008,9856)、P48 (0,9856)、P49 (768,9856)、P50 (768,8832)、P51 (-3840,9856)、P52 (-3840,8768)、P53–57（B009）(-8960,4608)/(-8256,3776)/(-7552,3648)/(-6720,3776)/(-6272,4288)。

## 附錄 B. 預置單位表（全部 CreateUnit 字面座標；機器可讀版 `placements.json`）

函式：`Pf` 3135（Player 15 商店/設施）、`pf` 3097（Player 12 敵對）、`qf` 3222（Player 15 其餘）、`mf` 3089（Player 0 出生 dummy；`CreatePlayerUnits` 3461 為未被呼叫的重複），皆由 main 21994–21997 呼叫。owner：0=Player 1、12=Player 13 敵對、15=Neutral Passive。

**Space layer（12）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h003 | U.S.I. Arbitress | MB | 14236.8 | -8238 | 345.17 | 15 | 3232 |
| h005 | Defunct Station | tB | 15028.6 | -13410.3 | 237.25 | 15 | 3237 |
| h007 | Kyo Station | uB | 7809.9 | -12085.6 | 0 | 15 | 3239 |
| h009 | U.S.I. Queen Niffy | UB | 9715.5 | -8272.5 | 0 | 15 | 3240 |
| h00X | U.S.I. Swagger | Rc | 9336.7 | -14374.2 | 107.38 | 15 | 3254 |
| h008 | Minertha | hc | 10173.9 | -11967.6 | 224.96 | 15 | 3387 |
| h01A | Sun | Hc | 12050.4 | -11774.9 | 15.68 | 15 | 3388 |
| h03T | Errun | bc | 10863.7 | -10295.3 | 341.43 | 15 | 3398 |
| h02Q | Albadar | ZB | 15001.8 | -14525.6 | 205.25 | 15 | 3401 |
| h04V | U.S.I. Pown | EC | 11449.9 | -15084.1 | 220 | 15 | 3451 |
| h04E | U.S.I. Calipea | aC | 14243.8 | -11157.7 | 187.17 | 15 | 3456 |
| h04T | U.S.I. Syllus | zc | 13467.5 | -14562.4 | 15 | 15 | 3458 |

**Storage/hidden area (off-map holding pen, top-right)（16）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h002 | Raptor | qB | 15544.5 | 15617.8 | 7.11 | 15 | 3234 |
| h002 | Raptor | sB | 16049.5 | 15310.8 | 259.85 | 15 | 3235 |
| h002 | Raptor | Vc | 15621.4 | 15280.9 | 194.398 | 15 | 3250 |
| h002 | Raptor | Ec | 15857.3 | 15111.4 | 299.837 | 15 | 3251 |
| h029 | Unidentified Object | Mc | 14933.6 | 14934.6 | 224.29 | 15 | 3327 |
| h02B | Pirate Vessel | Pc | 14877.9 | 16272.2 | 331.5 | 15 | 3328 |
| h002 | Raptor | Tc | 16300.8 | 14777.6 | 259.85 | 15 | 3333 |
| h002 | Raptor | uc | 16303.2 | 14920.6 | 259.85 | 15 | 3350 |
| h002 | Raptor | Cc | 16298.2 | 15146.9 | 259.85 | 15 | 3353 |
| h002 | Raptor | cc | 16300.6 | 15289.9 | 259.85 | 15 | 3354 |
| h03J | Sheepyship | eC | 16106.9 | 16192 | 270 | 15 | 3373 |
| h03K | Sheepyship | RC | 15954.9 | 16281.4 | 270 | 15 | 3374 |
| h02H | Hunter | Ac | 16099.1 | 15784.5 | 206.03 | 15 | 3390 |
| h02L | Obda | dc | 16295.3 | 16075.2 | 137.79 | 15 | 3392 |
| h02L | Obda | YB | 16343.5 | 16218.8 | 137.79 | 15 | 3395 |
| h02S | Albadar | vc | 15499 | 16114 | 0 | 15 | 3403 |

**U.S.I. Queen Niffy interior（48）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h00Q | Suit Vendor |  | -3840 | -3776 | 90 | 15 | 3146 |
| h00P | Suit Vendor |  | -14528 | -5888 | 180 | 15 | 3148 |
| h00G | Medical Supplies |  | -14528 | -5632 | 270 | 15 | 3162 |
| h00G | Medical Supplies |  | -7936 | -4096 | 270 | 15 | 3163 |
| h00G | Medical Supplies |  | -4608 | -1536 | 270 | 15 | 3164 |
| h00G | Medical Supplies |  | -7552 | -4096 | 270 | 15 | 3165 |
| h011 | Genetic Integrity Tester | Gc | -7808 | -6400 | 270 | 15 | 3166 |
| h014 | Fusion Bomb Factory |  | -1088 | -3712 | 270 | 15 | 3168 |
| h014 | Fusion Bomb Factory |  | -10176 | -3648 | 270 | 15 | 3169 |
| h016 | Experimental Teleport Device Factory |  | -15872 | -3968 | 270 | 15 | 3170 |
| h023 | Outpost Supplies |  | -320 | -1024 | 270 | 15 | 3174 |
| h023 | Outpost Supplies |  | -15872 | -4288 | 270 | 15 | 3175 |
| h023 | Outpost Supplies |  | -13056 | -896 | 270 | 15 | 3176 |
| h017 | Maintenance Station |  | -4096 | -3776 | 270 | 15 | 3181 |
| h00O | Suit Vendor |  | -12224 | -960 | 270 | 15 | 3182 |
| h00R | Suit Vendor |  | -11840 | -960 | 270 | 15 | 3186 |
| h02O | Escape Pod Device | ec | -10496 | -3648 | 270 | 15 | 3210 |
| h00A | Console | wB | -13058.3 | 2436.5 | 0 | 15 | 3241 |
| h00B | Defense Drone | WB | -11780.6 | 387.3 | 270 | 15 | 3242 |
| h00B | Defense Drone | yB | -12807.2 | 376.1 | 270 | 15 | 3243 |
| h001 | Raptor | rc | -4629.8 | -3198.9 | 1.83 | 15 | 3246 |
| h001 | Raptor | ic | 241.1 | -1904.4 | 1.83 | 15 | 3247 |
| h001 | Raptor | ac | -2279.9 | -3713.7 | 1.83 | 15 | 3248 |
| h001 | Raptor | nc | -1595.3 | -3675.5 | 1.83 | 15 | 3249 |
| h010 | Life Regenerator |  | -7136.7 | -4593.4 | 233.77 | 15 | 3264 |
| h010 | Life Regenerator |  | -8309.6 | -4588.9 | 342.04 | 15 | 3265 |
| e003 | Dummy (player start-point marker) |  | -345.2 | -1535.3 | 0 | 15 | 3268 |
| e003 | Dummy (player start-point marker) |  | -7759.5 | -4193.7 | 0 | 15 | 3269 |
| e003 | Dummy (player start-point marker) |  | -12645.6 | -382.9 | 0 | 15 | 3270 |
| e003 | Dummy (player start-point marker) |  | -10607.6 | -261.9 | 0 | 15 | 3271 |
| n000 | Failed Experiment |  | -11008.4 | -4733.9 | 92.233 | 15 | 3272 |
| e003 | Dummy (player start-point marker) |  | -7393.7 | -1730.8 | 0 | 15 | 3273 |
| n000 | Failed Experiment |  | -10963.5 | -4764.8 | 298.453 | 15 | 3280 |
| n000 | Failed Experiment |  | -10579.1 | -4705.5 | 281.544 | 15 | 3281 |
| e003 | Dummy (player start-point marker) |  | -3331.5 | -3600.4 | 0 | 15 | 3282 |
| e003 | Dummy (player start-point marker) |  | -15528.4 | -3997.2 | 0 | 15 | 3283 |
| n000 | Failed Experiment |  | -10543.6 | -4774.1 | 358.341 | 15 | 3284 |
| n001 | Failed Experiment |  | -10127.9 | -4715.3 | 356.87 | 15 | 3285 |
| n001 | Failed Experiment |  | -10066.4 | -4776.1 | 356.869 | 15 | 3292 |
| n001 | Failed Experiment |  | -9701.6 | -4691.6 | 356.869 | 15 | 3293 |
| n001 | Failed Experiment |  | -9703.1 | -4779.2 | 356.869 | 15 | 3296 |
| h048 | Console | oC | -6867.2 | -1149.7 | 270 | 15 | 3338 |
| h04A | Pacification Bot | rC | -14594.7 | -6775 | 183.18 | 15 | 3339 |
| h02K | Obda | Dc | -15882.1 | -4950.5 | 0 | 15 | 3393 |
| h02K | Obda | fc | -15882.9 | -7273.2 | 0 | 15 | 3394 |
| e003 | Dummy (player start-point marker) |  | -15176 | -6608.5 | 0 | 15 | 3405 |
| e003 | Dummy (player start-point marker) |  | -12081.6 | 77.3 | 0 | 15 | 3409 |
| e003 | Dummy (player start-point marker) |  | -10862.2 | -4316.7 | 0 | 15 | 3426 |

**U.S.I. Arbitress interior（15）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h00O | Suit Vendor |  | -11200 | 9152 | 180 | 15 | 3141 |
| h00R | Suit Vendor |  | -11200 | 9280 | 180 | 15 | 3143 |
| h02O | Escape Pod Device | Wc | -12160 | 13056 | 270 | 15 | 3145 |
| h023 | Outpost Supplies |  | -10816 | 13120 | 270 | 15 | 3150 |
| h017 | Maintenance Station |  | -12224 | 11712 | 270 | 15 | 3151 |
| h00G | Medical Supplies |  | -10816 | 11712 | 270 | 15 | 3152 |
| h014 | Fusion Bomb Factory |  | -11840 | 9728 | 270 | 15 | 3167 |
| h019 | Radar Station | jc | -11545.6 | 15628.2 | 270 | 15 | 3190 |
| h03Z | Metallic Fabricator | qc | -9664 | 10112 | 270 | 15 | 3199 |
| h001 | Raptor | QB | -8091.9 | 12158.2 | 1.83 | 15 | 3228 |
| h000 | Console | mB | -11514.4 | 12559.8 | 0.21 | 15 | 3230 |
| h001 | Raptor | pB | -14969.3 | 12654.1 | 1.83 | 15 | 3231 |
| e003 | Dummy (player start-point marker) |  | -8352.3 | 12431.9 | 230.258 | 15 | 3244 |
| e003 | Dummy (player start-point marker) |  | -11386.8 | 9459.6 | 0 | 15 | 3266 |
| e003 | Dummy (player start-point marker) |  | -11530.8 | 15337.2 | 0 | 15 | 3267 |

**Kyo Station interior（7）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h00P | Suit Vendor |  | -14400 | 6784 | 180 | 15 | 3171 |
| h00G | Medical Supplies |  | -11584 | 3776 | 270 | 15 | 3173 |
| h023 | Outpost Supplies |  | -12928 | 3776 | 270 | 15 | 3179 |
| h049 | LQ Storage | wc | -11776 | 7360 | 270 | 15 | 3180 |
| h02O | Escape Pod Device | kc | -13696 | 5184 | 270 | 15 | 3188 |
| h014 | Fusion Bomb Factory |  | -15744 | 4416 | 270 | 15 | 3212 |
| h006 | Console | TB | -15145.7 | 6876.8 | 0 | 15 | 3238 |

**U.S.I. Swagger interior（18）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| e003 | Dummy (player start-point marker) |  | -9323 | -11696.6 | 209.461 | 0 | 3095 |
| h017 | Maintenance Station |  | -3200 | -11904 | 270 | 15 | 3177 |
| h023 | Outpost Supplies |  | -3200 | -14720 | 270 | 15 | 3178 |
| h02O | Escape Pod Device | xc | -11904 | -11968 | 270 | 15 | 3195 |
| h014 | Fusion Bomb Factory |  | -12032 | -14592 | 270 | 15 | 3196 |
| h00G | Medical Supplies |  | -4800 | -14656 | 270 | 15 | 3197 |
| h00G | Medical Supplies |  | -4800 | -11968 | 270 | 15 | 3198 |
| h00P | Suit Vendor |  | -9472 | -15360 | 270 | 15 | 3200 |
| h00Q | Suit Vendor |  | -9216 | -15360 | 270 | 15 | 3202 |
| h00O | Suit Vendor |  | -9472 | -11264 | 270 | 15 | 3204 |
| h00R | Suit Vendor |  | -9152 | -11264 | 270 | 15 | 3206 |
| h00Y | Console | Ic | -15030.1 | -13317.7 | 90 | 15 | 3255 |
| e003 | Dummy (player start-point marker) |  | -647.1 | -14281.9 | 145.463 | 15 | 3256 |
| e003 | Dummy (player start-point marker) |  | -683.9 | -12347.9 | 208.692 | 15 | 3257 |
| e012 | DummyLandedTeleporter | xC | -7143.6 | -13306.4 | 353.48 | 15 | 3276 |
| h001 | Raptor | sc | -194.2 | -14028.3 | 1.83 | 15 | 3357 |
| h001 | Raptor | Qc | -213.9 | -12106.4 | 1.83 | 15 | 3358 |
| e003 | Dummy (player start-point marker) |  | -9330.1 | -15088.9 | 0 | 15 | 3408 |

**Minertha surface（37）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h018 | Freakman |  | 11678 | 9460.5 | 260.09 | 12 | 3116 |
| h00P | Suit Vendor |  | 8192 | 3456 | 220.888 | 15 | 3153 |
| h00O | Suit Vendor |  | 8192 | 3584 | 90 | 15 | 3155 |
| h00G | Medical Supplies |  | 8320 | 3584 | 270 | 15 | 3157 |
| h017 | Maintenance Station |  | 8896 | 3520 | 270 | 15 | 3158 |
| h014 | Fusion Bomb Factory |  | 8896 | 4160 | 270 | 15 | 3159 |
| h00R | Suit Vendor |  | 8320 | 3456 | 0 | 15 | 3160 |
| h019 | Radar Station | Jc | 10246.4 | 6316.2 | 270 | 15 | 3189 |
| n003 | Sluggly |  | 6404.5 | 5184.5 | 98.254 | 15 | 3258 |
| n003 | Sluggly |  | 8321.4 | 6625.5 | 285.137 | 15 | 3260 |
| n003 | Sluggly |  | 10400.1 | 9341.2 | 90.31 | 15 | 3262 |
| n003 | Sluggly |  | 11530.6 | 8271.8 | 115.393 | 15 | 3274 |
| n003 | Sluggly |  | 6532 | 2378.4 | 152.274 | 15 | 3277 |
| e003 | Dummy (player start-point marker) |  | 8592.8 | 4050.6 | 0 | 15 | 3279 |
| n003 | Sluggly |  | 11389.9 | 2495.1 | 0.549 | 15 | 3290 |
| n003 | Sluggly |  | 11373.9 | 4807.7 | 0.549 | 15 | 3294 |
| n002 | Anomaly |  | 4869.4 | 2919.3 | 351.13 | 15 | 3297 |
| e012 | DummyLandedTeleporter | Bc | 7469.5 | 6053.6 | 353.48 | 15 | 3302 |
| n003 | Sluggly |  | 6409.1 | 2485.4 | 0.549 | 15 | 3304 |
| n003 | Sluggly |  | 10145.6 | 2080.4 | 0.549 | 15 | 3306 |
| n003 | Sluggly |  | 11362.8 | 7666.7 | 0.549 | 15 | 3308 |
| n003 | Sluggly |  | 9162.3 | 9343.8 | 0.549 | 15 | 3310 |
| n003 | Sluggly |  | 9443.2 | 9955.6 | 0.549 | 15 | 3314 |
| n003 | Sluggly |  | 6059.2 | 8835.6 | 0.549 | 15 | 3329 |
| n003 | Sluggly |  | 4727.1 | 5829.8 | 0.549 | 15 | 3331 |
| n003 | Sluggly |  | 4467.3 | 3875.1 | 0.549 | 15 | 3334 |
| n003 | Sluggly |  | 4020.3 | 1770.6 | 0.549 | 15 | 3336 |
| n004 | Fel Fox |  | 11040 | 2515.5 | 238.81 | 15 | 3345 |
| n003 | Sluggly |  | 4766.2 | 9085.8 | 0.549 | 15 | 3360 |
| n003 | Sluggly |  | 5279.5 | 7747.4 | 0.549 | 15 | 3362 |
| n003 | Sluggly |  | 8399.6 | 6998.4 | 0.549 | 15 | 3364 |
| n003 | Sluggly |  | 4784.1 | 5631.4 | 193.887 | 15 | 3366 |
| n003 | Sluggly |  | 6039 | 4937.2 | 0.549 | 15 | 3368 |
| n003 | Sluggly |  | 5152.6 | 3416.4 | 0.549 | 15 | 3370 |
| h02I | Hunter | Nc | 6922.8 | 8278.4 | 90 | 15 | 3375 |
| h03O | Swagger | Lc | 7349.7 | 6069.8 | 340.74 | 15 | 3397 |
| n006 | Sluggly | Fc | 7884.5 | 4513.9 | 21.303 | 15 | 3404 |

**Errun surface（3）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h012 | Gravitational Control Device | gc | 10304 | -4096 | 270 | 15 | 3213 |
| h04B | Console | iC | 11378.8 | -2097.5 | 2.23 | 15 | 3359 |
| n003 | Sluggly |  | 10859.3 | -3009.6 | 98.254 | 15 | 3399 |

**U.S.I. Syllus interior（51）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| n00B | Failed Experiment |  | 132.8 | 7734.3 | 300.65 | 12 | 3121 |
| n00B | Failed Experiment |  | 114.2 | 7370.4 | 350.387 | 12 | 3122 |
| n00B | Failed Experiment |  | 190.7 | 7699.8 | 13.129 | 12 | 3123 |
| n00B | Failed Experiment |  | -89.8 | 7498 | 60.91 | 12 | 3124 |
| n00B | Failed Experiment |  | -67.8 | 7296.7 | 191.783 | 12 | 3125 |
| n00B | Failed Experiment |  | 295.2 | 7296.7 | 39.299 | 12 | 3126 |
| n00B | Failed Experiment |  | 238.9 | 7573.2 | 177.973 | 12 | 3127 |
| n00C | Failed Experiment |  | 105.9 | 7459.2 | 107.856 | 12 | 3128 |
| n00C | Failed Experiment |  | 305.6 | 7712 | 331.742 | 12 | 3129 |
| n00D | Failed Experiment |  | 323.5 | 7535.1 | 207.835 | 12 | 3130 |
| n00D | Failed Experiment |  | 49.2 | 7565.5 | 1.637 | 12 | 3131 |
| n00D | Failed Experiment |  | 69 | 7757.4 | 280.995 | 12 | 3132 |
| n00D | Failed Experiment |  | 328.5 | 7346.7 | 76.149 | 12 | 3133 |
| h02O | Escape Pod Device | yc | -1856 | 8576 | 270 | 15 | 3216 |
| h023 | Outpost Supplies |  | -832 | 8064 | 270 | 15 | 3217 |
| h00G | Medical Supplies |  | -2240 | 8064 | 270 | 15 | 3219 |
| h04S | Maintenance Station |  | -1088 | 8576 | 270 | 15 | 3220 |
| h04I | Console | XC | -1484.6 | 9428.8 | 0 | 15 | 3229 |
| n00A | Anomaly |  | -3400.9 | 5896.5 | 315.71 | 15 | 3340 |
| h04O | Spichen Overseer |  | 331.8 | 5853.6 | 220.71 | 15 | 3376 |
| n00A | Anomaly |  | -3353.2 | 6161.3 | 315.71 | 15 | 3377 |
| n00A | Anomaly |  | -3032.3 | 6086.8 | 315.71 | 15 | 3382 |
| n00A | Anomaly |  | -3039.9 | 5775.9 | 315.71 | 15 | 3410 |
| n00A | Anomaly |  | -3151.9 | 5792.2 | 315.71 | 15 | 3415 |
| n003 | Sluggly |  | -82.2 | 4354.6 | 48.887 | 15 | 3420 |
| n003 | Sluggly |  | -136.1 | 4800.6 | 98.254 | 15 | 3422 |
| n003 | Sluggly |  | -98.4 | 4651.5 | 269.61 | 15 | 3424 |
| n003 | Sluggly |  | 16.8 | 4354.2 | 215.702 | 15 | 3427 |
| n003 | Sluggly |  | 378.9 | 4337.4 | 326.391 | 15 | 3429 |
| n003 | Sluggly |  | -8.8 | 4822.1 | 315.542 | 15 | 3431 |
| n003 | Sluggly |  | 142.6 | 4632.6 | 221.473 | 15 | 3433 |
| nech | Chicken (critter) |  | -3059.8 | 4416.4 | 257.363 | 15 | 3435 |
| nech | Chicken (critter) |  | -3030.3 | 4596.3 | 257.56 | 15 | 3436 |
| nech | Chicken (critter) |  | -3122.2 | 4619.5 | 257.483 | 15 | 3437 |
| nech | Chicken (critter) |  | -3314.4 | 4338.7 | 193.255 | 15 | 3438 |
| nfro | Frog (critter) |  | -2949.5 | 4708.8 | 312.516 | 15 | 3439 |
| necr | Rabbit (critter) |  | -3207.7 | 4441.5 | 285.587 | 15 | 3440 |
| necr | Rabbit (critter) |  | -3434.3 | 4411.5 | 23.369 | 15 | 3441 |
| necr | Rabbit (critter) |  | -3087.8 | 4340.9 | 112.492 | 15 | 3442 |
| nshe | Sheep (critter) |  | -3137.4 | 4699.3 | 267.426 | 15 | 3443 |
| nshe | Sheep (critter) |  | -3007.4 | 4787.7 | 124.149 | 15 | 3444 |
| nshe | Sheep (critter) |  | -3238 | 4788.4 | 313.351 | 15 | 3445 |
| nder | Stag (critter) |  | -3016 | 4520.4 | 317.086 | 15 | 3446 |
| h04J | Spichen |  | -26.2 | 5759.6 | 343.179 | 15 | 3447 |
| h04J | Spichen |  | 189.3 | 5819.1 | 176.039 | 15 | 3448 |
| h04J | Spichen |  | 334.4 | 5953.8 | 27.445 | 15 | 3449 |
| h04J | Spichen |  | -100.5 | 5826.5 | 343.179 | 15 | 3452 |
| h04J | Spichen |  | 114.9 | 5886.1 | 176.039 | 15 | 3453 |
| h04J | Spichen |  | 260 | 6020.7 | 27.445 | 15 | 3454 |
| h04R | Console | Zc | -1475.2 | 8824.7 | 180 | 15 | 3455 |
| h04P | Murmusk | OC | -3177.6 | 7510.9 | 37.5 | 15 | 3459 |

**U.S.I. Calipea interior（3）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h00G | Medical Supplies |  | -6592 | 12608 | 270 | 15 | 3215 |
| h02O | Escape Pod Device | nC | -6848 | 12544 | 270 | 15 | 3218 |
| h04F | Console | VC | -6063.5 | 12873.4 | 0 | 15 | 3457 |

**U.S.I. Pown interior（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h04U | Console | Yc | -6316.2 | 8988.4 | 270 | 15 | 3450 |

**Overlord interior (mutant T4)（3）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h04X | Overlord Hive | IC | -7488 | 7168 | 270 | 15 | 3184 |
| h04X | Overlord Hive | AC | -8704 | 6400 | 270 | 15 | 3191 |
| h04X | Overlord Hive | NC | -6016 | 6336 | 270 | 15 | 3193 |

**Unidentified Object interior（13）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h026 | Unknown Entity |  | 4804 | -12817 | 32.28 | 15 | 3312 |
| h025 | Scientist |  | 4584.8 | -12464.7 | 224.344 | 15 | 3313 |
| h025 | Scientist |  | 4374.7 | -12748.2 | 305.876 | 15 | 3316 |
| h025 | Scientist |  | 4735.4 | -12917.6 | 171.476 | 15 | 3317 |
| h025 | Scientist |  | 4306.9 | -12450.5 | 301.11 | 15 | 3318 |
| h025 | Scientist |  | 4484.2 | -12223.2 | 99.403 | 15 | 3319 |
| h025 | Scientist |  | 4702.6 | -12254 | 121.144 | 15 | 3320 |
| h025 | Scientist |  | 4127.3 | -12192.7 | 9.14 | 15 | 3321 |
| h025 | Scientist |  | 4734.9 | -12134 | 310.419 | 15 | 3322 |
| h025 | Scientist |  | 4309.2 | -12935.9 | 342 | 15 | 3323 |
| h026 | Unknown Entity |  | 4216.2 | -12903.8 | 32.28 | 15 | 3324 |
| h026 | Unknown Entity |  | 4735.9 | -12326.3 | 32.28 | 15 | 3325 |
| h026 | Unknown Entity |  | 4268.6 | -12007.3 | 32.28 | 15 | 3326 |

**Pirate Vessel interior（8）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h02A | Console | pc | 1759.4 | -11992.8 | 0 | 12 | 3103 |
| h01Z | Sentry Gun |  | 2086.3 | -14783.1 | 181.181 | 12 | 3104 |
| h01Z | Sentry Gun |  | 2017.3 | -12236.3 | 274.664 | 12 | 3105 |
| h01Z | Sentry Gun |  | 1493.8 | -12179.2 | 274.746 | 12 | 3106 |
| h02C | Pirate Captain |  | 1757.7 | -12160.4 | 90 | 12 | 3107 |
| h02D | Pirate |  | 1922.4 | -13471.8 | 37.508 | 12 | 3113 |
| h02D | Pirate |  | 2018.6 | -13554.4 | 259.066 | 12 | 3114 |
| h02D | Pirate |  | 1881.7 | -15202.2 | 304.495 | 12 | 3115 |

**Albadar interior (ZB)（3）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h017 | Maintenance Station |  | -3264 | 13504 | 270 | 15 | 3211 |
| h00G | Medical Supplies |  | -1216 | 13504 | 270 | 15 | 3214 |
| h004 | Console | zB | -2237.7 | 15209.1 | 0 | 15 | 3402 |

**Hunter interior (Ac)（3）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h00G | Medical Supplies |  | 5568 | 14720 | 270 | 15 | 3208 |
| h017 | Maintenance Station |  | 5568 | 14912 | 270 | 15 | 3209 |
| h004 | Console | lc | 5240.2 | 15893 | 0 | 15 | 3391 |

**Obda #18 interior (YB)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | Kc | 3577.5 | 15905.7 | 0 | 15 | 3406 |

**Obda #19 interior (dc)（2）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | oc | 1921.6 | 15910.7 | 0 | 15 | 3396 |
| e003 | Dummy (player start-point marker) |  | 1926.1 | 15560.9 | 0 | 15 | 3407 |

**Raptor #10 interior (sB)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | SB | 12293 | 14634.7 | 0 | 15 | 3233 |

**Raptor #11 interior (Vc)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | Xc | 10608.6 | 15904.5 | 0 | 15 | 3252 |

**Raptor #12 interior (Ec)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | Oc | 10617.7 | 14610.4 | 0 | 15 | 3253 |

**Raptor #13 interior (Tc)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | Uc | 8827.6 | 15916.2 | 0 | 15 | 3351 |

**Raptor #14 interior (uc)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | mc | 8827.4 | 14640 | 0 | 15 | 3352 |

**Raptor #15 interior (Cc)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | tc | 6919.3 | 15902.1 | 0 | 15 | 3355 |

**Raptor #16 interior (cc)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | Sc | 6919.1 | 14625.9 | 0 | 15 | 3356 |

**Raptor #9 interior (qB)（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | PB | 12277.9 | 15908.4 | 0 | 15 | 3236 |

**Sheepyship interior（1）**

| rawcode | 名稱 | 變數 | x | y | 朝向 | owner | 行 |
|---|---|---|---|---|---|---|---|
| h004 | Console | vC | 382.4 | 15585.8 | 0 | 15 | 3372 |