# 內容資料 API（給撰寫遊戲內容的人）

> 所有遊戲內容都是 `src/shared/content/` 下的 TypeScript 資料，載入時註冊到 `registry.ts` 的 Map。
> 模擬端（`src/sim/`）讀資料執行；client 端讀同一份資料顯示名稱、圖示、tooltip。
> 型別定義在 `src/shared/content/types.ts`，**以型別為準**；本文件說明語意與慣例。

## 1. 換算與命名

- 距離公尺：原作 world units ÷ 100（射程 600 → `6`，移速 275 → `2.75` m/s，視野 1400 → `14`）。
- 時間秒；HP、傷害、能量（mana）、冷卻用原值。骰子傷害 `base + dice×sides` → `[base+dice, base+dice×sides]`。
- 名稱用 `docs/design/content-catalog.md` 的致敬命名（中文＋英文）。**所有描述文字（desc）重新原創撰寫**，不得翻譯或改寫原作 tooltip。
- id 慣例：單位 `suit.tesla`、`xeno.lumen`；技能 `ab.<類>.<名>`（例 `ab.tesla.storm`）；buff `bf.<名>`；道具 `<camelCase>`（例 `traumaKit`）。

## 2. 單位 `UnitDef`

| 欄位 | 說明 |
|---|---|
| `model` | render 模型 id。人員與著裝都用 `'human'`（著裝外觀由 def id 決定）；其他見 `src/render/models/` |
| `hp/hpRegen/mp/mpRegen/armor/speed/radius/sight` | 基礎數值；人形 radius 0.4 |
| `attack` | 普攻；`kind`：`hitscan`（槍）、`projectile`（可見飛行物，需 `projSpeed`）、`melee`、`artillery`（拋射落點 AoE）、`beam`；`fx` 是視覺 id；`aoe` 半徑；`onHit` 命中附加效果（例如減速 buff）；`pierce` 直線穿透 |
| `abilities` | 技能 id 陣列（順序 = 指令卡 Q W E R D F；被動放最後）|
| `tags` | 見 types.ts。著裝單位必須有 `['personnel', 'suit']`（**不要** `organic`：著裝者不能被寄生）；未著裝人員 `['personnel', 'organic']` |
| `corpse` | 死亡留下屍體 |
| `life` | 召喚物存活秒數 |
| `drops` | 死亡掉落 `[{item, p}]`（擲到第一個成功的就停）|

## 3. 技能 `AbilityDef`

- `target`：`none`（立即）、`self`、`unit`、`point`、`unitOrPoint`、`passive`（`passiveBuff` 永久附加）、`toggle`。
- `range`（m）、`cd`（s）、`mana`、`cast`（施法時間，期間可被打斷）、`channel`＋`channelTick`＋`tickEffects`（引導）。
- `filter`：目標限制（`organic`、`noStructure`、`corpse`、`rubble`、`mainUnit`、`ship`、`station`、`notFaction`…）。
- `sharedCd`：共享冷卻群組 id；`autocast`：可右鍵切換自動施放（治療類會自動找受傷目標）。
- `icon`：圖示名，必須是 `src/ui/icons.tsx` 裡有的名稱（move stop hold attack heal bolt fire frost shield eye dna bomb grenade rocket saw plasma tentacle egg claw skull gear door card radar scan teleport clock mask web rock storm beam gun drone ship pod module hat plush pill syringe battery camera sensor key suit wrench cloak core star void infect roar evolve devour human speed）。

### 效果原語 `Effect`

| k | 參數 | 行為 |
|---|---|---|
| `damage` | `amount`（數字或 `[min,max]`）、`to`、`aoe?`、`falloff?`、`kind?`、`noSelf?`（預設 true）、`vsStructure?` | `to:'target'` 打目標；有 `aoe` 時以 `to` 指定的點為中心打範圍內所有單位（**含友方**，本作有友傷）|
| `projectile` | `speed`、`fx`、`to`、`onHit`、`count?`、`spread?`（弧度扇形）、`homing?`、`pierce?`、`range?` | 發射飛行物，命中時以命中目標／位置執行 `onHit` |
| `buff` | `buff`、`dur?`、`to`、`aoe?`、`filter?`、`noSelf?` | 套用 buff（`dur` 省略用 buff 自己的 `dur`）|
| `cleanse` | `to`、`tags?` | 移除負面 buff（或指定 infection 類型，例 `['parasite','prion']`）|
| `heal` / `mana` | `amount`、`to`、`aoe?`、`pct?` | 治療／加減能量（負值＝扣）|
| `summon` | `unit`、`count`、`life?`、`at`、`spread?`、`owner?:'hostile'` | 召喚單位（屬於施放者，會自動索敵）|
| `dash` | `speed`、`maxDist`、`to`、`onArrive?`、`hitAlong?` | 衝刺；沿途每個單位執行一次 `hitAlong` |
| `blink` | `to`、`maxDist?`、`behind?` | 瞬移 |
| `knockback` / `pull` | `dist`、`aoe`、`from`/`to` | 擊退／拉近範圍內單位 |
| `zoneObj` | `obj`（單位 def id）、`life`、`at` | 在地上放一個區域物件（風暴、雲霧、蛛網）；物件 def 用 `tags:['noTarget','invuln']`，持續效果寫成它的被動技能 `passiveBuff` 或用 script |
| `delay` | `t`、`then`、`at?` | 延遲執行 |
| `fx` | `fx`、`at` | 純視覺特效 |
| `rubble` / `clearRubble` | 數量與半徑 / 半徑與傷害 | 產生／清除瓦礫（瓦礫會擋路）|
| `reveal` | `radius`、`dur`、`at` | 給施放者陣營一塊暫時視野 |
| `script` | `fn`、`p?` | 呼叫 `regScript(fn, (g, ctx, p) => …)` 註冊的函式 |

