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

const POWER_ICONS: Record<string, string> = { normal: 'stop', ambient: 'battery', explorer: 'ship', station: 'bolt', lab: 'dna' }

const box = { position: 'absolute', right: '12px', bottom: '210px', width: '320px', padding: '12px' } as const

function act(e: number, a: string, s?: number): void {
  sfx('ui')
  sendCmd(s === undefined ? { k: 'facility', e, a } : { k: 'facility', e, a, s })
}

function Offline({ off }: { off: number }) {
  return off > 0 ? <div class="notice">{t('fac.offlineFor', { s: off })}</div> : null
}

function PowerPanel({ v }: { v: Extract<FacilityView, { k: 'power' }> }) {
  return (
    <div class="panel" data-testid="fac-power" style={box}>
      <h3>{t('fac.power.title')}</h3>
      <div class="dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
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
                <div style={{ fontSize: '13px' }}>
                  {t('fac.power.mode.' + m)}
                  {cur ? ' · ' + t('fac.current') : cd > 0 ? ' · ' + t('fac.cd', { s: cd }) : ''}
                </div>
                <div class="dim" style={{ fontSize: '11px' }}>
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
    <div class="panel" data-testid="fac-factory" style={box}>
      <h3>{t('fac.factory.title')}</h3>
      <div class="dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
        {t('fac.factory.hint')}
      </div>
      <Offline off={v.off} />
      <div class="mono" style={{ fontSize: '12px', marginBottom: '8px' }}>
        {cur ? t('fac.factory.building', { item: loc(cur.name), s: v.left }) : t('fac.factory.idle')}
      </div>
      <div class="col" style={{ gap: '6px' }}>
        {Object.entries(MODULE_BUILD).map(([id, s]) => {
          const it = itemDef(id)
          return (
            <button key={id} data-testid={'factory-' + id} class="row" style={{ gap: '8px', justifyContent: 'flex-start', textAlign: 'left' }} disabled={v.off > 0 || v.cur === id} onClick={() => act(v.e, id)}>
              <Icon name={it?.icon ?? 'module'} size={20} />
              <span class="grow" title={loc(it?.desc)} style={{ fontSize: '13px' }}>
                {loc(it?.name) || id}
              </span>
              <span class="dim mono" style={{ fontSize: '11px' }}>
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
    <div class="panel" data-testid="fac-cells" style={box}>
      <h3>{t('fac.cells.title')}</h3>
      <div class="dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
        {t('fac.cells.hint')}
      </div>
      <Offline off={v.off} />
      <div class="col" style={{ gap: '6px' }}>
        {v.open.map((open, i) => (
          <button key={i} data-testid={'cell-' + (i + 1)} class="row" style={{ gap: '8px', justifyContent: 'flex-start' }} disabled={v.off > 0} onClick={() => act(v.e, 'cell', i)}>
            <Icon name={open ? 'door' : 'key'} size={20} color={open ? '#ff5a4a' : '#5cf2a5'} />
            <span class="grow" style={{ fontSize: '13px' }}>
              {cellName(i)}
            </span>
            <span class="dim mono" style={{ fontSize: '11px' }}>
              {open ? t('fac.cells.open') : t('fac.cells.closed')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CagePanel({ v }: { v: Extract<FacilityView, { k: 'cage' }> }) {
  return (
    <div class="panel" data-testid="fac-cage" style={box}>
      <h3>{t('fac.cage.title')}</h3>
      <div class="dim" style={{ fontSize: '12px', marginBottom: '8px' }}>
        {t('fac.cage.hint')}
      </div>
      <Offline off={v.off} />
      <div class="mono" style={{ fontSize: '12px', marginBottom: '8px' }}>
        {t('fac.cage.pad', { n: v.pad })}
      </div>
      <button data-testid="cage-build" disabled={v.busy > 0 || v.off > 0} onClick={() => act(v.e, 'cage')}>
        {v.busy > 0 ? t('fac.cage.busy', { s: v.busy }) : t('fac.cage.build')}
      </button>
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
