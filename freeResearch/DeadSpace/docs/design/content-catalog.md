# 內容總表（實作清單＋數值基準）

> 2026-10-30：☑ = 模擬端已實作（資料登錄＋行為腳本＋Vitest）。視覺（模型、特效）的完成度另見 `../../game/docs/visual-review.md`。

> 這份是「要做出來的所有東西」的清單。每列前面的 ☐ 在實作完成且有測試或截圖紀錄後改成 ☑。
> 規則細節以 `../research/02-core-rules.md`、`../research/03-world-events.md` 為準；本表給的是命名、範圍與數值起點。
> §2–7 的資料表由 `tools/make_catalog_tables.py` 從 `../research/extracted/objects.json` 產生，命名在 `tools/homage_names.py`；改名請改那裡再重新產生並只替換 §2–7 的表格。§1、§8–10、進化樹與模組表為手寫。
> 「原作功能摘要」欄是原文節錄，只用來理解功能，**遊戲內文字要重新撰寫**。

## 0. 數值換算規則

| 項目 | 原作（WC3）| 本作 |
|---|---|---|
| 距離 | world units | **100 units = 1 m**（移速 300 → 3 m/s；射程 600 → 6 m）|
| 站內尺度 | 依原圖 | 以「好玩的房間大小」重新設計，走廊寬 ≥ 3 m，主要房間 10–20 m |
| HP、傷害、能量（mana）| 原值 | 原值起步；攻擊間隔（CD）沿用秒數 |
| 骰子傷害 | base + dice×sides | 化為 `[min, max]` 均勻分布 |
| 時間 | 秒 | 秒（模擬 20 Hz）|
| EP | 原值 | 原值（公式見 01-map-analysis §4）|
| 經濟 | 道具免費、靠庫存／補貨／開局延遲控制 | 沿用原作（GDD §7.3）|

平衡調整一律改 `src/shared/content/balance.ts` 的倍率或個別數值，並記錄在 `game/docs/balance-notes.md`。

## 1. 身分與職業

| ☑ | 身分 | 人數條件 | 能力摘要 | 規則出處 |
|---|---|---|---|---|
| ☑ | 人類 | 其餘所有人 | 職業被動＋可穿防護服 | 02 §2 |
| ☑ | 異形 | 1–4 人時 50%；5 人以上必有 | 異形形態（5 秒變身、匿名）、寄生、下蛋、繭進化 | 02 §3 |
| ☑ | 變種人 | 1–4 人時 50%；5 人以上必有 | 吞食、無敵肉團進化、完美／感染路線 | 02 §4 |
| ☑ | 仿生人 | 7 人以上 | 人類方、友傷懲罰、記憶核心、遙控器、底盤升級 | 02 §5 |
| ☑ | Spawn | 被轉化者 | 33% HP 轉生、跟隨主人陣營、可被放逐 | 02 §3.2–3.3、§4.4 |

| ☑ | 職業 | 卡數 | 名稱前綴 | 開局物品（致敬名稱）| 職業能力 | 固定出生 |
|---|---|---|---|---|---|---|
| ☑ | 研究員 | 2 | Dr. | 相位斗篷、急救包 | 博士專長（光學／重力學／生物學／電子學，四選一均等）＋能量回復光環 | — |
| ☑ | 保全 | 2 | Private | 隨機戰鬥裝（電漿／火箭／特斯拉／冷凍）| 攻擊射程 +125 | — |
| ☑ | 醫護兵 | 1 | Medic | 重症維生系統、急救包、基因檢測器 | 治療術（6 HP／次、CD 0.2 s、自動施放）| — |
| ☑ | 艦長 | 1 | Captain | 艦長 ID 卡 | — | 豪勇號艦橋 |
| ☑ | 清潔工 | 1 | Janitor | 清潔工 ID 卡 | 翻找（搜貨箱：小機率四聯藥／背包掃描器／全像投影器／節慶帽）| — |
| ☑ | 執行長 | 1 | CEO | — | 無敵機器管家（3 格背包、跟隨、主人隱形時一起隱形）| — |
| ☑ | 政委 | 1 | Commissar | 處決手槍 | 事件「晉升」可獲得特務裝 | — |
| ☑ | 工程師 | 1 | Engineer | 服務裝、扳手 | 駭門（鎖門 15 秒）| 火口號（若出現）|
| ☑ | 下士 | 1 | Corporal | 強化護腿 | 攻擊 +15% | — |
| ☑ | 王牌飛行員 | 1 | Ace | 一套戰鬥裝（均勻隨機）| 駕駛的船／站攻速 +15%（原作未實作，本作實作）；專屬槍騎級戰機 | 機庫 |

開場背景故事：每個職業 × 4 種身分（人類、異形、變種人、仿生人）＝ 40 段，全部原創撰寫。

## 2–7. 資料表

### 防護服（18 套）

穿上防護服＝把人類單位變身成對應的「著裝單位」（原作 S001 Personnel Suit Change 的等級 2–19；等級 1 是未著裝 h00H：HP 400、攻擊 19、移速 319）。異形／變種人形態不能穿。

