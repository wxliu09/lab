# Metastasis 1.8.2 — JASS 核心規則逆向報告

> 來源：`docs/research/_raw/war3map.j`（用 `python3 -I tools/extract_all.py` 產生）（下稱 J，行號皆為原檔行號）、`war3map.wts`（TS = TRIGSTR 編號）、`objects.json`（OD）。
> 已排除外掛注入的作弊包（1–2200 行的 `Cheatz/DirectCheat/CheatUse/...`、21391–21398 的 `ICHEAT/CHEATS` 註冊、`-PICCOLO`、`-share/-ally` 等指令）。
> 標記「推斷」者為根據程式碼推論、非直接讀到的行為；其餘皆附行號。
> 全域變數對照（已確認/修正）：
>
> | 變數 | 意義 | 證據 |
> |---|---|---|
> | `Bv` | 外星人玩家（預設 `Player(15)`） | 22167、18871 |
> | `cv` | 突變體玩家（預設 `Player(15)`） | 22168、18876 |
> | `Cv` | 機器人（Android）玩家（預設 `Player(13)`） | 22169、18864 |
> | `Av/Nv/bv` | 本局是否有外星人 / 突變體 / 機器人（初始皆 true） | 22164–22166 |
> | `A[1+pid]` | 玩家主單位；外星形態時 `A[Bv]=A[15]=Se` | 5596、20186–20188 |
> | `Se` | 外星人目前的「外星形態」單位（或繭） | 20186、20432 |
> | `lv[i]` / `Lv[i]` | 玩家 i 是外星 spawn / 突變 spawn | 17182、17166 |
> | `ke` | 死亡玩家 force（觀戰者） | 17309、17318 |
> | `Kx` / `kx` / `Qo` | 外星人 / 突變體 / 機器人 EP | 19414–19446 |
> | `Player(14)`（`$E`） | 名為 "Alien" 的中立玩家，外星形態單位屬於它 | 5626、20182 |
> | `G` | 地圖右上角「暫存區」rect `fi` 中心（未使用的單位都丟這裡） | 5610、21713 |
> | `di` | Rect(6560,-16384,16384,-6560) = 太空區域 | 21711 |
> | `Gc` | Genetic Integrity Tester（h011）@(-7808,-6400) | 3166 |
> | `MB` | U.S.I. Arbitress（h003） | 3232 |
> | `qc` | Metallic Fabricator（h03Z）@(-9664,10112) | 3199 |

---

## 1. 遊戲設置與角色分配

### 1.1 時間軸
| 時間 | 事件 | 行號 |
|---|---|---|
| init | `Vj`：`Tr=bj_isSinglePlayer`；所有玩家互相結盟（含 Player14）；每位玩家在 `G` 生成 `h00H` Personnel（=主單位 A[]）與 `H03I` Unit Selector；給每位玩家隨機大量 lumber | 5603–5633、5594–5599、5601 |
| init | `Db→eAv`：建立職業表（見 §2） | 23810、18581–18611 |
| 0.0 s | `aX→Oj`：所有玩家 lumber 歸零（lumber 之後被用來顯示 EP） | 22308、5735–5740 |
| 0.0 s | `Fb→e6v`：**角色分配**（立即，不延遲），接著 `TriggerExecute(fb)` → `eKv` 職業分配與傳送 | 23530–23531、18839–18901 |
| 0.5 s | `VX→Bj`：開啟 `-rename`；若單人模式顯示 TS4372 並保留測試指令，否則刪除所有測試指令 trigger | 22314、5753–5822 |
| 10 s | `EX→Cj`：Enable 勝負判定 trigger `dN` | 22317、5824–5827 |
| 25 s | 版本/官方來源提示 | 22311、5741–5745 |
| 每 1 s | `Mb→oGv`：EP 結算（從地圖一開始就跑） | 23554–23555、19414 |
| 180 s | `jN→F7`：關閉 `-rename` 與 `-vote death` | 23389、17386–17391 |
| 420 s | GIT 試劑（I00M）開始在商店出現（stock start delay） | OD I00M `isst=420` |

### 1.2 依人數決定陣營（`e6v`，18839–18901）
`Iv` = 所有 `PLAYER_SLOT_STATE_PLAYING` 的玩家（`emv` 18718–18723）。

| 參與人數 | 外星人 | 突變體 | 機器人 | 程式 |
|---|---|---|---|---|
| ≤0（實際不可能） | — | — | — | 顯示 "Less than 4 players… Testing mode enabled" 後 return（`eqv` 是 `<=0`，等同死碼） 18733、18843–18845 |
| 1–4 | 50% 有 | 50% 有（兩者擇一，只有一個邪惡角色） | 無 | `ePv` `<=4` → `bv=false`；`GetRandomInt(1,2)==1` 則 `Nv=false` 否則 `Av=false` 18730、18847–18853 |
| 5–6 | 有 | 有 | 無 | `eMv` `<7` → `bv=false` 18724、18855–18856 |
| 7–12 | 有 | 有 | 有 | 否則 `qr=GetRandomInt(1,3)`（控制額外太空站，見 1.4）；`eQv` 是 `GetRandomInt(1,1)==1` → 恆真，必有機器人 18736、18858、18862–18869 |

> 修正：介紹帖的分段（1–4 / 5–9 / 10–12）與程式不符；程式門檻是 **≤4 與 <7**。

抽選順序（皆從 `Iv` 隨機抽、抽後移除，故不會重複）：先機器人 `Cv`（18864）→ 外星人 `Bv`（18871，並 `SetPlayerAllianceStateBJ(Player14,Bv,5)` 讓外星人可控制 Player14 的單位）→ 突變體 `cv`（18876）。

分配後：
- 每位玩家收到 30 秒橫幅 "YOU ARE THE MUTANT/ALIEN/ANDROID/HUMAN"；三個特殊角色的 food cap 設為 100（用來顯示 EP 進度條）（`ewv` 18757–18774）。
- `eKv` 職業分配（§2）→ 傳送到出生點（`e2v` 18801–18827）：
  - 外星人主單位加 `A02O` Alien Form（18817–18819）
  - 突變體加 `A05M` Devour，並生成 `e031` 冷卻 dummy（12 秒 Devour 共享 CD 用）（18820–18823）
  - 機器人加 `A05Z` Android（純說明用 aura）（18824–18826）
- 角色與職業**互相獨立**：任何職業都可能是外星人/突變體/機器人，只是開場劇情（bio）不同（§2.3）。

### 1.3 出生點
- 隨機出生點 = 所有 `e003` Dummy 單位位置（`sv=fD('e003')` 18884）；抽一個就 Remove（不重複）（18802–18808）。`e003` 共 19 個：`mf` 3095（1 個）＋ `qf` 3244–3426（18 個）。
- 固定出生點（`Gv[]` 先被職業函式寫入，`eYv` 檢查 X==0 才隨機，18783–18785）：Ace (-2252,14431)（19123）、Captain (-14714,-13302)（19193）、Engineer (-6016,11980)（**僅當 qr==1**，19084–19087）。

### 1.4 依人數/qr 開放的額外太空站（`eKv` 18691–18713）
| 站 | 開放條件 | 否則 |
|---|---|---|
| Calipea（`aC`, h04E） | `hr or Tr`（hr = 有 Engineer 且 qr==1，19084–19087）→ `DO→IM` 8165 | `RemoveUnit(aC)`＋刪相關 trigger 18694–18697 |
| Syllus（`zc`, h04T） | 全體玩家數 `>=11`（`ekv` 18672）或 `qr==2` 或 Tr → `jO→WM` 8399 | `JO→zM` 移除 8427 |
| Pown（`EC`, h04V） | `>=11` 或 `qr==3` 或 Tr → `sO→AP` 8794 | `SO→BP` 移除 8804 |

> 推斷：`ekv` 用的是 `CountPlayersInForceBJ(bj_FORCE_ALL_PLAYERS)`，在標準 Blizzard.j 中這個 force 由 `ForceEnumPlayers(null)` 建立、包含全部 16 個 slot（含空位與中立），因此 `>=11` 可能**恆真**，Syllus 與 Pown 實際上永遠開放。同一個計數也用在死亡投票門檻（§10.1）。

### 1.5 中途離開與角色補位（`j6`，17042–17083；`H6` 17034–17041）
- 離開者：`yx[]=true`、廣播 "has left the game!"、殺死主單位並加 `A02T` And Stay Dead（17045–17048）。
- **僅在開局 ≤90 秒內**（`TimerGetElapsed(Go)<=90`），且離開者是外星人/突變體/Player14 或機器人時（17049）：
  - 從「非 `uf()` 玩家」（`uf` = 非外星陣營、非突變陣營、非機器人，3485–3491）隨機抽一人補位：
    - 突變體："Reassigning a new mutant..." → 新 `cv`，私訊 "You are now the mutant…"（17050–17059）
    - 外星人：新 `Bv` 並與 Player14 結盟（17061–17071）
    - 機器人：新 `Cv`（17072–17081）
  - 抽不到人時廣播 "Not enough players for a new mutant/alien/android."（17058/17069/17079）
- 推斷（程式缺陷）：`H6` 迭代的是 `bj_FORCE_ALL_PLAYERS`，沒有檢查存活/在線，可能抽到死者、空位或中立玩家；補位的新外星人**不會**被加 `A02O`、新突變體不會被加 `A05M`（17056 的 e031 還用了無效的 `GetEnumPlayer()`），要等到換一次衣服（`QH` 5395–5416 會對 h00H 補上這些能力）才拿到。

