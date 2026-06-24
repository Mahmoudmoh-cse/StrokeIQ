
# ml-cycle-predictor-js


## Overview
`ml-cycle-predictor-js` is a JavaScript module for predicting the next swimming cycle (delta frame/time) using a NEAT neural network. It is designed for direct use in browser-based web applications, and relies on the DOM and global variables from the Aquanote project.

```
assets/
  js/
    ml-cycle-predictor-js/
      js/
        predictor.js           # CyclePredictor class and prediction logic
        utils.js               # Data normalization utilities
      model/
        best_cycle_predictor.json        # Serialized best AI model for predictions
      README.md                # This documentation
```

## Files Description


### Model
- **best_cycle_predictor.json**: Serialized NEAT model (weights, structure, normalization) for each swimming style.

### JavaScript
- **predictor.js**: Exports the main function:
  - `predit_delta_cycle_dos()`: Calcule le delta (prédiction du prochain cycle) selon la nage sélectionnée dans l'interface. Utilise les fonctions utilitaires pour préparer les features, normaliser, passer dans le réseau NEAT, puis dénormaliser la sortie.
  - Le modèle est chargé automatiquement au chargement du module (fetch asynchrone).
- **utils.js**: Fonctions utilitaires pour la préparation et la normalisation des données :
  - `normalizeInput`, `denormalizeOutput`, `prepareInputDataDos`, `prepareInputDataFreestyle`, etc.

### Data
- **sample_input.json**: Exemple d'entrée pour tests (non utilisé directement par le module, mais utile pour comprendre le format attendu).


## Usage
1. Import (ou inclure via `<script>`) le fichier `assets/js/ml-cycle-predictor-js/js/predictor.js` dans votre projet.
2. Assurez-vous que l'environnement global (DOM) est prêt (éléments comme `#run_part1`, `#run_part2`, etc. doivent exister et être renseignés).
3. Appelez la fonction :

```js
import { predit_delta_cycle_dos } from './assets/js/ml-cycle-predictor-js/js/predictor.js';
const delta = predit_delta_cycle_dos();
// delta = nombre de frames prédit pour le prochain cycle
```
> ⚠️ Le module dépend de variables globales et du DOM (Aquanote). Il n'est pas autonome ni utilisable en Node pur.


## Setup Instructions
1. Clone or copiez le dossier `assets/js/ml-cycle-predictor-js` dans votre projet.
2. Importez le JS dans votre page ou module principal.
3. Vérifiez que les dépendances globales (DOM, variables) sont bien présentes.


## Notes
- Tous les chemins sont relatifs à la racine du projet Aquanote.
- Le modèle doit rester dans `assets/js/ml-cycle-predictor-js/model/`.
- Le module n'est pas conçu pour être utilisé sans l'environnement Aquanote (DOM, variables globales, etc.).


## Files Description

### Model
- **best_model.json**: Contains the serialized architecture and weights of the best-performing AI model used for predicting the next cycle.
- **model_stats.json**: Stores performance metrics of the model, including:
  - Percentage of exact predictions
  - Percentage of predictions within 1 frame
  - Additional relevant statistics

### JavaScript
- **predictor.js**: Exports the `CyclePredictor` class, which includes methods for:
  - `loadModel`: Loads the AI model from `best_model.json`.
  - `predictNextCycle`: Makes predictions based on input data.
  - `getModelStats`: Retrieves model performance statistics from `model_stats.json`.

- **utils.js**: Exports utility functions for:
  - `normalizeInput`: Preprocesses input data for the model.
  - `denormalizeOutput`: Converts model output back to the original scale.

### Data
- **sample_input.json**: Contains sample input data in JSON format for testing the model's prediction capabilities.

## Usage
1. Load the model using the `CyclePredictor` class from `predictor.js`.
2. Use the `predictNextCycle` method to make predictions based on input data.
3. Access model performance statistics using the `getModelStats` method.

## Setup Instructions
1. Clone the repository.
2. Ensure you have a JavaScript environment set up (Node.js or browser).
3. Include the `assets/js/ml-cycle-predictor-js/js/predictor.js` and `assets/js/ml-cycle-predictor-js/js/utils.js` files in your project.
4. Load the model and start making predictions using the provided methods.