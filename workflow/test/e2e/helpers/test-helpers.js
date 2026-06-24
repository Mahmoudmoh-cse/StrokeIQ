/**
 * @file test-helpers.js
 * @brief Fonctions utilitaires pour les tests E2E
 * @details Fournit des helpers pour navigation, sélection et manipulation des données
 * Inclut les couleurs attendues et fonctions de chargement de courses
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Pour obtenir __dirname en ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Définition des couleurs pour les tests (copié depuis cycles_handler.js)
export const mode_color = {
  "enter": "rgba(0, 0, 255, 0.5)",
  "end": "rgba(0, 255, 0, 0.5)",
  "cycle_droite": "rgba(35, 33, 86, 0.5)",
  "cycle": "rgba(35, 33, 86, 0.5)",
  "cycle_gauche": "rgba(35, 33, 86, 0.5)",
  "section": "rgba(255, 247, 0, 0.5)",
  "respi": "rgba(189, 56, 56, 0.5)",
  "respi_gauche": "rgba(189, 56, 56, 0.5)",
  "respi_droite": "rgba(189, 56, 56, 0.5)",
  "turn": "rgba(68, 68, 68, 0.5)",
  "finish": "rgba(52, 52, 52, 0.5)"
}

// Couleurs CSS attendues selon le fichier custom.css
export const expectedCSSColors = {
  'cycle': 'rgb(160, 160, 245)',        // #A0A0F5
  'cycle_droite': 'rgb(160, 160, 245)', // #A0A0F5
  'cycle_gauche': 'rgb(160, 160, 245)', // #A0A0F5
  'enter': 'rgb(46, 163, 221)',         // #2ea3dd
  'end': 'rgb(0, 128, 0)',              // green
  'turn': 'rgb(180, 180, 180)',         // #B4B4B4
  'finish': 'rgb(140, 140, 140)',       // #8C8C8C
  'respi': 'rgb(241, 157, 204)',        // #F19DCC
  'respi_droite': 'rgb(241, 157, 204)', // #F19DCC
  'respi_gauche': 'rgb(241, 157, 204)', // #F19DCC
  'section': 'rgb(255, 247, 0)'         // #fff700
}

// Fonction helper pour charger la course de test
export async function loadTestRace(page) {
  // Sélectionner la compétition de test
  await page.locator('#competition').selectOption('2025_CF_Montpellier')
  
  // Attendre que les nouvelles données soient chargées
  await page.waitForTimeout(2000)
  
  // Sélectionner 4nages
  await page.waitForFunction(() => {
    const select = document.querySelector('#run_part1');
    return select && select.options.length > 1;
  }, { timeout: 10000 });
  await page.locator('#run_part1').selectOption('4nages')
  
  // Sélectionner hommes
  await page.waitForFunction(() => {
    const select = document.querySelector('#run_part2');
    return select && select.options.length > 1;
  }, { timeout: 10000 });
  await page.locator('#run_part2').selectOption('hommes')
  
  // Sélectionner 400
  await page.waitForFunction(() => {
    const select = document.querySelector('#run_part3');
    return select && select.options.length > 1;
  }, { timeout: 10000 });
  await page.locator('#run_part3').selectOption('400')
  
  // Sélectionner serie2
  await page.waitForFunction(() => {
    const select = document.querySelector('#run_part4');
    return select && select.options.length > 1;
  }, { timeout: 10000 });
  await page.locator('#run_part4').selectOption('serie2')
  
  // Sélectionner new_data
  await page.waitForFunction(() => {
    const select = document.querySelector('#temp');
    return select && select.options.length > 1;
  }, { timeout: 10000 });
  await page.locator('#temp').selectOption('new_data')
  
  // Charger la course
  await page.click('#loadbtn')
}

// Fonction pour obtenir les données de test
export function getTestData() {
  const testDataPath = join(__dirname, '..', 'test.json');
  const testVideoPath = join(__dirname, '..', 'test.mp4');
  
  // Vérifier que les fichiers existent
  if (!existsSync(testDataPath)) {
    throw new Error(`Fichier test.json non trouvé: ${testDataPath}`);
  }
  if (!existsSync(testVideoPath)) {
    throw new Error(`Fichier test.mp4 non trouvé: ${testVideoPath}`);
  }
  
  const testData = JSON.parse(readFileSync(testDataPath, 'utf8'));
  
  console.log('Fichiers de test chargés:');
  console.log('- JSON:', testDataPath);
  console.log('- Vidéo:', testVideoPath);
  console.log('- Nageurs dans les données:', Object.keys(testData.lignes || {}));
  
  // Valider la structure des données de test
  if (!testData.lignes) {
    console.warn('Attention: pas de propriété "lignes" dans test.json');
  }
  if (!testData.videos || !testData.videos.length) {
    console.warn('Attention: pas de propriété "videos" dans test.json');
  }

  return {
    testData,
    testDataPath,
    testVideoPath
  };
}

// Fonction helper pour attendre qu'un nageur soit sélectionnable
export async function waitForSwimmerSelection(page) {
  await page.waitForFunction(() => {
    const select = document.querySelector('#swim_switch');
    return select && select.options.length > 1;
  }, { timeout: 10000 });
}

// Fonction helper pour naviguer vers l'onglet des graphiques
export async function navigateToChartsTab(page) {
  await page.click('#tab-verification-charts');
  await page.waitForSelector('#stats', { timeout: 20000 });
  await page.waitForSelector('#cyclebar', { timeout: 20000 });
}

// Fonction helper pour naviguer vers l'onglet des données
export async function navigateToDataTab(page) {
  await page.click('#tab-data-plot-tout');
  await page.waitForSelector('#data_plot_tout', { timeout: 10000 });
}