| ☑ | 原作 id | 致敬名稱 | English | 等級→單位 | HP | 攻擊 | CD | 射程 | 移速 | 原作技能 | 取得 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ☑ | I000 | 特斯拉裝 | Tesla Rig | 2→h00I | 600 | 44 | — | 600 | 280 | IsSuit Tag（A070）、Chargeup（A04K）、Electric Attachment（A05Q）、Lightning Storm（A092）、zDrop Suit（A046）、Assault Rifle Attachment（A007） | Suit Vendor |
| ☑ | I001 | 火箭裝 | Rocketeer Rig | 3→h00C | 600 | 50 | — | 600 | 255 | IsSuit Tag（A070）、"Halberd" Remote Rocket（A03S）、zDrop Suit（A046）、Hand Missile（A00A）、Heavy Support Rifle Attachment（A008） | Suit Vendor |
| ☑ | I007 | 冷凍裝 | Cryo Rig | 4→h00J | 600 | 11 | 0.5 | 600 | 275 | Cryogenesis（A07M）、IsSuit Tag（A070）、zDrop Suit（A046）、Freezing Breath Attachment（A00K）、Cryo Shock（A00I）、Freezing Effect（A00G） | Suit Vendor |
| ☑ | I008 | 電漿裝 | Plasma Rig | 5→h00D | 600 | 10 | 0.5 | 600 | 275 | IsSuit Tag（A070）、Plasma Attachment（A05P）、Plasma Ball（A04L）、zDrop Suit（A046）、Matter Draining Device（A02Q）、Assault Rifle Attachment（A007） | Suit Vendor |
| ☑ | I009 | 火焰裝 | Pyro Rig | 6→h00E | 600 | 5 | 0.24 | 300 | 260 | Kidot Projection（A07J）、IsSuit Tag（A070）、Overheat（A04G）、zDrop Suit（A046）、Flamethrower Attachment（A00M） | Suit Vendor |
| ☑ | I00A | 光子裝 | Photon Rig | 7→h00F | 600 | 22 | 1 | 600 | 285 | IsSuit Tag（A070）、Photon Attachment（A05R）、Firefly（A04F）、zDrop Suit（A046）、Blind（A00N）、Assault Rifle Attachment（A007） | Suit Vendor |
| ☑ | I00B | 服務裝 | Service Rig | 8→h00K | 600 | 7 | 0.25 | 140 | 295 | IsSuit Tag（A070）、Magnetic Saw（A061）、zDrop Suit（A046）、Welding Torch（A00Q）、Chainsaw Attachment（A00P） | Suit Vendor |
| ☑ | I00C | 暗物質裝 | Void Rig | 9→h00L | 600 | 21 | 1 | 600 | 275 | IsSuit Tag（A070）、Phase Vortex（A066）、Dark Matter Attachment（A05O）、zDrop Suit（A046）、Energy Destabilization（A00S）、A00R、Assault Rifle Attachment（A007） | Suit Vendor |
| ☑ | I00D | 幻影裝 | Mirage Rig | 10→h00M | 600 | 39 | — | 600 | 275 | IsSuit Tag（A070）、Swap（A04E）、zDrop Suit（A046）、Illusory Double（A00T）、Assault Rifle Attachment（A007） | 掉落／事件 |
| ☑ | I00E | 輻射裝 | Rad Rig | 11→h00N | 600 | 29 | 1.1 | 600 | 275 | IsSuit Tag（A070）、Radiation Attachment（A04R）、Radiation（A00U）、Core Overload（A06C）、zDrop Suit（A046）、Assault Rifle Attachment（A007） | Suit Vendor |
| ☑ | I00X | 特務裝 | Operative Rig | 12→h024 | 650 | 64 | — | 1400 | 285 | IsSuit Tag（A070）、zDrop Suit（A046）、Firefly（A08W）、Welding Torch（A08V）、Toss RDG（A056）、Detonate RDGs（A057）、Kinetic Rush（A08X） | 掉落／事件 |
| ☑ | I00Y | 研究白袍 | Lab Coat | 13→h027 | 600 | 50 | — | 350 | 295 | IsSuit Tag（A070）、zDrop Suit（A046）、Biology（A02A）、Physics（A029）、Chemistry（A028） | 掉落／事件 |
| ☑ | I00Z | 警衛裝 | Guard Rig | 14→h02G | 600 | 23 | 1 | 600 | 275 | IsSuit Tag（A070）、Automatic Restoration（A026）、zDrop Suit（A046）、Energy Transmission（A02H）、Absorption Banks（A02G）、Assault Rifle Attachment（A007） | Suit Vendor |
| ☑ | I011 | 酸蝕裝 | Acid Rig | 15→h02R | 600 | 24 | — | 850 | 275 | Goo Spray（A07Y）、IsSuit Tag（A070）、zDrop Suit（A046）、Blinding Cloud（A04P）、Acid Rifle（A006）、Acid（A02L） | Suit Vendor |
| ☑ | I01E | 機槍裝 | Gatling Rig | 16→h03U | 600 | 2 | 0.1 | 600 | 255 | Setup（A08Q）、IsSuit Tag（A070）、Detonate RDGs（A057）、Toss RDG（A056）、Machinegun（A055）、zDrop Suit（A046） | Suit Vendor |
| ☑ | I01G | 力場裝 | Force Rig | 17→h03L | 600 | 29 | 1.5 | 1800 | 255 | Reverse Polarity（A097）、Attack Ground（A08A）、IsSuit Tag（A070）、Kinetic Rush（A05T）、Force Attachment（A05S）、zDrop Suit（A046）、Force Vortex（A06A） | Suit Vendor |
| ☑ | I020 | 磁力裝 | Mag Rig | 18→h04K | 600 | 25 | 1.1 | 600 | 275 | Magnetic Attachment（A07V）、Magnetic Thrust（A07U）、Summon Metal（A07T）、Detonate Slivs（A07S）、IsSuit Tag（A070）、Assault Rifle Attachment（A007）、zDrop Suit（A046） | Suit Vendor |
| ☑ | I021 | 脈衝裝 | Pulse Rig | 19→h04M | 600 | 1 | 0.05 | 500 | 275 | Energy Bank（A090）、Energy Transfer（A07X）、IsSuit Tag（A070）、Pulse Attachment（A07W）、zDrop Suit（A046） | Suit Vendor |

各防護服的功能定位（原作摘要，遊戲內文字需重寫）：

