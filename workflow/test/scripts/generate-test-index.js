#!/usr/bin/env node
/* eslint-env node */
/* global process */

import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..', '..')
const testDir = join(rootDir, 'workflow', 'test')

/**
 * Génère un fichier index-test.html basé sur index.html
 * avec une CSP détendue pour les tests E2E
 */
function generateTestIndexFile() {
  try {
    const indexPath = join(rootDir, 'index.html')
    const testIndexPath = join(testDir, 'index-test.html')
    
    // Lire le fichier index.html original
    const originalContent = readFileSync(indexPath, 'utf-8')
    
    // Remplacer la CSP stricte par une CSP détendue pour les tests
    const testContent = originalContent.replace(
      /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-eval'; connect-src 'self' http://127.0.0.1:* http://localhost:*; media-src 'self' http://127.0.0.1:* http://localhost:*; img-src 'self' data:; script-src 'self' 'unsafe-eval';">`
    ).replace(
      /<title>[^<]*<\/title>/,
      '<title>Annotation Natation - Test Environment</title>'
    ).replace(
      /<\/head>/,
      `    <style>
        /* Indicateur d'environnement de test */
        body::before {
            content: "🧪 TEST ENVIRONMENT";
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ff6b35;
            color: white;
            text-align: center;
            font-weight: bold;
            z-index: 9999;
            padding: 4px;
            font-size: 11px;
        }
        
        body {
            margin-top: 24px !important;
        }
    </style>
</head>`
    )
    
    // Écrire le fichier de test
    writeFileSync(testIndexPath, testContent, 'utf-8')
    
    console.log('✅ Fichier index-test.html généré avec succès')
    console.log('   CSP détendue appliquée pour les tests E2E')
    console.log('   Indicateur visuel ajouté pour différencier l\'environnement de test')
    
  } catch (error) {
    console.error('❌ Erreur lors de la génération du fichier de test:', error.message)
    process.exit(1)
  }
}

generateTestIndexFile()
