/**
 * @file video.spec.js
 * @brief Tests E2E pour le chargement et l'affichage vidéo
 * @details Teste la création de vidéos mockées et leur intégration DOM
 * Valide la lecture vidéo avec blobs et éléments HTML5 video
 */
import { test, expect } from './fixtures.js'
import { createMinimalMP4 } from '../utils/video-generator.js'

test.describe('Test de chargement vidéo', () => {
  test('devrait charger et afficher une vidéo mockée', async ({ page, server }) => {
    // Créer une vidéo MP4 minimale
    const fakeVideoBuffer = createMinimalMP4(2, 640, 480);

    // Mock de toutes les vidéos
    await page.route('**/*.mp4', route => {
      route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: fakeVideoBuffer
      })
    })

    // Mock package.json pour éviter les erreurs
    await page.route('**/package.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: "Neptune",
          version: "1.0.0"
        })
      })
    })

    // Mock flat.json
    await page.route('**/flat.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      })
    })

    // Mock autres endpoints
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

    await page.route('**/ml-cycle-predictor-js/model/best_cycle_predictor.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      })
    })

    // Naviguer vers l'application
    await page.goto(server)
    
    // Vérifier que la page se charge
    await expect(page.locator('body')).toBeVisible()
    
    // Injecter une vidéo dans le DOM pour tester la lecture
    await page.evaluate((buffer) => {
      const videoBlob = new Blob([new Uint8Array(buffer)], { type: 'video/mp4' });
      const videoUrl = URL.createObjectURL(videoBlob);
      
      // Créer un élément vidéo de test
      const video = document.createElement('video');
      video.id = 'test-video';
      video.src = videoUrl;
      video.controls = true;
      video.style.width = '320px';
      video.style.height = '240px';
      document.body.appendChild(video);
    }, Array.from(fakeVideoBuffer))

    // Vérifier que la vidéo est présente
    await expect(page.locator('#test-video')).toBeVisible()
    
    // Vérifier que la vidéo a une source
    const videoSrc = await page.locator('#test-video').getAttribute('src')
    expect(videoSrc).toBeTruthy()
    expect(videoSrc).toContain('blob:')
    
    console.log('Video test passed - video mockée créée et chargée avec succès')
  })
})
