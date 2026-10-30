// 主選單動態太空背景
import { useEffect, useRef } from 'preact/hooks'
import { getEngine } from '../render/engine'
import { MenuScene } from '../render/menuScene'

export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let engine: ReturnType<typeof getEngine> | null = null
    try {
      engine = getEngine(c)
      engine.setScene(new MenuScene())
      engine.start()
    } catch (e) {
      console.warn('WebGL 初始化失敗', e)
    }
    return () => engine?.setScene(null)
  }, [])
  return <canvas class="view" ref={ref} />
}
