# Tests E2E - Structure Réorganisée

## Vue d'ensemble

Le fichier de test monolithique `annotation.spec.js` a été réorganisé en plusieurs fichiers plus petits et spécialisés pour améliorer la maintenabilité et la lisibilité.

## Structure des fichiers

### 📁 helpers/
Contient les utilitaires et fonctions partagées :

- **`test-helpers.js`** : Fonctions utilitaires pour les tests (loadTestRace, navigation, etc.)
- **`mock-setup.js`** : Configuration centralisée des mocks réseau

### 📁 tests/
Contient les fichiers de tests spécialisés :

- **`basic-interface.spec.js`** : Tests de base de l'interface utilisateur
- **`charts-visualization.spec.js`** : Tests des graphiques et visualisations  
- **`video-integration.spec.js`** : Tests d'intégration vidéo
- **`annotations.spec.js`** : Tests du système d'annotations
- **`synchronization.spec.js`** : Tests de synchronisation entre les vues

### 📄 Fichiers principaux

- **`annotation-suite.spec.js`** : Point d'entrée qui importe tous les tests
- **`annotation.spec.js`** : ⚠️ Fichier original (peut être supprimé après validation)

## Utilisation

### Exécuter tous les tests
```bash
npx playwright test annotation-suite.spec.js
```

### Exécuter des tests spécifiques
```bash
# Tests de base uniquement
npx playwright test tests/basic-interface.spec.js

# Tests de graphiques uniquement  
npx playwright test tests/charts-visualization.spec.js

# Tests vidéo uniquement
npx playwright test tests/video-integration.spec.js

# Tests d'annotations uniquement
npx playwright test tests/annotations.spec.js

# Tests de synchronisation uniquement
npx playwright test tests/synchronization.spec.js
```

### Exécuter par catégorie avec des tags
```bash
# Tous les tests dans le dossier tests/
npx playwright test tests/

# Tests spécifiques avec grep
npx playwright test --grep "graphiques"
npx playwright test --grep "annotations"
```

## Avantages de cette structure

1. **Maintenabilité** : Chaque fichier a une responsabilité claire
2. **Parallélisation** : Les tests peuvent s'exécuter en parallèle plus efficacement
3. **Debug** : Plus facile d'isoler et déboguer des problèmes spécifiques
4. **Réutilisabilité** : Les helpers peuvent être réutilisés facilement
5. **Lisibilité** : Code plus organisé et plus facile à comprendre

## Fonctions utilitaires principales

### test-helpers.js
- `loadTestRace(page)` : Charge une course de test complète
- `waitForSwimmerSelection(page)` : Attend que les nageurs soient disponibles
- `navigateToChartsTab(page)` : Navigue vers l'onglet des graphiques
- `navigateToDataTab(page)` : Navigue vers l'onglet des données
- `getTestData()` : Récupère les données de test
- `mode_color` : Couleurs pour les tests
- `expectedCSSColors` : Couleurs CSS attendues

### mock-setup.js
- `setupMocks(page, testData, testDataPath, testVideoPath)` : Configure tous les mocks
- `setupDiagnosticListeners(page)` : Configure les écouteurs de diagnostic
- `initializeApplication(page)` : Initialise l'application après navigation

## Migration depuis l'ancien fichier

Si vous utilisez l'ancien `annotation.spec.js`, vous pouvez :

1. **Utiliser la nouvelle structure** : Remplacer les imports vers `annotation-suite.spec.js`
2. **Migration progressive** : Utiliser les nouveaux fichiers un par un
3. **Tests hybrides** : Garder les deux structures temporairement

## Personnalisation

Vous pouvez facilement :
- Ajouter de nouveaux fichiers de tests dans `tests/`
- Étendre les helpers avec de nouvelles fonctions utilitaires
- Modifier la configuration des mocks selon vos besoins
- Créer des sous-catégories de tests plus spécifiques

## Dépendances

Tous les fichiers utilisent :
- `../fixtures.js` : Configuration Playwright commune
- Les helpers partagés pour éviter la duplication de code
- La même configuration de mocks pour la cohérence