### 1.6 單人測試模式
- `Tr=bj_isSinglePlayer`（5604）；`J=bj_isSinglePlayer`（5806），單人時顯示 TS4372 "SINGLE PLAYER TESTING MODE IS ENABLED / TYPE -help FOR COMMANDS"，多人則刪除所有測試 trigger（5807–5822）。
- 單人時：Calipea/Syllus/Pown 全開（18655–18670 的 `or(Tr)`）；外星/突變進化時間 2 秒而非 60 秒（19818–19822、20448–20452）。
- 測試指令（`nov` 21066–21078，皆有 `Tr` 條件）：`-help`、`-EP`（三方 EP +9999，21157–21161）、`-nowin`（刪除勝負 trigger `dN`，21176–21177）、`-mine`、`-forcerandom ##`、`-spawn ####`/`-spawncode`/`-spawnhelp`、`-forceapocalypse`、`-playerhero`、`-test_abilities`、`-hostile`。
- 單人時人數=1 → 只會有外星人或突變體其中之一（50/50），且就是玩家本人（推斷：抽完 `Bv` 後 `Iv` 已空，`cv` 會抽到 null）。

---

## 2. 人類職業

### 2.1 職業表（`eAv` 18581–18611；`gv=12`，22184）
每位有效玩家（`Iv` 中、未離開）從 12 張「職業卡」（`e000` dummy，user data 1..12）**不放回隨機抽一張**（`eKv` 18680–18688、`ecv` 18620–18625），再執行對應職業 trigger（`eCv` 18626–18629）。因此 Researcher 與 Security Guard 各有兩張卡、可能同時出現兩位。

| 卡號 | 職業 trigger→函式 | 名稱前綴 `Sv[]` | 職業能力 `hv[]` | 起始物品 | 固定出生 |
|---|---|---|---|---|---|
| 1, 2 | gb→`xXv` 18938 | `"Dr. "` | Researcher（A00X/A035/A034/A036 依 PhD，見下） | I025 Phase Cloak、I002 Emergency Medical Pack | — |
| 3, 12 | Lb→`x9v` 19272 | `"Private "` | A037 Security Guard | 隨機 1/4：I008 Plasma / I001 Rocket / I000 Tesla / I007 Cryo Suit；研究 R000 | — |
| 4 | lb→`x1v` 19233 | `"Medic "` | A02C Mend | I00L Critical Care System、I002 Emergency Medical Pack、I00M Genetic Testing Device | — |
| 5 | kb→`xuv` 19176 | `"Captain "` | A011（空白） | I00I Captain's ID Card | (-14714,-13302) |
| 6 | Kb→`xYv` 19205 | `"Janitor "` | A04B Rummage | I00J Janitor's ID Card | — |
| 7 | Gb→`xNv` 19003 | `"CEO "` | A011（空白） | 生成 H046 Robo-Butler 跟隨 | — |
| 8 | hb→`xdv` 19034 | `"Commissar "` | A011（空白） | I00G Executioner Pistol | — |
| 9 | Hb→`xhv` 19065 | `"Engineer "` | A053 Door Lock（Door Hack） | I00B Service Suit、I00H Wrench | qr==1 時 (-6016,11980) 並 `hr=true` |
| 10 | Jb→`xQv` 19148 | `"Corporal "` | A00V War Veteran Damage Bonus | I00F Augmented Leggings | — |
| 11 | jb→`xmv` 19107 | `"Ace "` | A038 Ace | 依全域 Q：1→I008 Plasma，2→I001 Rocket，3→I000 Tesla，其他→I007 Cryo | (-2252,14431) |

- 名稱：`SetPlayerName(Rv, Sv+原名)`（例：18991–18992）。
- 所有人類（含偽裝者）起始單位都是 `h00H` Personnel（5595）。職業能力在換衣服後由 `QH` 重新加上（5402–5406）。
- 推斷（Ace 物品）：`xmv` **沒有**自己 `GetRandomInt`，使用的是殘留的全域 `Q`（`ecv` 最後一位玩家的卡號，或之前 Researcher/Security 函式寫入的值），所以 Ace 的衣服不是均勻隨機，最常見是 Cryo Suit。
- Ace 的專屬戰機 Albadar `ZB`（h02Q @ (15001.8,-14525.6)，3401）：若本局沒有任何人抽到卡 11，則隱藏（`e4v` 18831–18835、18895–18899）。

### 2.2 職業特性細節
| 職業 | 能力/物品數值 | 行號/來源 |
|---|---|---|
| Researcher PhD | `Q=GetRandomInt(1,4)`；**若 Q==3 則 Q=GetRandomInt(1,2)** → Electronics 永遠不會出現。實際機率：Optics 3/8、Gravitational 3/8、Biology 1/4、Electronics 0 | 18952–18987 |
| ‧ Optics（Ke=1） | 研究 R008：sight +250（訊息 "extra sight range"）；外星/突變者提示 "only applies while you are human" | 18976–18983；OD R008 `rsig 250` |
| ‧ Gravitational（Ke=2） | 研究 R007：`rmvx` +15（訊息稱船速 +10%） | 18970–18974；OD R007 |
| ‧ Electronics（Ke=3） | 訊息稱 sentry/force shield +50 HP；程式中沒有任何地方讀 `Ke==3`（且抽不到） | 18965–18968 |
| ‧ Biology（Ke=4） | 研究 R006：`rhpr` +2（訊息 "200% health regeneration"） | 18956–18963；OD R006 |
| ‧ 職業 aura | A00X/A035/A034/A036 都是 ACba（Brilliance Aura 類）+B008，tooltip "additional energy regeneration"，數值沿用 base 預設 | OD |
| Security Guard | R000（Rhri）attack range +125；A037 只是說明 aura（Hab=0） | 19287；OD R000/A037 |
| Medic | A02C Mend（Ahea）：每次治療 6 HP、2 mana、CD 0.2 s（可自動施放） | OD A02C |
| Captain | I00I（A010，施法 1 s）：在 rect `Da`（戰艦內）使用，對 256 範圍內的 Security Door 切換鎖/開 | 13946–13988 |
| Janitor | A04B Rummage：50 mana、CD 10 s、射程 80，只能對 `LTcr` 箱子；箱子被摧毀並 `GetRandomInt(1,28)`：1 Tetrabin、2 Inventory Scanner、3 Holographic Projector、4 Santa Hat、其餘無（各 1/28） | 14651–14678；OD A04B |
| Janitor | I00J：256 範圍內 door 鎖/開；地圖上 3 個門（`fC/HC/pC`）設為 clearance='I00J'，只對持卡者開門（janitor closets） | 14004–14039、6258–6267 |
| CEO | H046 Robo-Butler：999999 HP、Avul、3 格物品欄（A063）；每 0.04 s 黏在主人 75 距離內（不進太空）；主人在外星形態/Stalker 突變/Night of Masks/Phase Cloak 時 Robo-Butler 自動隱形（Agho）；主人死亡即移除 | 19020–19023、4562–4594 |
| Commissar | I00G/A00Y：125 傷害、施法 1.5 s、CD 30 s、15 mana、射程 1400、暈 0.3 s | OD A00Y |
| Engineer | A053 Door Hack：50 mana、CD 12 s、施法 1.3 s；把 256 內未鎖的門鎖上 15 秒（`LF(Ov,30,.5)`）| 14595–14626；OD A053 |
| Engineer | I00H/A00Z Wrench：射程 500、25 mana、CD 45 s、暈 0.5 s；扳手物品被「丟」到目標位置 | 13907–13920；OD A00Z |
| Corporal | A00V：+15% 攻擊（`Ear1=0.15`）；I00F +25 移速 | OD A00V/I00F |
| Ace | A038 tooltip：駕駛的船/站 +15% 攻速；**JASS 中沒有任何實作**（推斷：僅說明或靠物件資料） | OD A038；grep 無 |

### 2.3 依身分不同的開場劇情（bio）
每個職業函式先判斷身分再顯示 30 秒文字（例：Researcher 18939–18951）。

| 職業 | 外星人 | 突變體 | 機器人 | 人類 |
|---|---|---|---|---|
| Researcher | TS530 | TS529 | TS3010 | TS754 |
| CEO | TS4301 | TS4304 | TS4302 | TS4303 |
| Commissar | TS551 | TS555 | TS3039 | TS3040 |
| Engineer | TS567 | TS563 | TS3041 | TS3042 |
| Ace | TS1720 | TS1722 | TS3043 | TS3044 |
| Corporal | TS569 | TS574 | TS3045 | TS3046 |
| Captain | TS537 | TS536 | TS3047 | TS3048 |
| Janitor | TS1674 | TS1675 | TS3049 | TS3050 |
| Medic | TS1461 | TS1470 | TS3051 | TS3052 |
| Security | TS533 | TS532 | TS3053 | TS3054 |

（外星版本＝被生物襲擊/寄生；突變版本＝誤注射血清；機器人版本＝"ICS-class android… Disguised as …"；人類版本＝綠字的謠言劇情。）

之後統一顯示「YOUR OBJECTIVES:」＋目標（`eFv` 18639–18653）：
- 突變體："-Kill everybody, or turn them into mindless drones…"
- 外星人："-Kill everybody, or turn them into spawns…"
- 機器人：TS3059（殺突變/外星與其盟友、保護人員、殺太多人會被關機、可升級、死後可在 Arbitress 復活但受復活者控制）
- 人類："-Kill the mutant, the alien, and all of their allies. Please try to protect company property."

