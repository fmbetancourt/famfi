import {defineConfig, globalIgnores} from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettierConfig from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  prettierConfig,
  {
    rules: {
      // exhaustive-deps warns correctly most of the time, but its auto-fix
      // suggestions can include unsafe array index access (e.g. array[0].prop
      // in a dep array throws when the array is empty). Always verify manually
      // before accepting the suggested dep array — never blindly apply the fix.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
])

export default eslintConfig
