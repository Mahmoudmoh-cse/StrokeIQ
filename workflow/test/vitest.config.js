/**
 * @file vitest.config.js
 * @brief Configuration Vitest pour les tests unitaires et d'intégration
 * Configure l'environnement JSDOM, les patterns de fichiers de test, la couverture de code
 * et exclut les tests E2E qui sont gérés par Playwright
 */

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const setupFile = fileURLToPath(new URL('./setup.js', import.meta.url))

export default defineConfig({
  test: {
    // Environnement DOM pour tester les interactions SVG/Canvas
    environment: 'jsdom',
    
    // Variables globales (describe, it, expect)
    globals: true,
    
    // Setup files
    setupFiles: [setupFile],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'workflow/test/',
        'html/',
        'latex/',
        'build/'
      ]
    },
    
    // Test files patterns - inclut unit et integration, exclut E2E
    include: [
      'workflow/test/unit/**/*.{test,spec}.{js,ts}',
      'workflow/test/integration/**/*.{test,spec}.{js,ts}',
      'workflow/test/**/*.{test,spec}.{js,ts}'
    ],
    exclude: ['workflow/test/e2e/**/*'],
  }
})