---

## 3. 外星人（Alien）

### 3.1 人類形態 ↔ 外星形態
| 動作 | 能力 | 施法時間 | 效果 | 行號 |
|---|---|---|---|---|
| 主外星人 → 外星形態 | A02O Alien Form（條件：未被 Night of Masks 狀態 `Fx`） | 5 s | 隱藏人類單位；在原地以 **Player14 "Alien"** 名義生成目前外星形態 `se`（初始 h02M），沿用 HP%/MP%，移交 6 格物品；人類單位移到 `G` 後刪除；建立 `e00L` 商店代理 dummy `Cx`（屬於 Bv，每 0.2 s 跟著 `Se`，用來買東西） | 20171–20202、20148–20170、20206–20209 |
| 外星形態 → 人類 | A02S Human Form | 5 s | 生成新的 `h00H`（屬於 Bv），沿用 HP%/MP%，補回 A02O 與職業能力，物品移回 | 20238–20282 |
| spawn → 外星形態 | A02W | 4 s | 生成 `Qe`（目前 spawn 型）但屬於 **spawn 自己的玩家**（不匿名） | 20210–20237 |
| spawn → 人類 | A02X | 4 s | 生成 h00H，補職業能力與 A02W | 20283–20316 |

- 匿名機制：外星形態屬於 Player14（名稱 "Alien"，5626；顏色 12，13035），所以看不出是誰。
- 只有**未穿衣服**的 h00H 會被補上 A02O/A02W（`QH` 5407–5413）→ 穿著 suit 時無法變身（推斷：須先脫衣）。
- 外星形態單位類型都標記為 `mechanical`（OD `utyp=mechanical,peon`），程式用這點判斷「是否在非人形態」（例：20052、20500）。
- 外星形態單位（`Se`）死亡 → `aB/ilv`：為 Bv 生成 e000 dummy 設為主單位並立刻殺死，等同外星人死亡（20317–20328）。

### 3.2 感染 → 死亡 → 變 spawn
1. 外星各形態（含 spawn）都有 A02N **Parasite**：CD 25 s、0 mana、每秒 4.39 傷害、持續無限，只能對 `organic`（= 人類形態 h00H），buff B00H（OD A02N）。
2. 每次受傷時 `x5` 更新該單位的「感染狀態」（16355–16365）：有 B009/B01F（prion）→ `Ro=true, Io=1`；否則有 B00H/B01G（parasite）→ `Ro=true, Io=2`；否則 `Ro=false`。（prion 優先於 parasite）
3. 主單位死亡時（`Z6` 17157–17251），若 `Ro` 且非機器人、非突變陣營、非突變體本人（`t6` 17130）：
   - `Io==1`（prion）→ 變突變 spawn（§4.4）
   - 否則若非外星陣營（`P6` 17115）→ `lv=true`，在死亡處生成 `Qe`（目前 spawn 型）、**33% HP**，設為新主單位，訊息 "You have been turned into the alien's spawn!" / 給外星人 "You have acquired a spawn!"，執行 `XB→arv`（給該玩家 e00M/e00P/e015 冷卻 dummy，20617–20621）並跑勝負判定（17181–17194）。
   - 兇手是誰無關；只要死前最後一次受傷時身上有 parasite。
4. 機器人永遠不會被轉成 spawn（`t6` 的 `!=Cv`）。

### 3.3 Spawn 管理
- `-liquidate <color>` / `-l <color>`（19347–19358；`oav` 19317–19346）：外星人只能對自己的外星 spawn（`lv[Q]`）、突變體只能對突變 spawn（`Lv[Q]`）；跳出確認對話框 "Are you sure you wish to liquidate …?"，按 Yes 直接 `KillUnit(A[Q])`（19670–19674、20131–20135）。
- 預設 spawn 不能攻擊主人與同陣營：外星側 `Yb`（`r6v/r7v` 20077–20083，"You cannot attack your fellow alien!"）、突變側 `Sb`（`o0v/o1v` 19616–19622）。外星人/突變體打 `-allow` 關閉此限制、`-disallow` 恢復（19485–19514）。
- `-listaliens`（外星陣營可用）：列出所有外星 spawn 與外星人並在小地圖 ping（20102–20127）；`-listmutants` 同理（19641–19666）。
- 陣營私聊：外星陣營以 `[` 開頭的訊息只送給 Bv 與所有 `lv` 玩家，前綴 "[Alien]"（18436–18449）。
- 外星人進化時，**正在外星形態**（mechanical）的 spawn 會被替換成新 spawn 型（`aev/Cg` 20499–20501、20603–20615、4028–4057）；人類形態的 spawn 下次變身才會用新型別。

### 3.4 蛋（Egg）
| 項目 | 數值 | 行號 |
|---|---|---|
| 產生 | A05K 'Spawn Egg'（AIbb 建造 e01H），CD 10 s；只有 T1 h02M 與三種 T2 有此能力，T3 沒有 | OD A05K、單位能力表 |
| 蛋 HP | e01H 125 | OD |
| 上限 | 任何 e01H 進場時若群組 `jo` 已有 ≥3 顆則立即殺掉新蛋 | 20023–20039 |
| EP | 每顆 +0.12 EP/s | 19375–19377、19419 |
| 被摧毀 | −75 EP；若外星人此時在外星形態（mechanical）→ 兇手對 `Se` 造成 100 傷害；Player12 dummy 對 `A[Bv]` 施放 A05L Egg Death Stun（firebolt base，**1.5 s 暈**、0 傷害、射程 1400）；外星人螢幕閃爍＋音效 | 20040–20064；OD A05L |

> 暈眩施放在 `A[Bv]`（不論人類或外星形態），所以人類形態的外星人在蛋被打破時會被看到「莫名被暈」（＝tooltip 所說的暴露）。

### 3.5 進化（ESC 選單 + 繭）
- 門檻：`ze==0 且 Kx>=660` → 生成 e023 選擇器；`ze==1 且 Kx>=1370` → 依目前形態生成 e029/e028/e027（`isv` 20347–20381）。條件：按 ESC 者為 Bv、不在進化中（`Ye==false`）、外星人存活（`imv` 20329–20331）。
- 達標時提示 "…It is time to transform...Press ESC when you are ready."（19462–19471）。
- 從選擇器「訓練」形態（訓練時間 1 s，OD `ubld=1`）且主單位不在 `fi` 暫存區（`itv` 20382–20384）→ `iWv`（20397–20453）：
  - `Ye=true`、`ze++`；主單位 Avul＋暫停＋轉給中立、加 A07E（不能用逃生艙）。
  - 2 秒後在原地以 Player14 生成 **h02X Alien Cocoon**（6000 HP、無回血 `uhrt=none`、不攻擊、mechanical），物品（含已穿的 suit）移入；`Se=A[Bv]=繭`。
  - 60 秒倒數（單人 2 秒）後 `tF→EB→axv`（20502–20616）：若繭仍活著，依新形態設定 spawn 型 `Qe` 與各種冷卻 dummy，生成新形態（屬於 Player14、物品移入）、殺掉繭、廣播 "The alien has transformed! It has grown more powerful..."。
  - **繭被打死 = 外星人死亡**（`Se` 死亡觸發 `ilv`）。推斷：在人類形態下進化也會在原地冒出 Player14 的繭，等於自曝。

### 3.6 外星形態樹與數值（OD；spawn 對照 `axv` 20508–20575）
| 階 | 形態 | rawcode | HP | 回血 | 攻擊(dmg/cd/射程) | 移速 | 能力 | 對應 spawn（HP/dmg/spd） |
|---|---|---|---|---|---|---|---|---|
| T1 | Alien | h02M | 650 | 0.75 | 45 / 1.5 / 400 | 285 | Spawn Egg、Parasite、Human Form | h02N（600/41/285） |
| T2 | Energy | h035 | 700 | — | 16 / 0.5 / 600 | 285 | Spawn Egg、Energy Deflection（Nms 2.0）、Entropy（CD20、100mana、AoE300）、Parasite | h036（650/16/285，有 Energy Deflection） |
| T2 | Manipulation | h02V | 700 | 0.75 | 44 / 1.5 / 600 | 275 | Spawn Egg、Temporal Flux、Mute-ilate、Parasite | h02W（650/39/275） |
| T2 | Power | h03E | 875 | 2.0 | 49 / 1.4 / 140 | 330 | Spawn Egg、Sly Tentacles、Neurotoxic Poison、Parasite | h03F（650/32/320，有 Sly Tentacles） |
| T3（Energy→） | Combustion | h03A | 900 | 0.75 | 24 / 0.75 / 650 | 275 | Projected Explosion（CD4、45mana）、Lord of Flames（免疫核彈）、Parasite | h03B（700/19/275，Projected Explosion CD5/65mana、Lord of Flames） |
| T3（Energy→） | Electricity | h037 | 1050 | 0.75 | 65 / 1.5 / 140 | 280 | Lightning Strike（CD15、30mana、500 傷害）、Electromagnetic Disruption（CD60、100mana，鎖全站門）、Parasite | h039（800/64/280，Lightning Strike） |
| T3（Energy→） | Illusion | h03C | 700 | 0.75 | 38 / 1.0 / 650 | 275 | Blackness（CD10、30mana，目標 6 s 幾乎看不見）、Manifold（CD50、40mana，1 分身 30% 傷害，最長 10 分）、Parasite | h03D（625/34/275，Manifold：3 分身 20% 傷害、受雙倍傷，CD25/100mana） |
| T3（Power→） | Basilisk | h03G | 1700 | 1.0 | 42 / 1.0 / 140 | 295 | Petrify（CD20、70mana，共享 CD 20 s）、Neurotoxic Poison、Parasite | h03H（1300/39/295，Neurotoxic Poison） |
| T3（Power→） | Regeneration | h03P | 450 | **16** | 70 / 1.25 / 140 | 265 | Swarmbolt（30mana，80 傷/16 目標）、Regenerator Core Form（A04T，死時變 h03Q Alien Core 350HP/310 速，45 s 後回到 h03P）、Regeneration | h03R（350/60/230，regen 15，core h03S 300HP） |
| T3（Power→） | Webspinner | h03V | 1600 | 0.5 | 85 / 1.5 / 250 | 265 | Webwire（CD1、25mana，兩點拉線，≤900 距離，絆倒傷害）、Fountain of Chaos（CD20、35mana、射程900）、Parasite | h03W（1300/85/250，Webwire） |
| T3（Manip→） | Spatial Control | h031 | 850 | — | 65 / 1.5 / 600 | 280 | Spatial Relocation（CD60，隨機傳到太空）、Spatial Swap（CD20、50mana、無限射程）、Parasite | h032（850/56/260，Spatial Relocation） |
| T3（Manip→） | Temporal Control | h02Y | 850 | — | 69 / 預設 / 600 | 275 | Back from Hell（CD120、70mana）、Closed Timelike Loop（CD40）、Parasite | h030（750/59/260） |
| T3（Manip→） | Masquerader | h033 | 700 | 0.75 | 38 / 1.0 / 140 | 285 | Night of Masks（共享 CD 60 s）、Mute-ilate、Parasite | h034（600/24/285，Night of Masks） |

