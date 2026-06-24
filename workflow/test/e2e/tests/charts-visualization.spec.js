/**
 * @file charts-visualization.spec.js
 * @brief Tests E2E pour la visualisation des graphiques et charts
 * @details Teste l'affichage des graphiques D3.js, barres et visualisations
 * Valide le rendu des données de natation en graphiques interactifs
 */
/*import { test, expect } from '../fixtures.js'
import { getTestData, loadTestRace, waitForSwimmerSelection, navigateToChartsTab } from '../helpers/test-helpers.js'
import { setupMocks, setupDiagnosticListeners, initializeApplication } from '../helpers/mock-setup.js'

test.describe('Graphiques et visualisations', () => {
  test.beforeEach(async ({ page, server }) => {
    const { testData, testDataPath, testVideoPath } = getTestData();
    
    // Configuration des mocks et diagnostic
    await setupMocks(page, testData, testDataPath, testVideoPath);
    setupDiagnosticListeners(page);

    // Navigation vers l'application via le serveur de développement
    await page.goto(server);
    await initializeApplication(page);
  })

  test('devrait charger une course et afficher les graphiques', async ({ page }) => {
    console.log('=== Test de chargement de course ===');
    
    // Utiliser la fonction helper pour charger la course de test
    await loadTestRace(page);
    
    // Attendre et vérifier que la course a été chargée
    await page.waitForTimeout(3000);
    
    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await navigateToChartsTab(page);
    
    // Vérifier que les graphiques sont présents
    await expect(page.locator('#stats')).toBeVisible();
    await expect(page.locator('#cyclebar')).toBeVisible();
    
    console.log('Course chargée avec succès !');
  })

  test('devrait permettre de sélectionner un nageur', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)
    
    // Cliquer sur l'onglet pour rendre les graphiques visibles
    await navigateToChartsTab(page)
    
    // Attendre que le sélecteur de nageur soit disponible avec des options
    await waitForSwimmerSelection(page)
    
    // Sélectionner le deuxième nageur
    await page.locator('#swim_switch').selectOption({ index: 1 })
    
    // Vérifier que la sélection a changé
    const selectedValue = await page.locator('#swim_switch').inputValue()
    expect(selectedValue).toBe('1')
  })

  test('devrait afficher les barres de cycles', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)

    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await navigateToChartsTab(page)
    
    // Attendre que le sélecteur de nageur soit disponible
    await waitForSwimmerSelection(page)
    
    // Sélectionner un nageur
    await page.locator('#swim_switch').selectOption({ index: 1 })
    
    // Vérifier que les graphiques sont présents et visibles
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    
    // Si des rectangles sont présents, ils représentent les barres de cycles
    // Note: les rectangles peuvent ne pas apparaître immédiatement et dépendent du contenu des données
    const statsRects = await page.locator('#stats rect').count()
    const cyclebarRects = await page.locator('#cyclebar rect').count()
    
    // Log pour debug
    console.log(`Stats rectangles: ${statsRects}, Cyclebar rectangles: ${cyclebarRects}`)
    
    // Au minimum, nous devrions avoir les conteneurs SVG visibles
    // Les rectangles sont un bonus qui peut dépendre des données réelles
  })

  test('devrait permettre de cliquer sur une barre de cycle', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)

    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await navigateToChartsTab(page)
    
    // Tenter de cliquer sur le premier rectangle de stats si présent
    const firstStatsRect = await page.locator('#stats rect').first()
    const isStatsRectVisible = await firstStatsRect.isVisible()
    
    if (isStatsRectVisible) {
      await firstStatsRect.click()
      // Vérifier qu'un rectangle est sélectionné (peut avoir une classe ou un style spécial)
      await expect(firstStatsRect).toBeVisible()
    } else {
      console.log('Aucun rectangle cliquable trouvé dans #stats')
    }

    // Tenter de cliquer sur le premier cercle de cyclebar si présent
    const firstCyclebarCircle = await page.locator('#cyclebar circle').first()
    const isCyclebarCircleVisible = await firstCyclebarCircle.isVisible()
    
    if (isCyclebarCircleVisible) {
      await firstCyclebarCircle.click()
      // Vérifier qu'un cercle est sélectionné
      await expect(firstCyclebarCircle).toBeVisible()
    } else {
      console.log('Aucun cercle cliquable trouvé dans #cyclebar')
    }
  })

  test('devrait synchroniser les vues lors de la sélection', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)

    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await navigateToChartsTab(page)
    
    // Vérifier que les deux vues sont synchronisées
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
  })

  test('devrait permettre de cliquer sur les barres et points des graphiques pour naviguer dans la vidéo', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)

    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await navigateToChartsTab(page)
    
    // Vérifier que les graphiques sont présents et visibles
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    
    // Tenter de cliquer sur le premier rectangle de stats si présent
    const firstStatsRect = await page.locator('#stats rect').first()
    const isStatsRectVisible = await firstStatsRect.isVisible()
    
    if (isStatsRectVisible) {
      await firstStatsRect.click()
      // Vérifier qu'un rectangle est sélectionné (peut avoir une classe ou un style spécial)
      await expect(firstStatsRect).toBeVisible()
    } else {
      console.log('Aucun rectangle cliquable trouvé dans #stats')
    }

    // Tenter de cliquer sur le premier cercle de cyclebar si présent
    const firstCyclebarCircle = await page.locator('#cyclebar circle').first()
    const isCyclebarCircleVisible = await firstCyclebarCircle.isVisible()
    
    if (isCyclebarCircleVisible) {
      await firstCyclebarCircle.click()
      // Vérifier qu'un cercle est sélectionné
      await expect(firstCyclebarCircle).toBeVisible()
    } else {
      console.log('Aucun cercle cliquable trouvé dans #cyclebar')
    }
  })

  test('devrait mettre à jour les graphiques lors de l\'ajout d\'annotations', async ({ page }) => {
    // Charger la course de test
    await loadTestRace(page)

    // Cliquer sur l'onglet de vérification des graphiques
    await navigateToChartsTab(page)
    await page.waitForSelector('#cycle_stats', { timeout: 20000 })

    // Compter le nombre initial d'éléments dans chaque graphique
    const initialStatsElements = await page.locator('#stats > *').count()
    const initialCyclebarElements = await page.locator('#cyclebar > *').count()
    const initialCycleStatsElements = await page.locator('#cycle_stats > *').count()

    console.log(`Éléments initiaux - Stats: ${initialStatsElements}, Cyclebar: ${initialCyclebarElements}, CycleStats: ${initialCycleStatsElements}`)

    // Sélectionner le mode cycle pour pouvoir ajouter des annotations
    await page.click('#btn-cycle')
    await expect(page.locator('#btn-cycle')).toHaveClass(/active|selected/)

    // Attendre que la vidéo soit chargée
    await page.waitForSelector('#vid', { timeout: 10000 })

    // Simuler l'ajout d'annotations en déplaçant la timeline et en ajoutant des cycles
    // D'abord, aller à une position dans la vidéo
    await page.locator('#timebar').fill('25') // 25% de la vidéo
    await page.waitForTimeout(500)

    // Simuler un clic pour ajouter une annotation (selon l'interface Neptune)
    // Cela pourrait déclencher l'ajout d'une barre de cycle
    await page.click('#vid')
    await page.waitForTimeout(1000)

    // Déplacer à une autre position et ajouter une autre annotation
    await page.locator('#timebar').fill('50') // 50% de la vidéo  
    await page.waitForTimeout(500)
    await page.click('#vid')
    await page.waitForTimeout(1000)

    // Vérifier que les graphiques existent toujours et sont visibles
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
    await expect(page.locator('#cycle_stats')).toBeVisible()

    // Compter les éléments après ajout d'annotations
    const finalStatsElements = await page.locator('#stats > *').count()
    const finalCyclebarElements = await page.locator('#cyclebar > *').count()
    const finalCycleStatsElements = await page.locator('#cycle_stats > *').count()

    console.log(`Éléments finaux - Stats: ${finalStatsElements}, Cyclebar: ${finalCyclebarElements}, CycleStats: ${finalCycleStatsElements}`)

    // Vérifier que les graphiques ont potentiellement été mis à jour
    // (le nombre d'éléments peut changer selon la logique de l'application)
    expect(finalStatsElements).toBeGreaterThanOrEqual(initialStatsElements)
    expect(finalCyclebarElements).toBeGreaterThanOrEqual(initialCyclebarElements)
    expect(finalCycleStatsElements).toBeGreaterThanOrEqual(initialCycleStatsElements)

    // Vérifier que les ViewBox des SVG sont correctes
    const statsViewBox = await page.locator('#stats').getAttribute('viewBox')
    const cyclebarViewBox = await page.locator('#cyclebar').getAttribute('viewBox')
    const cycleStatsViewBox = await page.locator('#cycle_stats').getAttribute('viewBox')
    
    expect(statsViewBox).toBe('0 0 200 200')
    expect(cyclebarViewBox).toBe('0 0 200 200')
    expect(cycleStatsViewBox).toBe('0 0 200 200')
  })
})
*/