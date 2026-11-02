// 互動面板出現時播一聲（面板以 key 綁定對象，換對象就重新掛載）
import { useEffect } from 'preact/hooks'
import { sfx } from '../../audio/sfx'

export function OpenSound(): null {
  useEffect(() => sfx('uiOpen'), [])
  return null
}
