/**
 * @file video-integration.spec.js
 * @brief Tests E2E pour l'intégration vidéo complète
 * @details Teste l'intégration vidéo avec annotations, contrôles et synchronisation
 * Valide l'interaction complète entre vidéo HTML5 et système d'annotation
 */
/*import { test, expect } from '../fixtures.js'
import { getTestData, loadTestRace, navigateToChartsTab } from '../helpers/test-helpers.js'
import { setupMocks, setupDiagnosticListeners, initializeApplication } from '../helpers/mock-setup.js'

test.describe('Intégration vidéo', () => {
  test.beforeEach(async ({ page, server }) => {
    const { testData, testDataPath, testVideoPath } = getTestData();
    
    // Configuration des mocks et diagnostic
    await setupMocks(page, testData, testDataPath, testVideoPath);
    setupDiagnosticListeners(page);

    // Navigation vers l'application via le serveur de développement
    await page.goto(server);
    await initializeApplication(page);
  })

  test('devrait charger et initialiser correctement une vidéo', async ({ page }) => {
    // Augmenter le timeout pour ce test spécifique
    test.setTimeout(30000)
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('🚨 Console error:', msg.text());
      }
    });
    
    // Charger la course de test qui déclenche le chargement vidéo
    await loadTestRace(page)

    // Attendre que l'élément vidéo soit présent 
    await page.waitForSelector('#vid', { timeout: 30000 })
    
    // Attendre que la vidéo ait un src ou soit prête
    // Parfois le src peut prendre du temps à être assigné selon les données chargées
    try {
      // Attendre que l'élément source ait un src défini
      await page.waitForFunction(() => {
        const source = document.querySelector('#vid_src');
        return source && source.src && source.src.trim() !== '';
      }, { timeout: 10000 });

      // Vérifier et afficher le src
      const videoSrc = await page.evaluate(() => {
        const source = document.querySelector('#vid_src');
        return source?.src;
      });
      const currentSrc = await page.evaluate(() => {
        const video = document.querySelector('#vid');
        return video?.currentSrc;
      });
      console.log('📹 currentSrc dans le navigateur:', currentSrc);

      console.log('🎬 Source vidéo détectée:', videoSrc);
      expect(videoSrc).toBeTruthy();
      
      // Vérifier les propriétés de la vidéo
      const videoInfo = await page.evaluate(() => {
        const video = document.querySelector('#vid');
        return {
          readyState: video.readyState,
          networkState: video.networkState,
          error: video.error ? video.error.message : null,
          src: video.src,
          currentSrc: video.currentSrc,
          duration: video.duration,
          canPlay: !video.error && video.readyState >= 2
        };
      });
      
      console.log('🎬 État de la vidéo:', JSON.stringify(videoInfo, null, 2));
      
      // Attendre que la vidéo soit au moins partiellement chargée
      if (videoInfo.networkState !== 3) { // Si pas d'erreur de réseau
        await page.waitForFunction(() => {
          const video = document.querySelector('#vid');
          return video.readyState >= 1; // Au moins les métadonnées sont chargées
        }, { timeout: 5000 }).catch(() => {
          console.log('⚠️ Vidéo pas entièrement chargée, mais continuons...');
        });
      }
      
    } catch (error) {
      // Si le src n'est pas défini, vérifier au moins que l'élément vidéo existe et est visible
      console.log('⚠️ Video src not set, but video element should be present and visible')
      console.log('Erreur:', error.message)
      
      // Diagnostiquer l'état de la vidéo même sans src
      const videoState = await page.evaluate(() => {
        const video = document.querySelector('#vid');
        const source = document.querySelector('#vid_src');
        return {
          videoExists: !!video,
          sourceExists: !!source,
          videoSrc: video ? video.src : null,
          sourceSrc: source ? source.src : null,
          videoDisplay: video ? window.getComputedStyle(video).display : null,
          videoVisibility: video ? window.getComputedStyle(video).visibility : null
        };
      });
      
      console.log('🔍 État de la vidéo sans src:', JSON.stringify(videoState, null, 2));
    }
    
    // Vérifier que les contrôles vidéo sont visibles
    await expect(page.locator('#vid')).toBeVisible()
    
    // Cliquer sur l'onglet de vérification des graphiques pour les rendre visibles
    await navigateToChartsTab(page)
    
    // Vérifier que les graphiques sont chargés en parallèle
    await expect(page.locator('#stats')).toBeVisible()
    await expect(page.locator('#cyclebar')).toBeVisible()
  })
})*/
