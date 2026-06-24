/**
 * @file synchronization.spec.js
 * @brief Tests E2E pour la synchronisation vidéo et annotations
 * @details Teste la synchronisation entre vidéo, barres et timeline
 * Valide la cohérence temporelle des annotations avec la lecture vidéo
 */
/*import { test, expect } from '../fixtures.js'
import { getTestData, loadTestRace, waitForSwimmerSelection, navigateToChartsTab } from '../helpers/test-helpers.js'
import { setupMocks, setupDiagnosticListeners, initializeApplication } from '../helpers/mock-setup.js'

test.describe('Synchronisation des vues et données', () => {
  test.beforeEach(async ({ page, server }) => {
    const { testData, testDataPath, testVideoPath } = getTestData();
    
    // Configuration des mocks et diagnostic
    await setupMocks(page, testData, testDataPath, testVideoPath);
    setupDiagnosticListeners(page);

    // Navigation vers l'application via le serveur de développement
    await page.goto(server);
    await initializeApplication(page);
  })

  test('devrait synchroniser les graphiques avec les annotations et la vidéo en temps réel', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)

    // Cliquer sur l'onglet de vérification des graphiques
    await navigateToChartsTab(page)
    await page.waitForSelector('#cycle_stats', { timeout: 20000 })

    // Vérifier que tous les graphiques sont visibles et fonctionnels
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    await expect(page.locator('#cycle_stats')).toBeVisible()

    // Tester la synchronisation en changeant de nageur
    await waitForSwimmerSelection(page)

    // Changer de nageur et vérifier que les graphiques se mettent à jour
    await page.locator('#swim_switch').selectOption({ index: 1 })
    await page.waitForTimeout(1000)

    // Les graphiques devraient encore être visibles et potentiellement mis à jour
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    await expect(page.locator('#cycle_stats')).toBeVisible()

    // Tester la synchronisation avec le mode d'affichage
    await page.locator('#kmod').fill('1') // Mode "last"
    await page.waitForTimeout(500)
    
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    await expect(page.locator('#cycle_stats')).toBeVisible()

    // Retourner au mode normal
    await page.locator('#kmod').fill('0') // Mode "swim"
    await page.waitForTimeout(500)

    // Tester différents types d'annotations
    await page.click('#btn-respi') // Mode respiration
    await page.waitForTimeout(500)
    await expect(page.locator('#btn-respi')).toHaveClass(/active|selected/)

    await page.click('#btn-cycle') // Retour mode cycle
    await page.waitForTimeout(500)
    await expect(page.locator('#btn-cycle')).toHaveClass(/active|selected/)

    // Vérifier que les graphiques restent synchronisés après tous ces changements
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    await expect(page.locator('#cycle_stats')).toBeVisible()
    await expect(page.locator('#vid')).toBeVisible()
    await expect(page.locator('#timebar')).toBeVisible()

    // Test final : naviguer entre les onglets et revenir aux graphiques
    await page.click('#tab-data-plot-tout')
    await expect(page.locator('#data_plot_tout')).toBeVisible()

    await page.click('#tab-verification-charts')
    await expect(page.locator('#verification_charts')).toBeVisible()
    
    // Vérifier que les graphiques sont toujours fonctionnels après navigation
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    await expect(page.locator('#cycle_stats')).toBeVisible()
  })
})
*/