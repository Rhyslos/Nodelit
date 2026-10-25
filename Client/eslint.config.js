import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // each context file exports its provider and the hook that reads it; that pairing is intentional
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
        allowExportNames: ['useAuth', 'useKanban', 'useNotation', 'useStream', 'useTheme', 'useToast'],
      }],
      // advisory: flags the common "reset state / start loading when an input changes" effects.
      // Kept visible as a warning; rewriting every data hook for it would risk working features.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
])
