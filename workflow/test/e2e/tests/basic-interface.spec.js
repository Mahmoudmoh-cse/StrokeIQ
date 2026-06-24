import { test, expect } from '../fixtures.js'
import { getTestData, loadTestRace } from '../helpers/test-helpers.js'
import { setupMocks, setupDiagnosticListeners, initializeBasicApplication, mockConfigurations } from '../helpers/mock-setup.js'

/**
 * @file basic-interface.spec.js
 * @brief Tests E2E pour l'interface principale et navigation de base
 * @details Teste le chargement de l'interface, responsivité et sélection de données
 * Valide les interactions utilisateur fondamentales de l'application
 */
test.describe('Interface principale - Tests de base', () => {
  test.beforeEach(async ({ page, server }) => {
    const { testData, testDataPath, testVideoPath } = getTestData();
    await setupMocks(page, testData, testDataPath, testVideoPath, mockConfigurations.fullData);
    setupDiagnosticListeners(page);

    // Navigation vers l'application via le serveur de développement
    await page.goto(server);
    await initializeBasicApplication(page);
  })

  test('devrait charger l\'interface principale', async ({ page }) => {
    // Test de diagnostic : vérifier que les mocks fonctionnent
    console.log('=== Test de diagnostic ===');
    
    // Vérifier que la page de base est chargée
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('#competition')).toBeVisible();
    
    // Vérifier que les éléments de contrôle sont présents
    await expect(page.locator('#run_part1')).toBeVisible();
    await expect(page.locator('#run_part2')).toBeVisible();
    await expect(page.locator('#run_part3')).toBeVisible();
    await expect(page.locator('#run_part4')).toBeVisible();
    
    // Vérifier que le bouton de chargement est présent
    await expect(page.locator('#loadbtn')).toBeVisible();
    
    // Tester une requête de compétitions pour vérifier que les mocks fonctionnent
    const competitionOptions = await page.locator('#competition option').count();
    console.log(`Nombre d'options de compétition: ${competitionOptions}`);
    
    if (competitionOptions > 1) {
      const options = await page.locator('#competition option').allTextContents();
      console.log('Options de compétition disponibles:', options);
    }
  })

  test('devrait être responsive', async ({ page }) => {
    // Test avec différentes tailles d'écran
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(page.locator('#competition')).toBeVisible()

    await page.setViewportSize({ width: 800, height: 600 })
    await expect(page.locator('#competition')).toBeVisible()

    await page.setViewportSize({ width: 400, height: 600 })
    await expect(page.locator('#competition')).toBeVisible()
    
    // Vérifier que les éléments de base restent visibles sur mobile
    await expect(page.locator('#loadbtn')).toBeVisible()
  })

  test('devrait gérer le chargement de données JSON', async ({ page }) => {
    // Utiliser la fonction helper pour charger la course de test
    await loadTestRace(page)
    
    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await page.click('#tab-verification-charts')
    
    await page.waitForSelector('#stats', { timeout: 20000 })
    
    // Vérifier que les données JSON sont bien gérées
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
  })

  test('devrait synchroniser les sélecteurs avec les paramètres URL', async ({ page, server }) => {
    await page.goto(`${server}?competition=2025_CF_Montpellier&course=2025_CF_Montpellier_4nages_hommes_400_serie2&data=test_data.csv`)
    await initializeBasicApplication(page)

    await page.waitForFunction(() => {
      return document.querySelector('#temp')?.value === 'test_data.csv'
    }, { timeout: 20000 })

    await expect(page.locator('#competition')).toHaveValue('2025_CF_Montpellier')
    await expect(page.locator('#run_part1')).toHaveValue('4nages')
    await expect(page.locator('#run_part2')).toHaveValue('hommes')
    await expect(page.locator('#run_part3')).toHaveValue('400')
    await expect(page.locator('#run_part4')).toHaveValue('serie2')
    await expect(page.locator('#temp')).toHaveValue('test_data.csv')
  })

  test('devrait afficher la checkbox des limites de piscine et basculer les contours', async ({ page }) => {
    await expect(page.locator('#show_pool_boundaries')).toBeVisible()
    await expect(page.locator('label[for="show_pool_boundaries"]')).toHaveText('piscine')

    await loadTestRace(page)

    await page.waitForFunction(() => {
      return Boolean(window.megaData && window.megaData.length > 0 && window.megaData[0]?.videos?.length)
    }, { timeout: 20000 })

    await expect(page.locator('.pool_boundary_line')).toHaveCount(0)

    await page.locator('#show_pool_boundaries').check()
    await expect(page.locator('#show_pool_boundaries')).toBeChecked()
    await page.waitForFunction(() => {
      return document.querySelector('#imgctrlpts-video-surface')?.value?.length >= 4
    }, { timeout: 10000 })
    await expect(page.locator('.pool_boundary_line')).toHaveCount(0)

    await page.locator('#show_pool_boundaries').uncheck()
    await expect(page.locator('#show_pool_boundaries')).not.toBeChecked()
    await page.waitForFunction(() => {
      return document.querySelector('#imgctrlpts-video-surface')?.value?.length === 0
    }, { timeout: 10000 })
  })

  test('devrait permettre de sélectionner une compétition, une course, la charger puis changer les paramètres', async ({ page }) => {
    // 1. Charger la première configuration
    await loadTestRace(page)
    
    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await page.click('#tab-verification-charts')
    
    // Attendre que la première course soit chargée
    await page.waitForSelector('#stats', { timeout: 20000 })
    await expect(page.locator('#stats')).toBeVisible()
    
    // 2. Tester le changement de configuration avec la même compétition
    // Attendre que le sélecteur de nageur soit disponible
    await page.waitForFunction(() => {
      const select = document.querySelector('#swim_switch');
      return select && select.options.length > 1;
    }, { timeout: 10000 });
    
    // Changer de nageur pour tester la réactivité
    await page.locator('#swim_switch').selectOption({ index: 1 })
    await page.waitForTimeout(1000)
    
    // Vérifier que les graphiques sont toujours fonctionnels
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
  })
})
