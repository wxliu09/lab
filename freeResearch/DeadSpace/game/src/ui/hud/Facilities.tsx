// 站內設施操作面板（M7）：站在動力分配台、模組工廠、隔間門控制台、籠子控制台旁邊就出現。
// 資料來自本人的 PrivateState.fac（sim 端 systems/facilities.ts 的 facilityView），按鈕送 facility 指令。
import { snapTick, sendCmd, world } from '../../client/session'
import { MODULE_BUILD, POWER_MODES } from '../../shared/content/facilities'
import { itemDef } from '../../shared/content/registry'
import { STATION_BY_ID } from '../../shared/content/stations/index'
import type { FacilityView } from '../../shared/protocol/messages'
import { sfx } from '../../audio/sfx'
import { loc, t } from '../i18n'
import { Icon } from '../icons'
import { tipProps } from '../tooltip'
import { OpenSound } from './OpenSound'

const POWER_ICONS: Record<string, string> = { normal: 'stop', ambient: 'battery', explorer: 'ship', station: 'bolt', lab: 'dna' }

/** 面板標頭：圖示＋名稱＋「靠近時開啟」*/
function Head({ icon, title }: { icon: string; title: string }) {
  return (
    <div class="ip-head">
      <OpenSound />
      <Icon name={icon} size={26} color="#ffc23d" />
      <div>
        <h3>{title}</h3>
        <div class="ip-sub">{t('panel.nearby')}</div>
      </div>
    </div>
  )
}

function act(e: number, a: string, s?: number): void {
  sfx('ui')
  sendCmd(s === undefined ? { k: 'facility', e, a } : { k: 'facility', e, a, s })
}

function Offline({ off }: { off: number }) {
  return off > 0 ? <div class="notice">{t('fac.offlineFor', { s: off })}</div> : null
}