`EffectCtx`：`{ caster, target?, x, y, zone, ability?, buff?, itemSlot? }`。`x/y` 是目標點（或目標位置）。

## 4. Buff `BuffDef`

- `vis`：`'all'`（大家看得到）、`'self'`（只有本人）、`'casterFaction'`（本人＋施放者陣營）。**感染類（寄生、朊毒）一律 `casterFaction`**，否則會洩漏資訊。
- 屬性：`move`（倍率）、`moveAdd`、`atkSpeed`、`dmgMult`、`dmgTaken`、`armor`、`regen`、`mpRegen`、`sightMult`、`sightAdd`、`rangeAdd`、`evade`。
- 狀態：`stun`、`silence`、`disarm`、`invuln`、`stealth`、`rooted`、`immuneInfection`；`shield`（吸收量）。
- 週期：`dot`（每秒傷害）、`hot`、`manaBurn`、`every`＋`tickEffects`、`onExpire`。
- `breakOnDamage` / `breakOnAttack`：受傷／攻擊時結束（隱形類用）。

## 5. 道具 `ItemDef`

- `charges`：初始充能（0 = 不消耗）。`use`：使用時施放的技能 id（技能的 `target` 決定要不要選目標；**道具技能不受沉默影響**）。
- `passive`：攜帶時的 buff id。`suit`：防護服穿上後變成的單位 def id。`unique`：每人只能帶一個。
- 「買了就立即生效」的商品（雷達掃描、逃生艙憑證、檢測報告、重力校正場）用 `INSTANT_ITEMS.set(id, (g, buyer, vendor) => boolean)`（`src/sim/systems/vendors.ts`）。

## 6. 販賣機 `VendorDef`

`stock: [{ item, max, restock, delay? }]`；`id` 對應站點版面 POI 的 `ref`（`suitA`～`suitD`、`medical`、`outpost`、`maintenance`、`fusion`、`teleportFactory`、`escapePod`、`radar`、`lq`、`gravity`、`gitTester`、`gitResolver`、`maintenanceB`）。

## 7. Script API（`src/sim/scripts/*.ts`）

```ts
import { regScript } from '../systems/effects'
import { damage, heal } from '../systems/damage'
import { applyBuff, removeBuff, hasBuff } from '../systems/buffs'
import { giveItem, makeItem, morph } from '../systems/items'

regScript('tesla.chargeup', (g, ctx, p) => {
  // g.world.query(zone, x, y, r) → Ent[]；g.world.get(id)；g.world.spawn(def, zone, x, y, owner)
  // g.time；g.world.rng（可重現亂數）；g.emitFx({k, z, x, y, e?, …})；g.after(sec, fn)
  // g.privateLine(slot, i18nKey, args?)；g.systemAll(i18nKey, args?)
})
```

- **不要** import DOM、three.js、`src/render`、`src/ui`（lint 會擋）。
- 改到「誰是什麼身分」的資訊時，只能透過私有訊息或快照規則，**不能**讓其他玩家看到。

## 8. 特效 id

`fx` 字串只是 client 的視覺查表，未知 id 會被忽略（不會壞）。已有：`pistol rifle heavyRifle plasma tesla cryo flame photon saw void mirage rad operative acid gatling force mag pulse rocket grenade boom fusion emp heal blink dash summon storm cloud web beam lightning acidSpit egg cocoon infect`。新增時在 PR 說明列出，render 端補上。

## 9. 測試

`tests/unit/helpers/harness.ts` 的 `Harness.started(n)` 建立 n 人對局；`h.server.game!` 取得 `Game`。範例：

```ts
const { h } = Harness.started(2)
const g = h.server.game!
const p = g.players[0]
const u = g.mainOf(p)!
giveItem(g, u, makeItem('traumaKit'))
g.handleCommand(0, { k: 'use', s: 0 })
h.ticks(20)
```
