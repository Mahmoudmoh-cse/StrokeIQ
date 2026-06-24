/**
 * @file basic.spec.js
 * @brief Tests E2E de base pour le serveur HTTP
 * @details Teste le chargement de l'application via serveur de développement
 * Valide la navigation de base et les mocks essentiels
 */
import { test, expect } from './fixtures.js'
import { createMinimalMP4 } from '../utils/video-generator.js'

test.describe('Test de base du serveur', () => {
  test('devrait pouvoir charger l\'application via HTTP', async ({ page, server }) => {
    // Mock les requêtes de base pour éviter les erreurs
    await page.route('**/flat.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          competitions: ["2022_CM_Budapest"],
          courses: {
            "2022_CM_Budapest": ["2022_CM_Budapest_brasse_hommes_100_finaleA"]
          }
        })
      })
    })

    await page.route('**/package.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: "test-app",
          version: "1.0.0"
        })
      })
    })

    // Mock toutes les autres requêtes pour éviter les erreurs
    await page.route('**/getCompets', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    await page.route('**/assets/nageurs_formatted.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    console.log('Navigating to:', server)
    await page.goto(server)
    
    // Vérifier que la page se charge
    await expect(page.locator('body')).toBeVisible()
    
    // Vérifier le titre (adapté pour l'environnement de test)
    await expect(page).toHaveTitle(/Annotation Natation.*Test Environment/)
    
    console.log('Page loaded successfully')
  })
})
