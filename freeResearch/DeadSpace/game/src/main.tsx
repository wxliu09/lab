import { render } from 'preact'
import '@fontsource/noto-sans-tc/400.css'
import '@fontsource/noto-sans-tc/700.css'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/jetbrains-mono/400.css'
import './ui/styles.css'
import { App } from './ui/App'
import { lang } from './ui/i18n'

document.documentElement.lang = lang.value === 'zh' ? 'zh-Hant-TW' : 'en'
render(<App />, document.getElementById('app')!)