- **特斯拉裝**：The tesla suit is a basic suit which can augment its own attack or create a persistent area-damaging storm.
- **火箭裝**：The rocket suit is a long ranged suit that deals area of effect damage. Its special ability launches a disposable rocket that be rapidly rec…
- **冷凍裝**：The cryo-suit is a support suit designed to cripple and slow enemies. Its main attack slows enemies by 20% and its special ability can disab…
- **電漿裝**：The plasma suit is an average combat suit adept at punishing slow enemies and those trapped in close quarters. Its special ability creates a…
- **火焰裝**：The flamethrower suit is a short-ranged, slow moving suit with a high rate of attack that deals decent damage per second. Its special abilit…
- **光子裝**：The photon suit is a support suit that depends on its special ability to bring it up to par against others. It can blind units, making them …
- **服務裝**：The service suit is a melee suit that deals high damage per second and can repair certain mechanical units.
- **暗物質裝**：The Dark Matter suit is a support suit best at evading damage and hurting those dependant on energy.
- **幻影裝**：The illusion suit is an average combat suit with the ability to create an identical illusion. The illusion takes normal damage but deals no …
- **輻射裝**：The radiation suit is a relatively powerful suit, but as a consequence it damages all nearby units, including friendlies.
- **特務裝**：A specialized suit given to Rebarchs in the field.
- **研究白袍**：A coat containing many vials and flasks. It can be worn!
- **警衛裝**：The guard suit is an average combat suit adept at protecting others. It can turn units around it invulnerable and heal others at the expense…
- **酸蝕裝**：The acidic suit is a hit-and-run type suit that uses chemicals to blind or damage enemies. The acidic suit has a longer range than most suit…
- **機槍裝**：While technically obsolete due to outrageous upkeep and maintenance costs, bullet-based machineguns can still be used in battle to great eff…
- **力場裝**：The force suit is adept at outmaneuvering and controlling foes. Its special ability can quickly dash to the target point. The power of its k…
- **磁力裝**：What the magnetic suit lacks in direct firepower, it makes up for in battlefield control. Its attack fires "slivs" into a target, which can …
- **脈衝裝**：The pulse suit fires a fearsome laser that becomes less powerful after continuous fire.

### 一般道具

> 原作中哨戟、力場產生器、急速治療器沒有任何取得管道（1.8.2 未接上），**本作放進前哨補給（哨戟、力場產生器）與醫療販賣機（急速治療器：45 秒內復活一名死去的人類）**。原作庫存欄位為「—」者沿用 WC3 基底物品預設值，本作初版一律設庫存 3。