function PowerPanel({ v }: { v: Extract<FacilityView, { k: 'power' }> }) {
  return (
    <div class="panel interact-panel" data-testid="fac-power">
      <Head icon="bolt" title={t('fac.power.title')} />
      <div class="dim ip-hint">
        {t('fac.power.hint')}
      </div>
      <Offline off={v.off} />
      <div class="col" style={{ gap: '6px' }}>
        {POWER_MODES.map((m, i) => {
          const cur = v.mode === i
          const cd = v.cd[i] ?? 0
          return (
            <button key={m} data-testid={'power-' + m} class="row" style={{ gap: '10px', justifyContent: 'flex-start', textAlign: 'left' }} disabled={cur || cd > 0 || v.off > 0} onClick={() => act(v.e, 'power', i)}>
              <Icon name={POWER_ICONS[m] ?? 'bolt'} size={20} color={cur ? '#ffc23d' : '#9fe7ff'} />
              <span class="grow">
                <div class="ip-name">
                  {t('fac.power.mode.' + m)}
                  {cur ? ' · ' + t('fac.current') : cd > 0 ? ' · ' + t('fac.cd', { s: cd }) : ''}
                </div>
                <div class="dim ip-meta">
                  {t('fac.power.desc.' + m)}
                </div>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FactoryPanel({ v }: { v: Extract<FacilityView, { k: 'factory' }> }) {
  const cur = v.cur ? itemDef(v.cur) : undefined
  return (
    <div class="panel interact-panel" data-testid="fac-factory">
      <Head icon="module" title={t('fac.factory.title')} />
      <div class="dim ip-hint">
        {t('fac.factory.hint')}
      </div>
      <Offline off={v.off} />
      <div class="mono ip-status">
        {cur ? t('fac.factory.building', { item: loc(cur.name), s: v.left }) : t('fac.factory.idle')}
      </div>
      <div class="col" style={{ gap: '6px' }}>
        {Object.entries(MODULE_BUILD).map(([id, s]) => {
          const it = itemDef(id)
          return (
            <button key={id} data-testid={'factory-' + id} class="row" style={{ gap: '8px', justifyContent: 'flex-start', textAlign: 'left' }} disabled={v.off > 0 || v.cur === id} onClick={() => act(v.e, id)}>
              <Icon name={it?.icon ?? 'module'} size={20} />
              <span class="grow ip-name" {...tipProps(() => (it ? { title: loc(it.name), body: loc(it.desc) } : null))}>
                {loc(it?.name) || id}
              </span>
              <span class="dim mono ip-meta">
                {t('fac.factory.time', { s })}
              </span>
            </button>
          )
        })}
        {v.cur && (
          <button class="small" data-testid="factory-cancel" onClick={() => act(v.e, 'cancel')}>
            {t('fac.factory.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}

/** 隔間名稱：從活體庫號版面的 cellN 房間取（找不到就用編號）*/
function cellName(i: number): string {
  const room = STATION_BY_ID.get('vivarium')?.layout.rooms.find((r) => r.id === 'cell' + (i + 1))
  return room ? loc(room.name) : t('fac.cells.cell', { n: i + 1 })
}

function CellsPanel({ v }: { v: Extract<FacilityView, { k: 'cells' }> }) {
  return (
    <div class="panel interact-panel" data-testid="fac-cells">
      <Head icon="key" title={t('fac.cells.title')} />
      <div class="dim ip-hint">
        {t('fac.cells.hint')}
      </div>
      <Offline off={v.off} />
      <div class="col" style={{ gap: '6px' }}>
        {v.open.map((open, i) => (
          <button key={i} data-testid={'cell-' + (i + 1)} class="row" style={{ gap: '8px', justifyContent: 'flex-start' }} disabled={v.off > 0} onClick={() => act(v.e, 'cell', i)}>
            <Icon name={open ? 'door' : 'key'} size={20} color={open ? '#ff5a4a' : '#5cf2a5'} />
            <span class="grow ip-name">
              {cellName(i)}
            </span>
            <span class="dim mono ip-meta">
              {open ? t('fac.cells.open') : t('fac.cells.closed')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 籠子控制台：製籠（把平台上的標本關起來，平台上沒有標本也會做出空籠子）＋「從第 N 間取標本」直接把隔間裡的一隻標本移進平台上
 * 還裝得下的籠子。面板不顯示各隔間有幾隻（偽裝成生物的玩家會被看穿），沒有標本的隔間由 sim 回「找不到標本」。
 */
function CagePanel({ v }: { v: Extract<FacilityView, { k: 'cage' }> }) {
  const noCage = v.cage < 0
  const stop = v.busy > 0 || v.off > 0
  return (
    <div class="panel interact-panel" data-testid="fac-cage">
      <Head icon="key" title={t('fac.cage.title')} />
      <div class="dim ip-hint">
        {t('fac.cage.hint', { cap: v.cap })}
      </div>
      <Offline off={v.off} />
      <div class="mono ip-status cage-status">
        <span>{t('fac.cage.pad', { n: v.pad })}</span>
        <span data-testid="cage-status" class={noCage ? 'warn' : ''}>
          {noCage ? t('fac.cage.noCage') : t('fac.cage.cage', { n: v.cage, cap: v.cap })}
        </span>
      </div>
      <button data-testid="cage-build" disabled={stop} onClick={() => act(v.e, 'cage')}>
        {v.busy > 0 ? t('fac.cage.busy', { s: v.busy }) : t('fac.cage.build')}
      </button>
      <div class="cage-cells">
        {Array.from({ length: v.cells }, (_, i) => (
          <button
            key={i}
            data-testid={'cage-cell-' + (i + 1)}
            disabled={stop || noCage}
            {...tipProps(() => ({ title: t('fac.cage.take', { n: i + 1 }), body: noCage ? t('fac.cage.noCage') : t('fac.cage.takeBody', { cell: cellName(i) }) }))}
            onClick={() => act(v.e, 'cageCell', i)}
          >
            <span class="ip-name">
              <Icon name="dna" size={16} color={noCage ? '#6b7884' : '#5cf2a5'} />
              {t('fac.cage.take', { n: i + 1 })}
            </span>
            <span class="dim cage-cell-room">
              {cellName(i)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function FacilityPanel() {
  void snapTick.value
  const v = world.me.fac
  if (!v || world.me.alive === false) return null
  switch (v.k) {
    case 'power':
      return <PowerPanel v={v} />
    case 'factory':
      return <FactoryPanel v={v} />
    case 'cells':
      return <CellsPanel v={v} />
    case 'cage':
      return <CagePanel v={v} />
  }
  return null
}
