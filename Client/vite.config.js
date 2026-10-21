import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// phone text constants
const PHONE_QUERY = '(max-width: 640px)'
const PHONE_TEXT_MAX = 12
const PHONE_TEXT_BUMP = 2

// raises every small font size (12px or less) by 2px on phones, so small labels stay readable
// without hand-written overrides. Runs on index.css once its imports are merged in and adds the
// overrides at the end; phone.css is skipped because it is already sized for phones.
function phoneText() {
    return {
        postcssPlugin: 'nodelit-phone-text',
        OnceExit(root, { AtRule, Rule }) {
            if (!root.source?.input?.file?.endsWith(path.join('src', 'styles', 'index.css'))) return

            const media = new AtRule({ name: 'media', params: PHONE_QUERY })

            root.walkDecls('font-size', decl => {
                const match = /^(\d+(?:\.\d+)?)px$/.exec(decl.value.trim())
                if (!match || Number(match[1]) > PHONE_TEXT_MAX) return
                if (decl.source?.input?.file?.endsWith('phone.css')) return

                const owner = decl.parent
                if (owner.type !== 'rule') return

                const wrapper = owner.parent
                if (wrapper?.type === 'atrule' && /keyframes/.test(wrapper.name)) return
                if (wrapper?.type === 'atrule' && wrapper.name === 'media' && /min-width/.test(wrapper.params)) return

                media.append(new Rule({ selector: owner.selector }).append({
                    prop: 'font-size',
                    value: `${Number(match[1]) + PHONE_TEXT_BUMP}px`,
                    important: decl.important
                }))
            })

            if (media.nodes?.length) root.append(media)
        }
    }
}

phoneText.postcss = true

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    css: {
        postcss: {
            plugins: [phoneText()]
        }
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
})