| ☑ | 原作 id | 致敬名稱 | English | 充能 | 庫存 | 補貨 s | 開局延遲 s | 取得 | 原作功能摘要 |
|---|---|---|---|---|---|---|---|---|---|
| ☑ | I002 | 急救包 | Trauma Kit | 2 | — | 40 | — | Medical Supplies | Heals 200 HP. |
| ☑ | I003 | 醫療奈米機群 | Medi-swarm | 0 | 3 | 0 | — | 職業／掉落／事件 | Heals the bearer for 2 HP/s. |
| ☑ | I004 | 抗體包 | Antibody Kit | 5 | — | 10 | — | Medical Supplies | The antibody pack can be used to flush parasite or prion infection. When taken, you will have immunity from being infected for 45 seconds. I… |
| ☑ | I00L | 重症維生系統 | Critical Care Unit | — | — | — | — | 職業／掉落／事件 | This extremely expensive device can barely heal a dying patient, restoring them to life through a combination of surgery, laser-surgical cau… |
| ☑ | I01Y | 重症維生系統（損壞） | Critical Care Unit (Damaged) | — | — | — | — | 職業／掉落／事件 | This CCS device appears to be slightly damaged, somehow. |
| ☑ | I01N | 醫療再生器 | Regen Beacon | 0 | — | 30 | — | Medical Supplies | Deploys a small device that can restore the health of nearby units over time. |
| ☑ | I01O | 急速治療器 | Rapid Revive | 0 | — | 300 | — | 職業／掉落／事件 | A complex fusion of robotics and biochemistry can resuscitate a human who has died in the last 45 seconds. |
| ☑ | I01K | 四聯藥 | Tetracyne | 0 | — | — | — | 職業／掉落／事件 | This rare and dangerous drug is best known for its ability to enhance the strength of the wearer. However, overuse can cause permanent side … |
| ☑ | I024 | 荷爾蒙補劑 | Hormone Booster | 1 | — | — | — | 職業／掉落／事件 | The long-term effects of the concentrated juices of the snoeglay in mating season have not been studied on human subjects. However, you're p… |
| ☑ | I005 | 能量核心 | Power Core | 0 | — | 20 | — | Maintenance Station | Restores 1.5 energy per second. |
| ☑ | I00Q | 能量電池 | Energy Cell | 2 | — | 25 | — | Maintenance Station | Restores up to 100 mana. |
| ☑ | I01L | 實驗電容 | Proto-Capacitor | — | — | — | — | 職業／掉落／事件 | This device acts as an easy buffer for electricity to flow in and out of. Increases energy capacity significantly. |
| ☑ | I006 | 興奮劑 | Stim | 10 | — | 15 | 0 | 職業／掉落／事件 | Increases movement speed for 10 seconds. |
| ☑ | I01Q | 濃縮興奮劑 | Concentrated Stim | — | — | 180 | 0 | LQ Storage | Maximizes movement speed for 10 seconds. |
| ☑ | I00F | 強化護腿 | Servo Greaves | — | — | — | — | 職業／掉落／事件 | The augmented leggings provides a 25 movement speed bonus. |
| ☑ | I01D | 慰藉護盾 | Solace Shield | — | — | 40 | 0 | Maintenance Station | Creates an energy shield around the target which will absorb up to 300 damage. Target moves 25% slower while shielded. Dissipates after 15 s… |
| ☑ | I025 | 相位斗篷 | Phase Cloak | 3 | — | 15 | 0 | Outpost Supplies | This device phases the user just enough to make them permeable to electromagnetic radiation, rendering them effectively invisible for a shor… |
| ☑ | I00G | 處決手槍 | Verdict Pistol | 0 | 3 | — | — | 職業／掉落／事件 | The common pistol used by commissars to execute dissidents. Takes 1.5 seconds to aim, deals 125 damage. |
| ☑ | I00N | 熱融炸彈 | Fusion Charge | 1 | — | 60 | 60 | Fusion Bomb Factory | Apparently designed to destroy small asteroids, the fusion bomb is a powerful incendiary device. Once used, you have 3 seconds to clear the … |
| ☑ | I00R | 手榴彈 | Frag Grenade | 5 | — | 20 | — | Outpost Supplies | A pack of grenades that can be lobbed at a target point for delayed damage. |
| ☑ | I017 | 電磁手榴彈 | EMP Grenade | — | — | 20 | — | Outpost Supplies | A pack of grenades that can be lobbed at a target point. When they explode, they will drain mana and briefly prevent hit units from casting … |
| ☑ | I01P | 爆裂手榴彈 | Burst Grenade | 1 | — | 180 | — | LQ Storage | More of an amusing joke than a cost effective weapon, this rather hefty grenade splits into several smaller grenades upon use. |
| ☑ | I01F | 黑洞裝置 | Singularity Device | 1 | — | — | 60 | 職業／掉落／事件 | WARNING: This device requires proper clearance to activate as per U.S.I. Experimental Research standards. Please do not tamper with or activ… |
| ☑ | I01Z | 相位砲 | Phase Cannon | 0 | — | 180 | — | Outpost Supplies | A device that generates a delayed energy pulse at the target location. This pulse will damage those who are caught in it. |
| ☑ | I022 | 重力吸引器 | Gravity Puller | 0 | 3 | — | — | Maintenance Station | A small device specifically designed to pull cages. Can be used on other objects with lesser effect. |
| ☑ | I023 | 重力推斥器 | Gravity Pusher | 0 | 3 | — | — | Maintenance Station | A small device specifically designed to push cages. Can be used on other objects with lesser effect. |
| ☑ | I00K | 監視器 | Security Camera | 0 | 3 | — | — | 職業／掉落／事件 | An unlimited number of small cameras that can be placed to spy upon things. |
| ☑ | I00U | 追蹤器 | Tracker | 0 | — | 15 | — | Outpost Supplies | A powerful locating device that can help you track players. Using it will ping the locations of nearby units within 8000 range and on the sa… |
| ☑ | I00V | 哨戟 | Sentry Turret | 1 | 3 | — | — | 職業／掉落／事件 | Deploys a sentry gun at the target point, which will fire at all players not in your -base group. Takes 5 seconds to deploy. |
| ☑ | I00W | 力場產生器 | Force Barrier | 1 | — | 180 | — | 職業／掉落／事件 | Creates a force shield at the target point. A force shield will protect all units in your base-group while it is active. |
| ☑ | I01M | 動作感應器 | Motion Sensor | 0 | — | 40 | — | Outpost Supplies | Deploys a small monitoring device that will alert you whenever a unit passes. |
| ☑ | I027 | 背包掃描器 | Inventory Scanner | 0 | 3 | — | — | 職業／掉落／事件 | A device which scans the target, revealing the contents of their inventory. |
| ☑ | I028 | 全像投影器 | Holo Projector | 1 | — | — | — | 職業／掉落／事件 | A small floating projector creates an illusory doublle of the target. The projector is rather fragile, but can project indefinitely. |
| ☑ | I00T | 雷達掃描 | Radar Ping | — | — | 90 | — | Radar Station | Advanced imaging technology allows for the detection of known large organic life forms. |
| ☑ | I00M | 基因檢測器 | Gene Sampler | — | 3 | 5 | 420 | Genetic Integrity Tester、Medical Supplies | Originally designed to detect cancer in crewmembers, the genetic testing device can determine if someone is an alien or a mutant. Due to cos… |
| ☑ | I019 | GIT 解析器 | GIT Resolver | 1 | 3 | — | 300 | 職業／掉落／事件 | A miniature analysis device that can determine infection. Requires significant time to set up. |
| ☑ | I01A | 檢測報告 | Test Results | — | — | 30 | — | GIT Resolver | Obtain the test results from the portable GIT Resolver. |
| ☑ | I00H | 扳手 | Wrench | 0 | 3 | — | — | 職業／掉落／事件 | Turns out, an engineer's wrench is mostly for show these days. But you can throw it at someone and it might hurt a bit. |
| ☑ | I00I | 艦長 ID 卡 | Captain's Keycard | 0 | 3 | — | — | 職業／掉落／事件 | Allows access to certain places on the battlecruiser, and allows for the locking of doors on the battlecruiser. Can only be used on the batt… |
| ☑ | I00J | 清潔工 ID 卡 | Janitor's Keycard | — | 3 | — | — | 職業／掉落／事件 | Allows access to certain closets on multiple stations. Can be used once to lock any door, but not unlock it. |
| ☑ | I00P | 現金卡 | Cash Chit | — | 3 | — | — | 職業／掉落／事件 | You really shouldn't be able to read this tooltip. |
| ☑ | I01H | 記憶核心 | Memory Core | 0 | 3 | — | — | 職業／掉落／事件 | This nigh-indestructable card stores approximately 4 petabytes of information. If found, please notify U.S.I. Science authority, or bring to… |
| ☑ | I01I | 遙控器 | Override Remote | — | 3 | — | 0 | 職業／掉落／事件 | This device allows you to control the android. Use once to update targetting parameters, use again to deactivate the android, and use after … |
| ☑ | I00O | 實驗傳送裝置 | Proto-Portal | 1 | — | — | — | Experimental Teleport Device Factory | This obscure and underfunded project apparently has the power to transport any units in range to the teleporter in the tech hall. Please do … |
| ☑ | I00S | 瓦礫清除器 | Debris Clearer | 0 | — | 15 | — | Maintenance Station | Destroys target rubble. Rumoured to be effective against doors. |
| ☑ | I010 | 救生艙憑證 | Escape Pod Pass | — | — | 4 | — | Escape Pod Device | If the station you are in is in critical danger, you may use this device to launch an escape pod which can flee to a station of your choosin… |
| ☑ | I01R | 站點介面裝置 | Station Interface Kit | 0 | — | 300 | — | LQ Storage | Reconstructs a destroyed console. |
| ☑ | I01S | 掃描增幅模組 | Scan Amplifier Module | 0 | — | 0 | — | 職業／掉落／事件 | The ASAD, when installed in the Arbitress's scanning structure, allows for a periodic ping of all player's positions. This item cannot be cl… |
| ☑ | I01T | 反物質傳送模組 | Antimatter Transit Module | 0 | — | 0 | — | 職業／掉落／事件 | This ATM fabricator module contains the requisite instructions, matter structures, and energy required to prepare an antimatter charge and s… |
| ☑ | I01U | 紅隼升級模組 | Kestrel Upgrade Module | 0 | — | 0 | — | 職業／掉落／事件 | This module can improve a raptor's health, damage, speed, and abilities. This item cannot be cloned. |
| ☑ | I01V | 輔助推進模組 | Auxiliary Thruster Module | 0 | — | 0 | — | 職業／掉落／事件 | Allows the Niffy to periodically teleport anywhere on the map. This item cannot be cloned. |
| ☑ | I01W | 精煉礦石 | Refined Ore | 0 | — | 0 | — | 職業／掉落／事件 | Restores 150 ore to the Calipea station. This item cannot be cloned. |
| ☑ | I01X | 神經毒素模組 | Neurotoxin Module | 0 | — | 0 | — | 職業／掉落／事件 | Allows the Calipea station to flood a station with deadly neurotoxins, damaging all units inside it. This item cannot be cloned. |
| ☑ | I01C | 重力校正場 | Gravity Correction Field | — | — | 80 | — | Gravitational Control Device | The moon's built in orbital stabilizers can be temporarily retargeted to nudge objects in space. |
| ☑ | I015 | 蟲餌 | Worm Bait | 0 | 3 | — | — | 職業／掉落／事件 | The local slugglies seem to go crazy for this stuff! |
| ☑ | I029 | 鎮定薰香 | Calming Incense | 0 | 3 | 0 | — | Maintenance Station | Besides having a very refreshing scent (reminiscient of apples), this incense releases potent aggression-blocking chemicals into the air. Mo… |
| ☑ | I012 | 海盜帽 | Pirate Hat | — | — | — | — | 職業／掉落／事件 | Yarrr! |
| ☑ | I01J | 聖誕帽 | Festive Hat | — | — | — | — | 職業／掉落／事件 | Twenty years ago, a military leader named Saint Nicholas miraculously won the battle of Hapstun. Using only a futuristic space-pickaxe and h… |
| ☑ | I013 | 企鵝玩偶 | Penguin Plush | 0 | 3 | — | — | 職業／掉落／事件 | It's a cute, plushy penguin figurine. Clearly it has no use at all. |
| ☑ | I018 | 綿羊玩偶 | Sheep Plush | 0 | 3 | — | — | 職業／掉落／事件 | It's a cute, plushy sheep figurine. Clearly it has no use at all. |

