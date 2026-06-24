/**
 * @file fixtures.js
 * @brief Fixtures Playwright pour les tests E2E
 * @details Configure le serveur HTTP et les mocks pour les tests end-to-end
 * Gère le démarrage/arrêt automatique du serveur de développement
 */
import { test as base, devices } from '@playwright/test'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { createMinimalMP4 } from '../utils/video-generator.js'
import net from 'net'

const wait = promisify(setTimeout)

// Find an available port starting from a given port
function findAvailablePort(startPort = 5000) {
  return new Promise((resolve, reject) => {
    function checkPort(port) {
      const server = net.createServer()
      server.listen(port, () => {
        server.close(() => {
          // Attendre un peu pour s'assurer que le port est vraiment libéré
          setTimeout(() => resolve(port), 100)
        })
      })
      server.on('error', () => {
        if (port < startPort + 1000) { // Augmenter encore plus la plage de recherche
          checkPort(port + 1)
        } else {
          reject(new Error('No available ports found'))
        }
      })
    }
    // Utiliser un port beaucoup plus différent basé sur le PID et timestamp pour éviter les conflits
    const basePort = startPort + (process.pid % 2000) + (Date.now() % 1000)
    checkPort(basePort)
  })
}

// Extend base test with a custom server fixture
export const test = base.extend({
  // Server fixture that starts/stops the HTTP server
  server: async ({}, use) => {
    // Find an available port
    const port = await findAvailablePort(5000)

    // Start the HTTP server from the project root
    // Determine the correct path to serve from
    const isInTestDir = process.cwd().includes('\\test\\e2e')
    const servePath = isInTestDir ? '../..' : '.'
    
    console.log('Current working directory:', process.cwd())
    console.log('Serving from path:', servePath)
    
    const server = spawn('npx', ['http-server', servePath, '-p', port.toString(), '-c-1', '--cors'], {
      stdio: 'inherit', // Show server output for debugging
      shell: true
    })

    // Wait longer for server to start
    await wait(4000)
    
    console.log(`Server started on port ${port}`)

    try {
      // Use the test-specific index file for E2E tests
      await use(`http://localhost:${port}/workflow/test/index-test.html`)
    } finally {
      // Clean up - kill server and all child processes
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', server.pid, '/f', '/t'], { shell: true })
      } else {
        server.kill('SIGTERM')
      }
      await wait(2000) // Wait longer for cleanup
      console.log(`Server stopped on port ${port}`)
    }
  },
})

export { expect } from '@playwright/test'