選擇器：e023 = {h035, h02V, h03E}；e029 = {h03A, h03C, h037}；e028 = {h02Y, h031, h033}；e027 = {h03G, h03P, h03V}（OD `utra`）。

重要能力腳本細節：
| 能力 | 腳本行為 | 行號 |
|---|---|---|
| Mute-ilate A02Y | 目標主單位玩家名稱改成極長空白（=發言無法辨識）60 秒後恢復（CD60、25mana、射程600） | 12911–12929 |
| Temporal Flux A02Z | 清除目標 buff、施 30 s 減速（A030 0.95）、為外星人產生該目標的永久幻象，目標 Avul 35 秒；共享 CD 180 s | 13284–13308 |
| Closed Timelike Loop A033 | 每 0.25 s 記錄外星人位置/類型/HP/MP/物品（40 筆 = 10 s），施放時回到 10 秒前狀態，−25 mana；Critical Care System 變成 Damaged 版；level-8 物品被移除；CD 40 s | 12733–12751、12812–12910 |
| Back from Hell A032 | 對話框列出死亡且非突變/非機器人/非突變 spawn 的玩家＋"Eldritch Beast"：選玩家→在外星人前方生成 n00E **Time Zombie**（1 HP），該玩家 `lv=true`（外星 spawn）、移出 `ke`、恢復名稱與結盟；選 Eldritch Beast→生成 h02Z（Player14）；CD 120 s | 13072–13167 |
| Petrify A045 | 目標暫停+Avul+灰色；若是主單位：`A[]=null`（**勝負判定視為死亡**）、其他單位交中立、立即跑勝負判定；任何友方人類主單位走到 100 範圍內即解除 | 13168–13238、13188–13198 |
| Night of Masks A03K | 完全變成目標（名稱、顏色、單位類型），`Fx=true`；再按 ESC 結束，HP% 取兩者平均；共享 CD 60 s | 12939–13016、13017–13071 |
| Sly Tentacles A044 | 偷目標隨機一格物品（格子空則無效） | 11889–11895 |
| Neurotoxic Poison A043 | 命中主單位造成攝影機搖晃直到 buff 結束；tauren 類（機器人）免疫 | 13239–13265 |
| Lightning Strike A03R | 對非外星陣營造成 500 傷害 | 12279–12286 |
| Projected Explosion A03V/A03X | 3 秒後同核彈傷害（半徑250內 5000、550內 +200）但**不產生瓦礫** | 12263–12278、14418–14441 |
| Lord of Flames A03U | 擁有者不受核彈/Projected Explosion 傷害 | 14275–14291 |

外星人額外 EP：任何「無辜者」（非外星/突變/機器人/兩種 spawn 的主單位）被外星人、外星 spawn 或 Player14 殺死 → +175 EP（17227–17235）。

---

## 4. 突變體（Mutant）

### 4.1 進化節奏
- 突變體起始是普通人類 h00H（有 Devour）。EP 門檻：**300** / 900 / 1800（`rRv/rOv/rEv` 19690–19701；通知 19447–19461）。
  > 修正：wts TS2423 寫 "Mutant: 340, 900, 1800 EP"，但程式第一階是 **300**（19397、19700）。
- ESC（`ub→rIv` 19702–19758；條件 `rrv` 19675：cv、`Kv==false`、存活）：
  - `jv==0 & kx>=300` → e02A {h00U Perfection, h00V Infection}
  - `jv==1 & kx>=900` → 若目前 h00V → e02C {h01O Sustained, h01I Human Development}；否則 e02B {h01B Mobility, h01E Strength}
  - `jv==2 & kx>=1800` → h01B→e02F {h01C Crab, h01D Stalker}；h01I→e02D {h01K Complete Infection, h01L Rapid Gestation}；h01O→e02E {h04G Overlord(station), h04W Overlord(ground), h01V Defiler}；h01E→e02G {h01G Flesh Golem, h01H Minotaur}
- 開始進化（`Ub→rdv` 19774–19823；條件 `rNv` 19759：主單位不在 `fi`）：`Kv=true`、`jv++`、記錄 HP% `ro`；原單位 Avul/暫停/交中立；生成 **h00T Evolving Mass**（999999 HP、Avul、**可移動 80 速**、mechanical、不可用逃生艙）作為主單位，物品與 suit 移入；**60 秒**（單人 2 秒）。
- 結束（`wb→ruv` 19890–20022）：生成新形態，HP% 還原為 `ro`（"same percentage HP"），物品移入；廣播 "The mutant has evolved! It has grown more powerful..."；所有突變 spawn（`Lv`、非機器人）替換為新 spawn 型 `zv`（19992–20003）。
- 路線旗標：選 h00U 時 `Jo=true`（perfection，之後不重置，19894–19896）；選 h01L 時 `wr=true`（可把外星人轉成突變 spawn，20016–20018）；h01G 執行 `lg`、h01V 執行 `KG`（slime trail）、h01C 開啟 `qb`（攻擊產生 Sporeling）、h01B 動畫 160%（20004–20021）。
- 突變各形態也都是 `mechanical` 且 point value 210000 → 不能穿 suit（`d4` 15967–15969）。

### 4.2 EP 來源（突變）
| 來源 | 數值 | 行號 |
|---|---|---|
| 時間 | +0.4/s（Overlord 站形態時改為 lumber +1/s，不再累積 kx） | 19427–19443 |
| 每個存活突變 spawn | +0.28/s | 19367–19374 |
| Devour A05M（射程100、CD 12 s 共享） | 目標須為 n006 Sluggly、n000/n001 Failed Experiment、n002/n00A Anomaly、nech/nfro/necr/nder/nshe 小動物；n002 Anomaly +125，其餘 +25；目標被移除 | 19541–19576 |
| Cannibalize A076（Perfection 系） | 140 範圍內每具非機器人屍體 +140 | 19577–19606 |
| 造成傷害 | 突變陣營攻擊「非突變陣營玩家的主單位」且目標不在太空：`fr[目標]+=dmg/目標MaxHP`，在 `fr<1` 時 EP += 比例 × **200**（主突變體且 `Jo`）或 × **50**（infection 路線或任何突變 spawn）；damage 先被截到目標剩餘 HP；毒傷 4.39/6.53/8.53/0 不計 | 16344–16386 |

> 傷害 EP 上限是「每個目標玩家整局累計 1 倍其 MaxHP」，所有突變陣營攻擊者共用同一個 `fr[target]`（最後一擊可能略超出）。

Failed Experiments：`aO` 每 45 秒在 rect `vn` 生成一隻 n000 或 n001（各 50%），但 `aO` 開局被停用（22505），只有某站選擇 "Laboratory Power"（A06F，`ZL` 7734–7747）後才啟用，切換到其他電力模式時又停用（7673）（`xm` 7748–7756）。地圖上另有預放的 n00B 等（3122–3126）。