### 販賣機

| ☑ | 原作 id | 原作名稱 | 販售（致敬名稱）|
|---|---|---|---|
| ☑ | h00G | Medical Supplies | 急救包、抗體包、醫療再生器、基因檢測器 |
| ☑ | h00O | Suit Vendor | 冷凍裝、火焰裝、特斯拉裝 |
| ☑ | h00P | Suit Vendor | 輻射裝、光子裝、電漿裝、脈衝裝 |
| ☑ | h00Q | Suit Vendor | 火箭裝、服務裝、機槍裝、磁力裝 |
| ☑ | h00R | Suit Vendor | 酸蝕裝、警衛裝、力場裝、暗物質裝 |
| ☑ | h011 | Genetic Integrity Tester | 基因檢測器 |
| ☑ | h014 | Fusion Bomb Factory | 熱融炸彈 |
| ☑ | h016 | Experimental Teleport Device Factory | 實驗傳送裝置 |
| ☑ | h017 | Maintenance Station | 能量核心、能量電池、瓦礫清除器、慰藉護盾 |
| ☑ | h019 | Radar Station | 雷達掃描 |
| ☑ | h023 | Outpost Supplies | 追蹤器、手榴彈、電磁手榴彈、動作感應器、相位砲、相位斗篷 |
| ☑ | h02O | Escape Pod Device | 救生艙憑證 |
| ☑ | h038 | GIT Resolver | 檢測報告 |
| ☑ | h012 | Gravitational Control Device | 重力校正場 |
| ☑ | h049 | LQ Storage | 站點介面裝置、爆裂手榴彈、濃縮興奮劑 |
| ☑ | h04S | Maintenance Station | 重力推斥器、重力吸引器、鎮定薰香 |

### 異類與仿生人型態

