import { existsSync } from 'fs'
import { createMinimalMP4 } from '../../utils/video-generator.js'

/**
 * @file mock-setup.js
 * @brief Configuration des mocks pour les tests E2E
 * @details Fournit les mocks complets pour API, données et vidéos
 * Configure les endpoints et réponses pour les tests Playwright
 */
// Configuration complète des mocks pour les tests
export async function setupMocks(page, testData, testDataPath, testVideoPath, options = {}) {
  const {
    competition = "2025_CF_Montpellier",
    course = "2025_CF_Montpellier_4nages_hommes_400_serie2",
    competition2 = "2025_TEST_CameraUnique",
    course2 = "2025_TEST_CameraUnique_4nages_hommes_400_serie2",
    useRealVideo = true,
    mockVideoData = { duration: 5, width: 640, height: 480 }
  } = options;


  // 1. Mock package.json pour éviter les erreurs
  await page.route('**/package.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',        body: JSON.stringify({
          name: "Neptune",
          version: "1.0.0",
          server: {
            url: "http://localhost:8080"
          }
        })
    })
  })

  // 2. Mock des vidéos - utiliser la vraie vidéo de test ou générer une vidéo fake
  await page.route('**/*.mp4', async route => {
    const url = route.request().url();
    
    if (useRealVideo && testVideoPath && existsSync(testVideoPath)) {
      try {
        await route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          path: testVideoPath
        });
        return;
      } catch (error) {
        console.log('❌ Erreur lors du chargement de la vraie vidéo:', error);
      }
    }
    
    // Fallback: créer une vidéo MP4 minimale
    try {
      const fakeVideoBuffer = createMinimalMP4(
        mockVideoData.duration, 
        mockVideoData.width, 
        mockVideoData.height
      );
      await route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: fakeVideoBuffer
      });
    } catch (error) {
      console.log('❌ Erreur lors de la génération de vidéo:', error);
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Error generating video: ' + error.message
      });
    }
  })

  // 3. Mock du fichier flat.json avec les données de test
  await page.route('**/flat.json', route => {
    const flatData = {};
    flatData[competition] = {};
    flatData[competition][course] = {
      espadon: false,
      espadonModifie: false,
      data_checked: false
    };
    flatData[competition2] = {};
    flatData[competition2][course2] = {
      espadon: false,
      espadonModifie: false,
      data_checked: false
    };
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(flatData)
    })
  })

  // 4. Mock de getCompets pour la liste des compétitions
  await page.route('**/getCompets', route => {
    
    // Toujours retourner au moins 2 compétitions pour satisfaire l'attente "options.length > 1"
    // incluant une option par défaut et la compétition de test
    const competitions = [
      { type: "directory", name: "2024_Default_Competition" },
      { type: "directory", name: competition },
      { type: "directory", name: competition2 } // Compétition de test supplémentaire
    ];
    
    // Ajouter des compétitions supplémentaires si spécifiées
    if (options.extraCompetitions) {
      options.extraCompetitions.forEach(comp => {
        if (!competitions.find(c => c.name === comp)) {
          competitions.push({ type: "directory", name: comp });
        }
      });
    }
    
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(competitions)
    });
  });

  // 5. Mock pour les courses locales
  await page.route('**/courses_natation_local/', route => {
    
    // Retourner les mêmes compétitions que getCompets
    const competitions = [
      { type: "directory", name: "2024_Default_Competition" },
      { type: "directory", name: competition },
      { type: "directory", name: "2025_TEST_CameraUnique" }
    ];
    
    if (options.extraCompetitions) {
      options.extraCompetitions.forEach(comp => {
        if (!competitions.find(c => c.name === comp)) {
          competitions.push({ type: "directory", name: comp });
        }
      });
    }

    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(competitions)
    });
  });

  // 6. Mock pour les requêtes directes de compétitions pour getRuns
  await page.route('**/courses_natation_local/', route => {
    
    // Retourner les mêmes compétitions que les autres endpoints
    const competitions = [
      { type: "directory", name: "2024_Default_Competition" },
      { type: "directory", name: competition },
      { type: "directory", name: "2025_TEST_CameraUnique" }
    ];
    
    if (options.extraCompetitions) {
      options.extraCompetitions.forEach(comp => {
        if (!competitions.find(c => c.name === comp)) {
          competitions.push({ type: "directory", name: comp });
        }
      });
    }
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(competitions)
    });
  });

  // 7. Mock des métadonnées de course spécifiques
  await page.route(`**/${course}.json`, route => {
    try {
      // PRIORITÉ 1: Utiliser les données de test réelles si disponibles
      if (testData) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(testData)
        });
        return;
      }
      
      // PRIORITÉ 2: Fallback avec des données par défaut cohérentes
      const courseData = {
        videos: [
          {
            name: `${course}_fixeDroite.mp4`,
            fps: 50,
            start_side: "right",
            width: mockVideoData.width,
            height: mockVideoData.height,
            srcPts: [[200, 200], [2500, 200], [2500, 1300], [200, 1300]],
            start_moment: 2.0,
            start_flash: 2.0,    // Cohérent avec start_moment
            end_flash: 5.0       // Valeur par défaut
          }
        ],
        lignes: {
          1: "Nageur Test 1",
          2: "Nageur Test 2",
          3: "Nageur Test 3"
        },
        ncamera: 2,
        sexe: "hommes",
        nage: "4nages",
        distance: "400"
      };
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(courseData)
      });
    } catch (error) {
      console.error('Erreur lors du mock des métadonnées:', error);
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Erreur de chargement des métadonnées' })
      });
    }
  });

  // 8. Mock des courses pour la compétition
  await page.route(`**/getRuns/${competition}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "directory", name: course }
      ])
    })
  })

  await page.route(`**/getRuns/${competition2}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "directory", name: course2 }
      ])
    })
  })

  await page.route(`**/${competition}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "directory", name: course }
      ])
    })
  })

  // 9. Mock des données d'annotations pour la course
  await page.route(`**/getDatas/${competition}/${course}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "file", name: "test_data.csv" }
      ])
    })
  })

  await page.route(`**/getDatas/${competition2}/${course2}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "file", name: "test_data.csv" }
      ])
    })
  })

  await page.route(`**/getQuality/${competition}/${course}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "file", name: `${course}.mp4` }
      ])
    })
  })

  await page.route(`**/${course}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "file", name: "test_data.csv" }
      ])
    })
  })

  // 10. Mock pour les annotations de course locales
  await page.route(`**/courses_natation_local/${competition}/${course}/`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: "file", name: "test_data.csv" },
        { type: "file", name: "new_data" }
      ])
    })
  })

  // 11. Mock pour toute requête vers les courses locales (wildcard)
  await page.route('**/courses_natation_local/**', route => {
    const url = route.request().url();
    
    // Si c'est flat.json, retourner les données mockées
    if (url.includes('flat.json')) {
      const flatData = {};
      flatData[competition] = {};
      flatData[competition][course] = {
        espadon: false,
        espadonModifie: false,
        data_checked: false
      };
      flatData[competition2] = {};
      flatData[competition2][course2] = {
        espadon: false,
        espadonModifie: false,
        data_checked: false
      };
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(flatData)
      });
      return;
    }
    
    // Si c'est getCompets, on le laisse passer à la route spécifique
    if (url.includes('getCompets')) {
      route.continue();
      return;
    }
    
    // Si c'est une vidéo, utiliser le mock vidéo
    if (url.includes('.mp4')) {
      if (useRealVideo && testVideoPath && existsSync(testVideoPath)) {
        route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          path: testVideoPath
        });
      } else {
        const fakeVideoBuffer = createMinimalMP4(
          mockVideoData.duration, 
          mockVideoData.width, 
          mockVideoData.height
        );
        route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          body: fakeVideoBuffer
        });
      }
      return;
    }
    
    // Si c'est un fichier JSON de métadonnées, retourner les données de test
    if (url.includes('.json') && url.includes(course)) {
      if (testData) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(testData)
        });
      } else {
        const courseData = {
          videos: [
            {
              name: `${course}_fixeDroite.mp4`,
              fps: 50,
              start_side: "right",
              width: mockVideoData.width,
              height: mockVideoData.height,
              srcPts: [[200, 200], [2500, 200], [2500, 1300], [200, 1300]],
              start_moment: 2.0,
              start_flash: 2.0,    // Cohérent avec start_moment
              end_flash: 5.0       // Valeur par défaut
            }
          ],
          lignes: {
            1: "Nageur Test 1",
            2: "Nageur Test 2",
            3: "Nageur Test 3"
          },
          ncamera: 2,
          sexe: "hommes",
          nage: "4nages",
          distance: "400"
        };
        
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(courseData)
        });
      }
      return;
    }
    
    // Si c'est un dossier de course, retourner les fichiers
    if (url.includes(course)) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { type: "file", name: "test_data.csv" }
        ])
      });
      return;
    }
    
    // Si c'est une compétition, retourner les courses
    if (url.includes(competition) && !url.includes(course)) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { type: "directory", name: course }
        ])
      });
      return;
    }
    
    // Si c'est le répertoire racine, retourner les compétitions
    if (url.includes('pipeline-tracking/') && !url.includes(competition) && !url.includes('.json')) {
      const competitions = [
        { type: "directory", name: "2024_Default_Competition" },
        { type: "directory", name: competition },
        { type: "directory", name: competition2 }
      ];
      
      if (options.extraCompetitions) {
        options.extraCompetitions.forEach(comp => {
          if (!competitions.find(c => c.name === comp)) {
            competitions.push({ type: "directory", name: comp });
          }
        });
      }
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(competitions)
      });
      return;
    }
    
    // Fallback pour toute autre requête
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found in mock' })
    });
  })

  // 12. Mock des assets nageurs pour l'interface
  await page.route('**/assets/nageurs_formatted.json', route => {
    let testSwimmers = [];
    
    if (testData && testData.lignes) {
      // Utiliser les nageurs des données de test
      testSwimmers = Object.entries(testData.lignes).map(([ligne, nom], index) => ({
        id: index,
        name: typeof nom === 'string' ? nom : nom.nom || `Nageur ${ligne}`,
        cycles: [
          { frame_start: index * 50, frame_end: (index * 50) + 40, duree: 2.0 + (index * 0.1) }
        ]
      }));
    } else {
      // Nageurs par défaut
      testSwimmers = [
        {
          id: 0,
          name: 'Nageur Test 1',
          cycles: [
            { frame_start: 0, frame_end: 50, duree: 2.1 },
            { frame_start: 50, frame_end: 100, duree: 2.2 }
          ]
        },
        {
          id: 1,
          name: 'Nageur Test 2',
          cycles: [
            { frame_start: 25, frame_end: 75, duree: 2.0 },
            { frame_start: 75, frame_end: 125, duree: 2.1 }
          ]
        }
      ];
    }
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(testSwimmers)
    })
  })

  // 13. Mock du modèle ML pour la prédiction de cycles
  await page.route('**/ml-cycle-predictor-js/model/best_cycle_predictor.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        modelTopology: {},
        weightSpecs: [],
        weightData: new ArrayBuffer(0),
        format: "layers-model"
      })
    })
  })

  // 14. Mock des requêtes CSV de données avec plus de données pour générer des graphiques
  await page.route('**/*.csv', route => {
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: `frameId,event,side,lane
1,cycle,1,1
25,cycle,1,1
50,cycle,1,1
75,cycle,1,1
100,cycle,1,1
125,cycle,1,1
150,cycle,1,1
175,cycle,1,1
200,cycle,1,1
225,cycle,1,1
250,cycle,1,1
275,cycle,1,1
300,cycle,1,1
325,cycle,1,1
350,cycle,1,1
375,cycle,1,1
400,cycle,1,1
1,cycle,2,2
30,cycle,2,2
60,cycle,2,2
90,cycle,2,2
120,cycle,2,2
150,cycle,2,2
180,cycle,2,2
210,cycle,2,2
240,cycle,2,2
270,cycle,2,2
300,cycle,2,2
330,cycle,2,2
360,cycle,2,2
390,cycle,2,2`
    })
  })

}

// Configuration des écouteurs de diagnostic
export function setupDiagnosticListeners(page) {
  // Écouter les erreurs de console pour diagnostiquer
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser console error:', msg.text());
    } else if (msg.type() === 'log') {
      console.log('Browser console log:', msg.text());
    }
  });

  // Écouter les requêtes réseau pour diagnostiquer
  page.on('request', request => {
  });


  // Écouter les erreurs de page
  page.on('pageerror', error => {
    console.error('Page error:', error.message);
  });

  // Écouter les échecs de requêtes
  page.on('requestfailed', request => {
    console.error('Request failed:', request.url(), request.failure()?.errorText);
  });
}

// Fonction pour initialiser l'application après navigation
export async function initializeApplication(page, options = {}) {
  const { 
    waitForCompetitions = true, 
    minCompetitions = 2,
    timeout = 30000,
    fallbackMode = true
  } = options;

  
  // Attendre que l'application soit chargée avec plus de temps et vérifier plusieurs éléments
  try {
    await page.waitForSelector('body', { timeout: 5000 })
    await page.waitForSelector('#competition', { timeout: 10000 })
    
    if (waitForCompetitions) {
      // Attendre que les options de compétition soient chargées
      try {
        await page.waitForFunction((minCount) => {
          const select = document.querySelector('#competition');
          if (!select) return false;
          
          const optionCount = select.options.length;
          
          return optionCount >= minCount;
        }, minCompetitions, { timeout });
        
        
      } catch (timeoutError) {
          throw timeoutError;
      }
    }
    
    
  } catch (error) {
    console.log('❌ Erreur lors du chargement initial:', error.message)
    
    // Debug supplémentaire
    try {
      const competitionSelect = await page.locator('#competition').count()
      
      if (competitionSelect > 0) {
        const optionsCount = await page.locator('#competition option').count()
        
        if (optionsCount > 0) {
          const options = await page.locator('#competition option').allTextContents()
        }
      }
      
      // Prendre une capture d'écran pour diagnostiquer
      await page.screenshot({ path: 'debug-loading-error.png' })
    } catch (debugError) {
      console.log('Erreur lors du debug:', debugError.message)
    }
    
    throw error
  }
}

// Version simplifiée pour les tests de base
export async function initializeBasicApplication(page) {
  return initializeApplication(page, {
    waitForCompetitions: true,
    minCompetitions: 1, // Plus tolérant
    timeout: 15000,     // Timeout plus court
    fallbackMode: true  // Mode de secours activé
  });
}

// Configurations prédéfinies pour différents types de tests
export const mockConfigurations = {
  // Configuration pour les tests de base (interface uniquement)
  basic: {
    competition: "Test_Competition",
    course: "Test_Competition_test_course",
    useRealVideo: false,
    mockVideoData: { duration: 2, width: 320, height: 240 }
  },
  
  // Configuration pour les tests avec vraies données
  fullData: {
    competition: "2025_CF_Montpellier",
    course: "2025_CF_Montpellier_4nages_hommes_400_serie2",
    useRealVideo: true,
    mockVideoData: { duration: 5, width: 640, height: 480 }
  },
  
  // Configuration pour les tests de vidéo uniquement
  videoOnly: {
    competition: "Video_Test",
    course: "Video_Test_simple",
    useRealVideo: false,
    mockVideoData: { duration: 10, width: 1920, height: 1080 }
  }
};

// Setup simplifié pour les tests de base (évite les problèmes d'attente)
export async function setupBasicMocks(page) {
  
  // Mock package.json
  await page.route('**/package.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: "Neptune",
        version: "1.0.0"
      })
    })
  });

  // Mock flat.json vide pour éviter les erreurs
  await page.route('**/flat.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    })
  });


  // Mock autres assets de base
  await page.route('**/assets/nageurs_formatted.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    })
  });

  await page.route('**/ml-cycle-predictor-js/model/best_cycle_predictor.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    })
  });

  // Mock vidéos basiques
  await page.route('**/*.mp4', route => {
    const fakeVideoBuffer = createMinimalMP4(2, 320, 240);
    route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: fakeVideoBuffer
    })
  });
}

// Setup pour les tests d'annotations avec plus de compétitions
export async function setupAnnotationMocks(page, testData, testDataPath, testVideoPath) {
  return setupMocks(page, testData, testDataPath, testVideoPath, {
    ...mockConfigurations.fullData,
    // Ajouter plus de compétitions pour éviter le problème d'attente
    extraCompetitions: [
      "Default_Competition", 
      "2025_CF_Montpellier", 
      "2022_CM_Budapest",
      "Test_Backup"
    ]
  });
}

// Setup spécialisé pour les tests vidéo
export async function setupVideoMocks(page, options = {}) {
  const config = { ...mockConfigurations.videoOnly, ...options };
  return setupMocks(page, null, null, null, config);
}