### 4.3 形態表（OD；spawn 對照 `ruv` 19897–19930）
| 階 | 形態 | rawcode | HP | 回血 | 攻擊(dmg/cd/射程) | 移速 | 能力 | spawn 型 |
|---|---|---|---|---|---|---|---|---|
| T1 Perfection | Mutant | h00U | 900 | 1.0 | 37/1.0/140 | 305 | Sludge（CD15、10mana 直線）、Devour、Cannibalize | （無感染能力，無 spawn） |
| T1 Infection | Mutant | h00V | 725 | 1.5 | 38/1.0/140 | 305 | Infection A013、Devour | h00W（650/32/295，有 A013） |
| T2 Perf | Mobility | h01B | 900 | 1.0 | 32/1.0/140 | 320 | Don't Blink（CD9、3 s 加速）、Spatial Burst（CD20、閃到目標旁 50 傷）、Roar、Devour、Cannibalize | — |
| T2 Perf | Strength | h01E | 1800 | 2.0 | 100/預設/140 | 225 | Fleshies（60mana，6 隻 h01F）、Smash（CD4、35mana，拆門/秒殺）、Roar、Devour、Cannibalize | — |
| T2 Inf | Human Development | h01I | 1000 | 0.75 | 32/1.0/500 | 295 | Infection A01S、Tainted Vendor、Roar、Devour | h01J（800/37/280，A01S+Tainted Vendor） |
| T2 Inf | Sustained Development | h01O | 900 | 0.75 | 19/0.5/160 | 320 | Spiderlings（60mana，h01P 300HP）、Reabsorption（吃自己的 minion 回 100% 生命）、Roar、Devour | h01R（750/15/320） |
| T3 (Mob→) | Stalker | h01D | 1250 | 2.0 | 124/2.7/**2400** | 320 | Stalk（CD60、30 s 隱形 −20% 速）、Omniscience（20mana 給目標視野）、Roar、Devour | — |
| T3 (Mob→) | Crab | h01C | 700 | 2.5（400 MP） | 150/6.0/900 | 20 | Crabosity（移動指令改為消耗 mana 瞬移）、Panic（一次性：補滿 mana、失去一半 HP 與 33% 攻擊）、攻擊時生成 2（有 A07H 時 3）隻 n009 Sporeling | — |
| T3 (Str→) | Flesh Golem | h01G | 6000 | 0.75 | 120/預設/160 | 205 | It's Raining Rocks（CD20 丟碎石）、Rocks Fall Everyone Dies（CD30，半徑 512 一圈 36 塊瓦礫）、Smash、踩碎瓦礫 | — |
| T3 (Str→) | Minotaur | h01H | 2400 | 0.75 | 85/1.0/160 | 240 | Charge（CD15、拖行並清瓦礫）、Rolling Thunder（CD35、15 s 震波） | — |
| T3 (HD→) | Complete Infection | h01K | 1600 | 0.75 | 48/1.0/140 | 290 | Total Infection（CD60、25mana）、Blast Shield（4 s 無敵）、Vector（CD20，追蹤蟲週期性麻痺） | h01N（900/39/280，Total Infection+Blast Shield） |
| T3 (HD→) | Rapid Gestation | h01L | 1050 | 0.75 | 34/1.1/900 | 290 | Infection A01X、Carrier（CD45、30mana）、Blast Shield；設 `wr=true` | h01M（850/26/290，A01X） |
| T3 (SD→) | Defiler | h01V | 1500 | 0.75 | 75/1.5/420 | 310 | Metamorphosis（CD240、變 16 隻 h01W 蟲，60 s 後重組）、永久 slime 拖痕 | h01X（950/55/310） |
| T3 (SD→) | Overlord（太空站） | h04G | 300000 | 300 | 9000/3.0/1600 | 60 | Guardian（召喚 h04Y）、View Intestines | Harbinger h01T |
| T3 (SD→) | Overlord (GROUND) | h04W | 16000 | 4.0 | 20/0.5/160 | 0 | Roar；訓練 h022/h01S/h01U/h01T | h01Y（2000/65/250） |

感染能力（OD）：
| 能力 | 持有者 | DPS | 目標 | CD | 轉化規則 |
|---|---|---|---|---|---|
| A013 Prion Infection | h00V、h00W | 4.39 | organic only（打不到外星/突變形態與已升級機器人） | 35 | 不會轉化外星人 |
| A01S | h01I、h01J；也是 Tainted Vendor/Total Infection 的 dummy 用 | 6.53 | 含非 organic | 35 | 可傷外星人/機器人，但不轉化 |
| A01X | h01L、h01M；Carrier 的 dummy 用 | 10.0 | 含非 organic | 35 | `wr=true` 時可把外星人與外星 spawn 轉為突變 spawn |

### 4.4 突變 spawn 轉化（`Z6` 17163–17179）
主單位死亡且 `Ro`、`Io==1`、非機器人、且（`wr` 或 非外星人且非外星 spawn）→ `Lv=true, lv=false`；若死者是外星人本人則 `Bv=null`（外星人視為消失）；生成 `zv` 型、33% HP；訊息 "You have been turned into the mutant's spawn!"；跑勝負判定。突變陣營私聊 `[` 前綴 "[Mutant]"（18464–18488）。

### 4.5 Overlord 站形態（h04G）
- 進化完成時（19931–19971）：以突變體當時所在的站/船 `Be` 為基準（若是 explorer 且在駕駛則取其母站），在太空中半徑 256 內放置；若不在太空則隨機放在 `di`；設定站內 rect `IV`、`lo[27]`，把 IV 內所有單位交給突變體；Harbinger 上限 1、Carrier Sack 上限 10；**kx 設為 600、lumber 600**；物品放到站內。
- `yO→ZP`（9114–9135）：三個 Overlord Hive（h04X 5000 HP，`IC`(-7488,7168)、`AC`(-8704,6400)、`NC`(-6016,6336)，3184–3193）移除 Avul。Hive 可訓練 h01U/h01T/h022/h01S（費用以 lumber：Harbinger 140/40s、Carrier Sack 40/30s、Tentacle 80/25s、Swarm 20/10s；Swarm 訓練完自動再排一隻 11762–11767）。
- 三個 Hive 全滅且突變體存活 → Overlord 交中立，"The Overlord has been slain! Flee his body or BE DOOMED…"，40 秒 "Overlord Implodes" 計時後殺死所有 h04G（`aq/Vq` 9148–9165）。
- 推斷：Ground Overlord（h04W）每秒會把 lumber 重設為 `R2I(kx)`（19440），所以花 lumber 訓練的單位等於每秒退款，費用只作門檻。

---

## 5. 機器人（Android）

### 5.1 啟動 / 敵對模式
- 機器人在 0 秒與其他角色同時決定（§1.2），只會出現在 ≥7 人的局。
- **1.8.2 沒有「反人員模式」**：TS1048/1049/1050（"ACTIVATING ANTIPERSONNEL ALGORITHMS…"）在 JASS 中沒有被引用（grep 無結果），屬殘留字串。機器人一開始就是人類陣營（計入人類勝利條件）。
- 誤殺懲罰（TS3059 "If too many are killed by you, you will be shut down"）：
  - 只要攻擊者或受害者是機器人且目標是主單位，就記錄 TK 點數（`af` 2412–2423，16387–16389）：`TK[a→v] += dmg / v.MaxHP`，並記下最後傷害時間。
  - 每次任何主單位死亡（`Rf` 2443–2452，於 17241 呼叫）：`uo += Of(Cv, 死者)`，`Of = TK[機器人→死者] − TK[死者→機器人]`；若任一方屬外星/突變陣營則為 0；若機器人最後一次傷害死者已超過 300 秒則為 0（2429–2442）。**`uo > 2.7` → 直接殺死機器人**，`uo` 歸零。

### 5.2 死亡與 Memory Card
- 機器人主單位死亡 → 在原地丟出 **I01H Memory Card**（`dr`）（17244–17249）。
- 4 秒後（`IF` 3587–3594 → `O7` 17291–17330）：訊息 "You have died. You will be allowed to watch only where your memory card is…"、單位交中立、加入 `ke`、名稱補空白；啟用 `IB`（每秒以記憶卡位置為中心給機器人 650 視野，20690–20712）與 `RB`（機器人說的話變成記憶卡位置的浮動文字，只有看得到該位置的人看得到，20649–20672）。
- `-shutdown`：放棄復活，`Cv=Player(15)`、記憶卡刪除（20625–20631）。

### 5.3 復活
| 方式 | 條件 | 過程 | 行號 |
|---|---|---|---|
| Metallic Fabricator | 任何單位攜帶 I01H 進入 rect `jn`（Rect(-9696,9888,-9568,10016)，Arbitress 內 h03Z 旁）且機器人已死 | 刪除記憶卡；攜帶者獲得 **I01I Remote Control**（user data = 新隨機碼 `br`）；電梯特效 61×0.5 s ≈ 30 s；在 rect `Hn` 中心生成新機器人：`Qo>=2000` 時為 `Er`（上次選的底盤，預設 h02F），否則 h00H；恢復名稱、移出 `ke`、恢復結盟；若職業是 CEO 再給一台 Robo-Butler | 20953–21018 |
| Pacification Bot | 持記憶卡對 `rC`（h04A Pacification Bot @(-14594.7,-6775)，3339）施放 A094 Memory Card Use，機器人已死 | 機器人直接接管 Pacification Bot（replace、加物品欄），施放者獲得 Remote Control（新 `br`），暫停 4 s | 21019–21062 |

### 5.4 Remote Control（A05W，`aWv` 20788–20832）
- 遙控器碼 ≠ 目前 `br` → "ERROR: Unit not responsive. Clearance code out of date; please find the newest remote."（新復活會讓舊遙控器失效）。
- 依使用者陣營：
  - 突變陣營使用且機器人非 `Lv` → 機器人改為突變 spawn（`Lv=true`），全突變陣營收到 "configured for MUTANT"。
  - 否則外星陣營使用且機器人非 `lv` → 改為外星 spawn。
  - 否則人類使用且機器人目前是 `lv/Lv` → 改回人類。
  - 以上都不成立 → 切換停機：停用時暫停機器人主單位、其在太空的單位交中立；再用一次恢復（含逃生艙）。
- 機器人本人撿到遙控器會被自動丟掉（20713–20718）。物品 tooltip：「第一次使用更新目標參數，再用停機，再用恢復」。

### 5.5 2000 EP 升級
- EP：每秒 +1.5（19415），2000 EP ≈ 1333 秒（約 22.2 分）。
- `Qo>=2000` 且 Arbitress `MB` 存活 → 提示 "The metallic fabricator is ready to build you a new chassis…" 並啟用 `bB`（19412、19472–19477）。
- 機器人（非 mechanical 的主單位，即尚未升級）進入 rect `Hn`（Rect(-9504,9824,-9120,10208)）→ 對話框（20833–20870）：

| 底盤 | rawcode | HP | 攻擊 | 移速 | 能力 |
|---|---|---|---|---|---|
| Surbeit "[+HEALTH,+DAMAGE,-MOVESPEED]" | h02F | 2200（regen 0） | 109+1d1 / cd 3.0 / 射程 1400 | 200 | Prism Rockets（CD70，15 枚）、Automatic Restoration（CD20，靜止回 12/s）、Tactical Nuclear Explosion（CD180） |
| Valkyrie "[-HEALTH,+MOVESPEED]" | h047 | 1100 | 27+1d1 / 0.65 / 120 | 320 | Rotary Dodge（CD25、5 s 閃避）、Pulse Wave（CD30 擊飛）、Automatic Restoration |
| Penguin "[+PENGUIN, -BARRACUDA]"（身上有 I013 Penguin Doll 才出現） | h02U | 1200（regen 5） | 5 / 0.02 / 1900 | 360 | Automatic Restoration、Tactical Nuclear Explosion |

- 選定後：61×0.5 s ≈ 30 s 建造，`ReplaceUnitBJ`、物品轉移、`Er=m`、6 秒 Avul（20877–20944）。
- 升級後機器人型別為 mechanical+tauren（免疫 Neurotoxic Poison 13248）。

---

## 6. EP 系統

### 6.1 每秒結算（`oGv`，19414–19478；trigger `Mb` 每 1.0 s，23554）
| 角色 | 公式（每秒） | 備註 |
|---|---|---|
| 機器人 `Qo` | +1.5 | 死亡中也照算 |
| 外星人 `Kx` | +0.4 + 0.28 × (存活外星 spawn 玩家數：`lv[i]` 且不在 `ke`) + 0.12 × (蛋數 `jo`) | 19362–19377 |
| 突變體 `kx` | +0.4 + 0.28 × (存活突變 spawn 玩家數) | 若目前形態為 h04G Overlord：改成 lumber +1/s（19427、19441–19442） |

- EP 從地圖初始化就開始計算（不論該角色是否存在）。
- 顯示：lumber = `R2I(EP)`；food used = 到下一階的百分比（外星：`Kx/6.6`（<660）、`(Kx−660)/7.1`（≤1370）；突變：`kx/3`（≤300）、`(kx−300)/6`（≤900）、`(kx−900)/9`（≤1800）；機器人：`Qo/20`），food cap = 100（19420–19446、18760）。
- 一次性：外星 +175/無辜者擊殺、−75/蛋被毀；突變 Devour +25/+125、Cannibalize +140、傷害比例 ×200/×50；Overlord 站形態 kx 設為 600。（彙整 §3、§4）

### 6.2 門檻與提示
| 角色 | 門檻 | 提示（給本人 30 秒＋畫面遮罩） | 行號 |
|---|---|---|---|
| 突變 | lumber ≥300 / ≥900 / ≥1800（$708） | "…It is time to evolve...Press ESC when you are ready." | 19396–19404、19447–19461 |
| 外星 | ≥660 / ≥1370（$55A） | "…It is time to transform...Press ESC…" | 19405–19410、19462–19471 |
| 機器人 | ≥2000（$7D0）且 Arbitress 存活 | "The metallic fabricator is ready…" | 19411–19413、19472–19477 |

> 實際能否進化看 `kx/Kx`（ESC 時判斷，19690–19701、20341–20346），提示用 lumber 判斷，兩者同值。

### 6.3 ESC 進化選單單位（全為 `ewsp` dummy，A078 IsSelector Tag + Avul，訓練時間 1 s）
| 選擇器 | 可選 |
|---|---|
| e023 | h035 Energy / h02V Manipulation / h03E Power |
| e029 | h03A Combustion / h03C Illusion / h037 Electricity |
| e028 | h02Y Temporal / h031 Spatial / h033 Masquerader |
| e027 | h03G Basilisk / h03P Regeneration / h03V Webspinner |
| e02A | h00U Perfection / h00V Infection |
| e02B | h01B Mobility / h01E Strength |
| e02C | h01O Sustained Development / h01I Human Development |
| e02D | h01K Complete Infection / h01L Rapid Gestation |
| e02E | h04G Overlord / h04W Overlord (GROUND) / h01V Defiler |
| e02F | h01C Crab / h01D Stalker |
| e02G | h01G Flesh Golem / h01H Minotaur |

每次按 ESC 會刪掉舊的選擇器再生成新的（19703、20348）。

---

## 7. GIT 血液檢測

### 7.1 物件
| 物件 | 數值 | 來源 |
|---|---|---|
| I00M Genetic Testing Device | 由 h011 Genetic Integrity Tester 與 h00G Medical Supplies 販售；stock max 3、**首次上架 420 s**、補貨 5 s；能力 A018；charges 未覆寫（沿用 base `will` 預設；tooltip 說 3 人） | OD I00M、h011、h00G |
| A018 GIT（抽血） | 射程 140、**施法 3 s**、CD 3 s、0 mana；可對任何人（含自己） | OD A018 |
| h011 Genetic Integrity Tester（`Gc`） | 6000 HP，@(-7808,-6400)，Queen Niffy 上的中央伺服器 | OD、3166 |
| I019 GIT Resolver（物品） / h038 GIT Resolver（單位） | 物品使用後在原地生成 h038（200 HP，屬於使用者），暫停 10 s（`LF(60,1/6)`）後才可交易；販售 I01A Test Results（補貨 30 s） | 14503–14522；OD |
| 每人限帶一個 I00M | 撿第二個會被丟掉 "You may only carry one of these devices." | 14523–14547 |

### 7.2 抽血邏輯（`BA→MZ` 14442–14502）
1. 第一次使用時，給這個裝置一個流水號 `tv` 與一個 force `uv[id]`，結果 `vr[id]=1`（乾淨）。
2. 目標無效（Defense Drone h00B、已抽過同一玩家、或不是玩家主單位）→ "This unit's blood has already been drawn!" 並退回 1 charge。
3. 否則把目標玩家加入、名字附加到名單 `Zo[id]`、顯示 "DNA extracted."；若 `vr!=3`：
   - 目標玩家是 外星人 `Bv` / 突變體 `cv` / 外星 spawn / 突變 spawn → `vr=2`（感染）
   - 否則若目標是機器人 → `vr=3`（錯誤）
4. 使用時若 charges ≤1 → 裝置刪除，獲得 I019 GIT Resolver（帶同一 id）。

### 7.3 結果（購買 I01A，`dA→YZ` 14548–14579）
- 若 `Gc` 已死 → "Could not contact the central blood analysis server on the U.S.I. Niffy."
- 否則顯示 "This sample contains the DNA of:" + 名單，然後：`vr==1` "This sample is not infected."、`vr==2` "This sample is infected."、其他（3）"An error has occurred. Blood status could not be resolved on one or more participants."

### 7.4 解讀重點
| 問題 | 答案 |
|---|---|
| 偵測依據？ | **角色旗標**，不是身上的寄生/普里昂 buff；被感染但尚未死亡的人類測起來是乾淨的。 |
| 偵測到 spawn？ | 是（`lv`/`Lv`）。 |
| 偵測到機器人？ | 不是「感染」而是讓結果變成 **Error**；`vr=3` 一旦設定就鎖定（之後抽到感染者也不變），且機器人在感染者之後抽也會把 2 蓋成 3。 |
| 多個感染者？ | 只顯示 "infected"，無法得知人數/是誰。 |
| 外星形態的外星人？ | 推斷：外星形態單位屬於 Player14，`GetOwningPlayer` 不是 `Bv` → 判定乾淨，名單顯示 "Alien"。 |
| Tester 被摧毀？ | `nO→im`：刪除抽血 trigger `BA`（之後抽血不再記錄）、全場 "The blood tester has been destroyed!"（7758–7762）；之後購買結果一律 "Could not contact…"。 |

---

## 8. 感染相關物品與反制

| 機制 | 規則 | 行號 |
|---|---|---|
| Parasite（外星） | 見 §3.2；buff B00H，死時變外星 spawn | OD A02N、16359–16361 |
| Prion Infection（突變） | 見 §4.3；buff B009，死時變突變 spawn | OD A013/A01S/A01X、16355–16357 |
| Antibody Pack I004 | h00G 販售；5 charges、CD 2 s、補貨 10 s。使用（`IA→qz` 14135–14163）：刪除身上的 Carrier 觸發器；若有 prion → dummy e032 施放 A08G 改為 **Contained Prion**（B01F，0 傷害）；若有 parasite → e033 施放 A08O 改為 **Contained Parasite**（B01G）；接著 46 秒內每秒移除新的 B009/B00H（＝免疫期）；46 秒後移除 Contained buff（＝痊癒）。**Contained 期間死亡仍會變 spawn**（`x5` 也檢查 B01F/B01G）。 | 14138–14163、16355–16361 |
| Tainted Vendor A01T（h01I/h01J） | CD 20、30 mana，對中立建築：該商店的 Antibody Pack 下架並標記 A01U；之後非突變陣營向它購買任何物品 → 若買的是 Antibody Pack 則刪除，並由屬於 cv 的 dummy（e000，A01S 6.53 DPS）感染買家 | 11768–11789 |
| Total Infection A01V（h01K/h01N） | CD 60、25 mana：對 A[1..12] 中所有非突變陣營主單位各派一個 cv dummy 施放 A01S 感染 | 11896–11916 |
| Carrier A05I（h01L） | CD 45、30 mana：在目標身上掛 350 範圍觸發器，任何非 mechanical 單位進入範圍就被 cv 的 e00D dummy 施放 A01X（10 DPS）感染；目標本身不被感染；Antibody Pack 可移除 | 11629–11646 |
| Vector A05J（h01K） | 追蹤蟲 e01G 撞到非突變 spawn 的目標 → 16 次週期性麻痺（暫停 0.3 s，間隔 1+i/2 秒） | 11647–11728 |
| `Ou` 移除 BNpa | 條件寫成三個 `and`（不可能成立），無作用 | 11729–11734 |

---

## 9. 戰鬥基礎

### 9.1 Suit（換裝 = 變形）
- 使用 suit 物品（`nN→g4` 15979–16068，條件主單位 15910）：
  - 只允許 point value 第 2 位數為 "2" 的單位（人類 Personnel 220000；外星/突變形態 210000 → "This unit cannot use suits."）（15967–15969、16035–16038）。
  - 若已穿著（有 A046 zDrop Suit），舊 suit 物品放回物品欄（16040–16048）。
  - 加 `S001` Personnel Suit Change（Chaos 型永久變形）並設等級 Q → 單位變成對應 Personnel 型別；suit 物品隱藏並存在 `Mx[玩家]`；HP% 保持；0.1 s 暫停＋Avul，0.2 s 後補回職業能力與角色能力（`sH/QH` 5395–5426）。
- 脫衣 A046 zDrop Suit：物品還原、S001 設回 1（h00H）（16069–16095）。
- 進化（外星繭/突變 mass）時，已穿的 suit 物品會被移入新單位（19805–19811、20423–20429）。

| S001 等級 | Suit 物品 | 變成 | HP | 攻擊 dmg/cd/射程 | 移速 | 主要能力 | 取得 |
|---|---|---|---|---|---|---|---|
| 1 | （無） | h00H | 400（regen 1.5） | 19 / 預設 / 預設 | 319 | — | 起始 |
| 2 | I000 Tesla | h00I | 600 | 44 / 預設 / 600 | 280 | Chargeup、Electric Attachment、Lightning Storm、Assault Rifle | h00O |
| 3 | I001 Rocket | h00C | 600 | 50 / 預設 / 600 | 255 | "Halberd" Remote Rocket、Hand Missile、Heavy Support Rifle | h00Q |
| 4 | I007 Cryo | h00J | 600 | 11 / 0.5 / 600 | 275 | Cryogenesis、Freezing Breath、Cryo Shock、Freezing Effect | h00O |
| 5 | I008 Plasma | h00D | 600 | 10 / 0.5 / 600 | 275 | Plasma Ball、Matter Draining Device | h00P |
| 6 | I009 Flamethrower | h00E | 600 | 5 / 0.24 / 300 | 260 | Kidot Projection、Overheat | h00O |
| 7 | I00A Photon | h00F | 600 | 22 / 1.0 / 600 | 285 | Firefly、Blind | h00P |
| 8 | I00B Service | h00K | 600 | 7 / 0.25 / 140 | 295 | Magnetic Saw、Welding Torch、Chainsaw | h00Q |
| 9 | I00C Dark Matter | h00L | 600 | 21 / 1.0 / 600 | 275 | Phase Vortex、Energy Destabilization | h00R |
| 10 | I00D Illusion | h00M | 600 | 39 / 預設 / 600 | 275 | Swap、Illusory Double | 掉落表 |
| 11 | I00E Radiation | h00N | 600 | 29 / 1.1 / 600 | 275 | Radiation（傷害周遭含友軍）、Core Overload | h00P |
| 12 | I00X Operative | h024 | 650 | 64 / 預設 / 1400 | 285 | Firefly、Welding Torch、Toss/Detonate RDG、Kinetic Rush | 隨機事件/掉落 |
| 13 | I00Y Scientist Coat | h027 | 600（regen 1.25） | 50 / 預設 / 350 | 295 | Biology、Physics、Chemistry | 預放 (4675.1,-12446.7) |
| 14 | I00Z Guard | h02G | 600 | 23 / 1.0 / 600 | 275 | Automatic Restoration、Energy Transmission、Absorption Banks | h00R |
| 15 | I011 Acidic | h02R | 600 | 24 / 預設 / 850 | 275 | Goo Spray、Blinding Cloud、Acid | h00R |
| 16 | I01E Machinegun | h03U | 600 | 2 / 0.1 / 600 | 255 | Setup、Machinegun、Toss/Detonate RDG | h00Q |
| 17 | I01G Force | h03L | 600 | 29 / 1.5 / 1800（pierce） | 255 | Reverse Polarity、Kinetic Rush、Force Vortex | h00R |
| 18 | I020 Magnetic | h04K | 600 | 25 / 1.1 / 600（pierce） | 275 | Magnetic Thrust、Summon Metal、Detonate Slivs | h00Q |
| 19 | I021 Pulse | h04M | 600 | 1 / 0.05 / 500（pierce） | 275 | Energy Bank、Energy Transfer | h00P |

（suit 共 18 種；穿衣後 HP 回血 0.75。四台 Suit Vendor：h00O、h00P、h00Q、h00R；OD `usei`。）

### 9.2 爆裂物與瓦礫
| 物件 | 規則 | 行號 |
|---|---|---|
| Fusion Bomb I00N（h014 販售，首次 60 s、補貨 60 s，1 charge） | A019 在目標點（射程 150）放 h013（225 HP），**3 秒**（`LF(60,.05)`）後爆炸：殺掉 400 內可破壞物（除部分例外）、產生 28 塊 B003 Rubble（14 塊 800 內隨機、6 塊 250 內、8 塊 250–400）；同一區域（`Bg` 判定同站/同區）內 **半徑 250：5000 傷害**、**半徑 550：+200**（中心合計 5200、邊緣 200）；擁有 Lord of Flames 者免疫；1800 內震動/白屏 | 14071–14084、14246–14354 |
| Grenade I00R（Outpost Supplies，5 charges、CD 1 s） | 最遠 900，拋物線物理；落地物件 e007 死亡時 A01C：半徑 80 內 150 傷、150 內 75 傷；A07O 對可破壞物 60/45 | 13843–13868；OD A01C/A07O |
| Rubble Clearing Device I00S（A08E） | 目標點 100 內的可破壞物在延遲 `距離/700×rand(0.8,1.2)` 秒後受 750 傷害（"rumoured to be effective against doors"） | 13921–13945 |
| Security Door | B000/B001 5000 HP；每扇門有 300×300 自動開門區；Smash/Rubble Device 可破壞 | 6249–6257；OD w3b |
| Rocks Fall（突變） | 半徑 512 一圈 36 塊 B007 Rubble（400 HP） | 11796–11814 |

### 9.3 Sentry Gun / Force Shield / 治療
| 物件 | 狀態 | 來源 |
|---|---|---|
| I00V Sentry Gun（A024 → h01Z：200 HP、1+1d1 dmg、cd 0.15、射程 650） | **沒有任何商店販售、不在掉落表、JASS 未引用** → 推斷 1.8.2 中玩家拿不到；只有海盜基地的 3 座預放 sentry（Player12） | OD；3103–3106 |
| I00W Force Shield（A025 → h021 Protection Field Generator 150 HP） | 同上，推斷不可取得 | OD |
| I00L Critical Care System（Medic 起始、預放 (-10599.3,-857.6)、掉落表） | ankh 型 AIrc：`irc2=150`、`Ircd=1`、CD 45（推斷：死後約 1 秒以 150 HP 原地復活，非腳本） | OD A015；21991 |
| I01Y Critical Care System (Damaged) | 同上但 `irc2=1`（推斷 1 HP 復活）；由 Closed Timelike Loop 複製產生 | OD A07I；12856–12903 |
| I01O Rapid Therapy Device（"resuscitate a human who has died in the last 45 seconds"） | A06N（ANsi base）**JASS 無任何處理**、無商店/掉落 → 推斷未實作；`Vr[]` 死亡時間有記錄（17337）但從未被讀取 | OD；grep |
| I002 Emergency Medical Pack | 2 charges、+200 HP、CD 20 | OD |
| I01N Medical Regenerator | Healing ward、持續 90 s、CD 130 | OD A064 |
| I01D Solace Shield | 吸收 300 傷、−25% 速、15 s（tooltip；能力 Nab6=300） | OD |

---

## 10. 死亡系統與聊天

### 10.1 死亡模式投票
- `-vote death`（`RX→Hj` 22325–22337、5880–5890）：只能觸發一次；"Death voting will begin in FIVE seconds!"，5 秒後對全員顯示對話框 "In-Game Spectator Mode" / "Instant Boot Mode"。
- `sx=1`（spectator）為預設（22206）。
- 計票（`Mj` 5909–5930）：投 Instant Boot → `Sx+1`，若 `Sx >= CountPlayersInForceBJ(bj_FORCE_ALL_PLAYERS)/2` → `sx=2`、"Instant boot mode has been enabled!"。投 Spectator **不加票**，只在 `Sx` 已達門檻時才宣告 spectator（程式缺陷）。推斷：門檻分母若是 16 slot → 需 8 票。
- 180 秒後投票與 `-rename` 一起關閉（17386–17391）。

### 10.2 死亡流程
1. 主單位死亡（`FN→Z6` 17157–17251）：判斷是否轉 spawn（§3.2/§4.4）→ 否則全場公告（17198–17240）：
   | 死者 | 公告 |
   |---|---|
   | 突變體 | "<name> has been killed!" + "The Mutant has been killed!" |
   | 外星人 | "The Alien has been killed!" |
   | 機器人 | "The android has been destroyed!" |
   | 外星 spawn | "An alien spawn has been killed!" |
   | 突變 spawn | "A mutant-spawn has been killed!" |
   | 其他 | "An innocent has been killed!"（若兇手是外星陣營：外星人 +175 EP） |
2. `GN→I7`（17331–17363）：在原地生成屍體（屬 Player15、Avul、Locust、A077 Is Corpse；機器人加 A07P），記錄死亡時間；1 s 後外星 spawn 屍體改色。屍體不會被自動清除（推斷），供 Cannibalize。
3. **4 秒遺言窗**：`IF()` 等 4.0 秒（3587–3594）後才執行 `gN→O7`（17291–17330）。這 4 秒內死者仍不在 `ke`、名稱正常，可以公開說話。
4. `O7`：若已被復活（如 Critical Care）則跳過；刪除死者單位殘留物品（推斷：一般單位死亡時物品已由引擎掉落）；
   - 非機器人：訊息 "You have died. You can stay and watch the game, or leave at any time."；顯示 "Dead Player Chat" multiboard；所有活人對死者設 alliance 3（給視野），死者對活人 0；Player14 給視野；加入 `ke`；名稱後面接上數百個空白（公開聊天無法辨識）；若 `sx==2` → `CustomDefeatBJ "You have died!"`（踢出）；殘餘單位交中立；最後跑勝負判定。
   - 機器人：見 §5.2。

### 10.3 聊天路由
| 指令/前綴 | 規則 | 行號 |
|---|---|---|
| 死者一般發言 | 死者（`ke`，非機器人）說的話以 "\|cffffcc00<原名>\|r: msg" 轉發給所有死者 | `fN` 23335–23348、17094–17108 |
| Dead Player Chat 看板 | 死者非 "-" 開頭訊息記錄到 40 行 multiboard（只有死者被顯示） | 18534–18580、17312–17314 |
| 機器人死後發言 | 變成記憶卡位置的浮動文字 | 20649–20672 |
| `-creategroup <name>` | 活人限定；名稱已存在則 "This group has already been taken." | 18202–18231 |
| `-add <group> <color\|all>` / `-remove …` | 只有建立者；`all`=1337 代表全部 | 18232–18313 |
| `-list <group>` | 必須是成員 | 18314–18343 |
| `;<group> <msg>` | 活人且為成員；先把已死成員踢出群組；訊息送給群組**與所有死者** | 18344–18432 |
| `-default <group>` | 只存設定（`qe[]`）；`.message` 送預設群組的功能**沒有實作** | 18489–18506 |
| `[msg` | 外星陣營 → "[Alien]" 只給外星陣營；突變陣營 → "[Mutant]" 只給突變陣營 | 18433–18488 |
| `-names` | 活人限定；列出每位玩家顏色＋目前名稱（死者顯示 "(DEAD)"）＋原始 battle.net 名 `re[]` | 23358–23371、17364–17379 |
| `-rename <name>` | 活人限定、0.5–180 秒可用；新名 = 職業前綴 `Sv` + 第 9 字元起 | 17380–17385、5754、17386–17391 |
| `-status` | 依 `ke` 顯示："Both the alien and the mutant are dead, but spawns may remain..." / "The alien is dead, but more evil remains..." / "The mutant is dead…" / "Both the alien and the mutant live on..." | 18507–18533 |
| `-allow` / `-disallow` | 外星人/突變體允許/禁止 spawn 攻擊自己（§3.3） | 19485–19514 |
| `-votekick <color>` | 投票者必須活著、目標必須已死（`ke`），每人一票；`Z`=存活且在線人數，票數 `>= Z/2` → "Dialoguing offensive player/android…"，對目標 `ShowInterfaceForceOff`（推斷：鎖進電影模式、無法正常使用介面/聊天）；未達標顯示 "N votes left to kick" | 22342–22355、5931–5981 |
| `-shutdown` | 機器人死後放棄復活 | 23723–23736、20622–20631 |

---

## 11. 勝負判定（`dN→g6`，16894–17028）
- 不是週期檢查；在 (a) 主單位死亡 4 秒後（17329）、(b) 轉成 spawn（17178、17193）、(c) 主單位被 Petrify（13231）時呼叫；每次先等 0.25 s（16898）。`Xr` 旗標（16810–16812）從未被設定。`Eo` 保證只結算一次。
- 檢查順序：**人類 → 突變 → 外星**。

| 勝方 | 條件 | 行號 |
|---|---|---|
| 人類 "Humanity has prevailed!"（30 秒後結束） | `Eo==false` 且（突變體主單位死亡 或 本局無突變體）且（外星人主單位死亡 或 本局無外星人），且 **沒有任何存活的突變 spawn 或外星 spawn 主單位** | 16835–16843、16813–16818、16899–16946 |
| 突變 "The mutant has triumphed! Humanity is doomed!"（20 秒） | `Eo==false` 且（外星人死亡/不存在/不在線），且所有「存活、不在 `ke`、不是 cv」的玩家主單位都是突變 spawn（`Lv`） | 16863–16868、16844–16846、16948–16987 |
| 外星 "The alien has triumphed! Humanity is doomed!"（20 秒） | `Eo==false` 且（突變體死亡/不存在/不在線），且所有存活非 Bv 主單位都是外星 spawn（`lv`） | 16888–16893、16869–16871、16988–17027 |

說明（皆由條件推得）：
- 「存活」= 該玩家 `A[i]` 單位活著；只看 12 位玩家的主單位，不看召喚物、蛋、Hive 等。
- **機器人**（未被遙控轉陣營時）算人類方的存活者，會阻擋邪惡方勝利；被轉成 `lv/Lv` 後算該陣營。
- **Time Zombie**（Back from Hell）是 `lv=true` 的主單位 → 算外星 spawn。
- **Petrify** 的主單位 `A[]=null` → 視為死亡，可能直接觸發邪惡方勝利。
- 推斷：主腦死亡但 spawn 仍活著、且其他人全死 → 該陣營 spawn 仍可「代替主人」獲勝（突變/外星條件都不要求主腦存活）。
- 推斷：所有人同歸於盡（雙主腦死、無 spawn）→ 因先檢查人類條件，判定人類勝利，即使沒有人類存活。
- 兩主腦都活著 → 永不結束（只能等其中一方死亡）。
- 外星人被 Rapid Gestation 轉成突變 spawn 時 `Bv=null`（17168–17170），之後視為外星人已不存在。
- 隨機事件 `vev`（17910–17924，1/6 機率）會假裝宣告 "Humanity has prevailed!" 6 秒後顯示 TS4185 "Wait, nevermind. Game's not over, folks."（純惡作劇）。

---

## 附錄 A：其他與重製相關的細節
| 主題 | 規則 | 行號 |
|---|---|---|
| 逃生艙 I010 | 每位玩家 100 秒冷卻；準備 4 秒（`LF(40,.1)`），期間移動 ≥90 或受傷 ≥35 即失敗；繭/進化中（A07E）不可用；逃生艙 h02P 被擊毀 = 乘員死亡 | 16463–16583 |
| 預放物品 | Security Camera (-5888.3,14073.4)、Critical Care System (-10599.3,-857.6)、Scientist Coat (4675.1,-12446.7)、Worm Food (8610,2708.4) | 21990–21993 |
| 自訂冷卻系統 | 某些能力需要玩家擁有特定 "Spell in Cooldown" dummy（e031/e00J/e00K/e015/e00S/e00T/e00V…），施放後 `VF` 刪除、`aF` 於 ve 秒後重建 → 跨形態共享 CD | 3541–3556 |
| 攻擊/受傷全域鉤子 | 所有進場單位（point value ≠37）註冊 `px` 受傷事件 → `x5` | 23296–23299、16398–16407 |
| Point value 慣例 | 37 = 忽略的 dummy；第 1 位 "1" 不能駕駛；第 2 位 "2" 才能穿 suit | 7472、15968 |

## 附錄 B：開放問題 / 不確定處
1. `bj_FORCE_ALL_PLAYERS` 計數是否為 16（影響 Syllus/Pown 開放與死亡投票門檻）。
2. I00M 的實際 charges（base `will` 預設值未包含在 objects.json）。
3. Critical Care（AIrc）欄位 `irc2/Ircd` 的確切意義（推斷為復活 HP/延遲）。
4. Rapid Therapy、Sentry Gun、Force Shield 在 1.8.2 似乎完全不可取得/未實作。
5. `-votekick` 的實際效果僅為 `ShowInterfaceForceOff`，對聊天的封鎖程度依引擎行為而定。