| ☑ | 陣營 | 階 | 原作 id | 致敬名稱 | English | HP | MP | 攻擊 | CD | 射程 | 移速 | 原作技能 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ☑ | xeno | T1 | h02M | 原型體 | Protoform | 650 | 100 | 45 | 1.5 | 400 | 285 | 'Spawn Egg（A05K）、Human Form（A02S）、A02N |
| ☑ | xeno | T2 | h035 | 熵光體（能量型） | Lumen | 700 | 100 | 16 | 0.5 | 600 | 285 | 'Spawn Egg（A05K）、Energy Deflection（A03L）、Alien Energy Attachment（A03J）、Entropy（A03M）、Human Form（A02S）、A02N |
| ☑ | xeno | T2 | h03E | 蠻甲獸（力量型） | Brute | 875 | 100 | 49 | 1.4 | 140 | 330 | 'Spawn Egg（A05K）、Sly Tentacles（A044）、Neurotoxic Poison（A043）、Human Form（A02S）、A02N |
| ☑ | xeno | T2 | h02V | 牽絲者（操控型） | Puppeteer | 700 | 100 | 44 | 1.5 | 600 | 275 | 'Spawn Egg（A05K）、Temporal Flux（A02Z）、Mute-ilate（A02Y）、Human Form（A02S）、A02N |
| ☑ | xeno | T3 | h03A | 爆燃者 | Pyreheart | 900 | 100 | 24 | 0.75 | 650 | 275 | Projected Explosion（A03V）、Alien Fire Attachment（A03T）、Human Form（A02S）、Lord of Flames（A03U）、A02N |
| ☑ | xeno | T3 | h037 | 雷殛者 | Arcflayer | 1050 | 100 | 65 | 1.5 | 140 | 280 | Lightning Strike（A03R）、Alien Electricity Orb Attachment（A03P）、Electromagnetic Disruption（A03Q）、Human Form（A02S）、A02N |
| ☑ | xeno | T3 | h03C | 幻影者 | Phantasm | 700 | 100 | 38 | 1 | 650 | 275 | Blackness（A041）、Manifold（A03Y）、Human Form（A02S）、Alien SkyFire Attachment（A03Z）、A02N |
| ☑ | xeno | T3 | h03G | 石瞳蛇 | Gorgon Serpent | 1700 | 100 | 42 | 1 | 140 | 295 | Petrify（A045）、Neurotoxic Poison（A043）、Human Form（A02S）、A02N |
| ☑ | xeno | T3 | h03P | 再生核 | Hydra Core | 450 | 100 | 70 | 1.25 | 140 | 265 | Swarmbolt（A04W）、Alien Regenerator Core Form（A04T）、Regeneration（A04S）、Human Form（A02S）、A02N |
| ☑ | xeno | T3 | h03V | 織網者 | Weaver | 1600 | 100 | 85 | 1.5 | 250 | 265 | Fountain of Chaos（A05C）、Human Form（A02S）、Webwire（A05B）、A02N |
| ☑ | xeno | T3 | h031 | 虛空行者 | Voidwalker | 850 | 100 | 65 | 1.5 | 600 | 280 | Alien Orb Attachment（A03A）、Spatial Relocation（A03C）、Spatial Swap（A03I）、Human Form（A02S）、A02N |
| ☑ | xeno | T3 | h02Y | 時序者 | Chronarch | 850 | 100 | 69 | — | 600 | 275 | Back from Hell（A032）、Human Form（A02S）、Closed Timelike Loop（A033）、A02N |
| ☑ | xeno | T3 | h033 | 假面者 | Mimic | 700 | 100 | 38 | 1 | 140 | 285 | Night of Masks（A03K）、Mute-ilate（A02Y）、Human Form（A02S）、A02N |
| ☑ | mutant | T1 | h00U | 掠食者（完美路線） | Apex | 900 | 100 | 37 | 1 | 140 | 305 | Cannibalize（A076）、Devour（A05M）、Sludge（A012） |
| ☑ | mutant | T1 | h00V | 孢母（感染路線） | Sporemother | 725 | 100 | 38 | 1 | 140 | 305 | Devour（A05M）、Infection（A013） |
| ☑ | mutant | T2 | h01B | 迅影 | Blitz | 900 | 100 | 32 | 1 | 140 | 320 | Cannibalize（A076）、Devour（A05M）、Roar（A01J）、Don't Blink（A01I）、Spatial Burst（A02M） |
| ☑ | mutant | T2 | h01E | 蠻力 | Brawn | 1800 | 100 | 100 | — | 140 | 225 | Cannibalize（A076）、Devour（A05M）、Fleshies（A01O）、Roar（A01J）、Smash（A098） |
| ☑ | mutant | T2 | h01I | 擬人株 | Mimetic Strain | 1000 | 100 | 32 | 1 | 500 | 295 | Devour（A05M）、Roar（A01J）、Tainted Vendor（A01T）、Infection（A01S） |
| ☑ | mutant | T2 | h01O | 蛛母 | Spinner | 900 | 100 | 19 | 0.5 | 160 | 320 | Devour（A05M）、Roar（A01J）、Reabsorption（A01Z）、Spiderlings（A01Y） |
| ☑ | mutant | T3 | h01D | 潛伏者 | Lurker | 1250 | 100 | 124 | 2.7 | 2400 | 320 | Devour（A05M）、Roar（A01J）、Omniscience（A01M）、Stalk（A01L） |
| ☑ | mutant | T3 | h01C | 甲蟹 | Carcinid | 700 | 400 | 150 | 6 | 900 | 20 | Crab Mutant Health Bonus（A07H）、Panic（A07G）、Crabosity（A07F）、Roar（A01J） |
| ☑ | mutant | T3 | h01G | 血肉巨像 | Flesh Colossus | 6000 | 100 | 120 | — | 160 | 205 | It's Raining Rocks（A05F）、Flesh Golem（A05E）、Rocks Fall, Everyone Dies（A01Q）、Roar（A01J）、Smash（A098） |
| ☑ | mutant | T3 | h01H | 牛頭蠻 | Taurus | 2400 | 100 | 85 | 1 | 160 | 240 | Rolling Thunder（A08T）、Charge（A08R）、Roar（A01J） |
| ☑ | mutant | T3 | h01K | 瘟后 | Plague Queen | 1600 | 100 | 48 | 1 | 140 | 290 | Vector（A05J）、Blast Shield（A01W）、Roar（A01J）、Total Infection（A01V） |
| ☑ | mutant | T3 | h01L | 繁巢 | Broodmother | 1050 | 100 | 34 | 1.1 | 900 | 290 | Carrier（A05I）、Blast Shield（A01W）、Roar（A01J）、Infection（A01X） |
| ☑ | mutant | T3 | h01V | 腐沼 | Blightcrawler | 1500 | 100 | 75 | 1.5 | 420 | 310 | Roar（A01J）、Metamorphosis（A023） |
| ☑ | mutant | T3 | h04H | 祭儀者 | Ritualist | 800 | 100 | 39 | 1 | 140 | 290 | Cannibalize（A076）、Devour（A05M）、Roar（A01J）、Don't Blink（A01I）、Spatial Burst（A02M） |
| ☑ | mutant | T3 | h04G | 巢艦（太空） | Hiveship | 300000 | 100 | 9000 | 3 | 1600 | 60 | Guardian（A08N）、View Intestines（A08M）、IsStation Tag（A072） |
| ☑ | mutant | T3 | h04W | 巢艦（地面） | Hiveship (ground) | 16000 | 100 | 20 | 0.5 | 160 | 0 | Roar（A01J） |
| ☑ | android | T2 | h02F | 壁壘型 | Bulwark Chassis | 2200 | 100 | 109 | 3 | 1400 | 200 | Prism Rockets（A05U）、Automatic Restoration（A02E）、Tactical Nuclear Explosion（A02D） |
| ☑ | android | T2 | h047 | 疾風型 | Gale Chassis | 1100 | 100 | 27 | 0.65 | 120 | 320 | Rotary Dodge（A065）、Pulse Wave（A068）、Automatic Restoration（A069） |
| ☑ | android | T2 | h02U | 企鵝型 | Pengu Chassis | 1200 | 100 | 5 | 0.02 | 1900 | 360 | Automatic Restoration（A02E）、Tactical Nuclear Explosion（A02D） |

#### 異類進化樹

| 陣營 | 門檻 | 選擇 |
|---|---|---|
| 異形 | 660 EP | 熵光體（能量）／蠻甲獸（力量）／牽絲者（操控）|
| 異形 | 1370 EP | 能量 → 爆燃者／雷殛者／幻影者；力量 → 石瞳蛇／再生核／織網者；操控 → 時序者／虛空行者／假面者 |
| 變種人 | 300 EP | 掠食者（完美）／孢母（感染）|
| 變種人 | 900 EP | 完美 → 迅影／蠻力；感染 → 擬人株／蛛母 |
| 變種人 | 1800 EP | 迅影 → 潛伏者／甲蟹；蠻力 → 血肉巨像／牛頭蠻；擬人株 → 瘟后／繁巢；蛛母 → 巢艦（太空）／巢艦（地面）／腐沼 |
| 仿生人 | 2000 EP | 壁壘型／疾風型／企鵝型（身上有企鵝玩偶才出現）|

每種型態都有對應的 spawn 型與數值，見 `../research/02-core-rules.md` §3.6、§4.3。祭儀者（h04H）存在於物件資料但不在進化樹中，列為「未接上的內容」，可做成額外分支（選配）。

#### 模組（餘燼衛星模組工廠，免費、同時只能生產一個）

| ☑ | 模組 | 生產 | 安裝 | 效果 |
|---|---|---|---|---|
| ☑ | 掃描增幅模組 | 300 s | 裁決者號雷達站 | 每 45 秒對**全體**顯示全圖人員位置；摧毀介面可停止 |
| ☑ | 反物質傳送模組 | 700 s | 天守砲台控制台 | 一次性：鎖定 60 秒後造成 900000 傷害 |
| ☑ | 紅隼升級模組 | 240 s | 停泊中的紅隼 | 技能升級、+30 移速、+30000 HP、+400 傷害 |
| ☑ | 輔助推進模組 | 600 s | 女帝號控制台 | 女帝號可充能 20 秒後跳躍 |
| ☑ | 精煉礦石 | 120 s | 火口號控制台 | 火口號能量 +150 |
| ☑ | 神經毒素模組 | 300 s | 火口號控制台 | 對目標站／船內所有人持續毒傷（仿生人免疫）|


### 飛船

| ☑ | 原作 id | 致敬名稱 | English | HP | 攻擊 | 射程 | 移速 | 原作技能 |
|---|---|---|---|---|---|---|---|---|
| ☑ | h002 | 紅隼級探索艇 | Kestrel | 60000 | 1299 | 1300 | 90 | IsExplorer Tag（A071）、Lifeform Scan（A04X）、Board（A02J）、Armageddon Payload（A003）、Overload（A002）、Dock（A001） |
| ☑ | h043 | 紅隼級探索艇（升級） | Kestrel Mk II | 60000 | 1100 | 1300 | 80 | Armageddon Payload（A003）、Overload（A002） |
| ☑ | h02L | 騾級運輸艇 | Mule | 60000 | 900 | 1300 | 160 | IsExplorer Tag（A071）、Lifeform Scan（A04X）、Anti-boarding Pulse（A03F）、Board（A02J）、Dock（A001） |
| ☑ | h02Q | 槍騎級戰機 | Lancer | 95000 | 2000 | 1100 | 105 | Barrage（A07L）、IsExplorer Tag（A071）、Lifeform Scan（A04X）、Cloaking Device（A050）、Board（A02J）、Dock（A001） |
| ☑ | h02H | 獵鷹級獵艦 | Harrier | 80000 | 3000 | 1600 | 100 | IsExplorer Tag（A071）、Lifeform Scan（A04X）、Focused Wave Cannon（A05D）、Board（A02J）、Gravitational Beam（A02K）、Dock（A001） |
| ☑ | h03J | 綿羊號 | Woolly | 60000 | 450 | 1100 | 140 | IsExplorer Tag（A071）、Lifeform Scan（A04X）、Board（A02J）、Dock（A001） |
| ☑ | h02T | 胡蜂無人戰機 | Wasp Drone | 7500 | 199 | 700 | 120 | Gravitational Targetting（A02V） |
| ☑ | h02P | 救生艙 | Escape Pod | 18000 | 900 | 1300 | 1 | Amim、Set Trajectory（A004） |
| ☑ | h02B | 黑鷗號海盜船 | Black Gull | 300000 | 360 | 1300 | 140 | IsStation Tag（A072）、Shield Attachment（A02B） |
| ☑ | h04D | 小行星 | Asteroid | 20000 | 900 | 1300 | 1 | — |

### 地點（太空層實體）

| ☑ | 原作 id | 致敬名稱 | English | HP | 攻擊 | 原作技能 |
|---|---|---|---|---|---|---|
| ☑ | h009 | 女帝號 | Empress Nyx | 500000 | 200 | IsStation Tag（A072）、Force Dock（A04D） |
| ☑ | h003 | 裁決者號 | Adjudicatrix | 400000 | 124 | IsStation Tag（A072） |
| ☑ | h007 | 天守砲台 | Tenshu Battery | 200000 | 125 | IsStation Tag（A072）、Kyo Cannon（A005） |
| ☑ | h005 | 七號廢站 | Hulk-7 | 120000 | 12500 | IsStation Tag（A072） |
| ☑ | h00X | 豪勇號 | Bravado | 300000 | 700 | IsStation Tag（A072）、Landing Procedures（A04O）、Autopilot（A02P） |
| ☑ | h04E | 火口號 | Caldera | 130000 | 185 | External Repair Apparatus（A02U）、Board（A02J）、IsExplorer Tag（A071）、Construct Cordoning Beacon（A07A）、IsStation Tag（A072） |
| ☑ | h04T | 活體庫號 | Vivarium | 220000 | 185 | IsStation Tag（A072） |
| ☑ | h04V | 擺渡號 | Portage | 180000 | 51 | Force Dock（A04D）、Board（A02J）、IsExplorer Tag（A071）、IsStation Tag（A072） |
| ☑ | h008 | 翠原星 | Verdance | 999999 | 125 | IsStation Tag（A072） |
| ☑ | h03T | 餘燼衛星 | Cinder | 100000 | 125 | IsStation Tag（A072）、Shielding（A04Z） |
| ☑ | h01A | 恆星 | Aster | 800000 | 125 | — |
| ☑ | h029 | 未識別物體 | Unidentified Object | 999999 | 1 | IsStation Tag（A072） |
| ☑ | h040 | 譴責號（末日艦隊） | Censure | 150000 | 400 | Landing Procedures（A04O）、Autopilot（A02P） |
| ☑ | h041 | 舊往號（末日艦隊） | Erstfall | 150000 | 400 | Landing Procedures（A04O）、Autopilot（A02P） |
| ☑ | h042 | 九頭蛇號（末日艦隊） | Hydra | 300000 | 200 | Landing Procedures（A04O）、Autopilot（A02P） |

## 8. 生物與 NPC

| ☑ | 原作 | 致敬名稱 | 位置 | 要點 |
|---|---|---|---|---|
| ☑ | Sluggly | 蛞蝓仔 | 翠原星約 27 隻、活體庫號 | 無害漫遊；被殺第 15 次可能召來雪團獸守衛 |
| ☑ | 特殊 Sluggly | 蛞蝓長老 | 翠原星 | 給綿羊玩偶 → 綿羊號出現；給其他物品有對話 |
| ☑ | Snoeglay／Warden | 雪團獸／雪團守衛 | 繁殖季事件 | 900 HP 敵對 |
| ☑ | Failed Experiment | 失敗實驗體 | 女帝號實驗室、活體庫號 | 變種人吞食 +25 EP；部分死亡會爆炸 |
| ☑ | Anomaly | 異常體 | 翠原星、活體庫號、事件 | 吞食 +125 EP；活體庫號的會掉隨機物品（含 1% 黑洞裝置）|
| ☑ | Spichen／Overseer | 竄蟲／竄蟲監工 | 活體庫號隔間 5 | 敵對 AI，鎮定薰香可降低仇恨 |
| ☑ | Murmusk | 吼顎獸 | 活體庫號隔間 1 | 1500 HP、90 傷害 |
| ☑ | 地球動物 | 雞、蛙、兔、羊、鹿 | 活體庫號隔間 3 | 可吞食 |
| ☑ | Pirates | 黑鷗海盜團 | 海盜船事件 | 船長、海盜 ×3、哨戟 ×3 |
| ☑ | Freakman | 畸人 | 翠原星 | 掉實驗傳送裝置 |
| ☑ | Fel Fox（作者彩蛋）| 灰狐（致敬作者，credits 註明）| 翠原星 | 永久隱形、掉企鵝玩偶 |
| ☑ | Scientist／Unknown Entity | 殉職研究員／未知存在 | 未識別物體內 | 氛圍與隱形危害 |
| ☑ | Pacification Bot | 綏靖機器人 | 女帝號 | 實驗室模式下攻擊穿防護服的人；也可作為仿生人替代復活載體 |
| ☑ | Defense Drone | 防禦無人機 | 女帝號 ×2 | 玩家可駕駛（不能開船或站）|
| ☑ | Time Zombie | 時滯殭屍 | 時序者技能 | 復活死者為異形 spawn |
| ☑ | Drone Fighter | 胡蜂無人戰機 | 事件 | 50 架 |
| ☑ | NPC 船員（新增）| 船員 | 各站巡邏 | 本作新增，見 GDD §8 |

## 9. 隨機事件與末日

| ☑ | # | 事件 | 一次性 | 摘要 |
|---|---|---|---|---|
| ☑ | 1 | 晉升 | 是 | 政委（存活且非異類）獲得特務裝與新頭銜 |
| ☑ | 2 | 蟲洞物體 | 是 | 未識別物體出現 397 秒，可停靠進入；消失時內部全滅 |
| ☑ | 3 | 天降橫財 | 是 | 原作無效果；**本作改為**：所有販賣機立即補滿 |
| ☑ | 4 | 外星護盾海盜船 | 是 | 登船殺海盜、打爆主控台後 40 秒自爆 |
| ☑ | 5 | 蛞蝓仔繁殖季 | 是 | 全部變成雪團獸 |
| ☑ | 6 | 異常體湧現 | 是 | 12 隻異常體出現在隨機玩家身邊 |
| ☑ | 7 | 星區新聞 | 否 | 12 則原創頭條（氛圍）|
| ☑ | 8 | 政府強化劑 | 是 | 人類到女帝號指定點五選一永久強化（移速／HP／攻速／能量／射程）|
| ☑ | 9 | 無人機艦隊 | 是 | 50 架無人戰機進入太空層 |
| ☑ | 10 | 太陽活動 | 是 | 恆星灼燒係數 1.7 → 6 |
| ☑ | 11 | 門控制器故障 | 否 | 300–600 秒內門會反覆開關夾人（225 傷害）|
| ☑ | 12 | 小行星帶 | 是 | 5 波共 50 顆，撞站／撞船 |
| ☑ | 13 | 廣告玩笑 | 是 | 原創惡搞廣播 |
| ☑ | 14 | 有東西要來了 | 是 | 之後連續觸發 3 個事件 |
| ☑ | 15 | 假結束畫面 | 生效才一次 | 1/6 機率生效：「人類勝利」6 秒後改口 |
| ☑ | 16 | 通訊病毒（原作死碼，新增）| 是 | 全員名字清空 10 秒後隨機互換名字與顏色 |
| ☑ | 17 | 蛞蝓仔大量出沒（原作死碼，新增）| 是 | 各站湧入蛞蝓仔 |
| ☑ | 18 | 天守砲台收容失效（原作孤兒字串，新增）| 是 | 需在時限內對行星放電，否則砲台爆炸 |
| ☑ | A1 | 末日：艦隊清場 | — | 警告後 120 秒，3 艘主力艦＋6 艘紅隼抵達 |
| ☑ | A2 | 末日：軌道穩定器失效 | — | 太空所有物體被拉向恆星；翠原星表面是唯一安全處 |

## 10. 彩蛋

| ☑ | 彩蛋 | 觸發 |
|---|---|---|
| ☑ | 綿羊號 | 失敗實驗體掉綿羊玩偶 → 交給蛞蝓長老 → 太空出現綿羊號（艙內 12 隻羊）|
| ☑ | 企鵝型仿生人 | 身上有企鵝玩偶時升級選單多一個選項 |
| ☑ | 黑洞裝置 | 蟲洞事件後、45 分鐘以後，在群組頻道輸入通關句＋未識別物體內的 4 位數啟用碼（原作通關句以雜湊比對、無法還原，本作自訂一句致敬台詞）|
| ☑ | 節慶帽／海盜帽 | 清潔工翻箱、海盜船長掉落 |
| ☑ | `-iamthesluggly` | 死者每人一次附身一隻蛞蝓仔 |
