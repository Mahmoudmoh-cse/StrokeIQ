/**
 * @file eslint.config.mjs
 * @brief Configuration ESLint pour l'analyse statique du code JavaScript
 * Définit les règles de linting, les globales (d3, jQuery) et les dossiers à ignorer
 * Configure l'environnement browser et exclut les fichiers générés automatiquement
 */

import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        d3: "readonly",
        $: "readonly",
      },
    },
  },
  {
    ignores: [
      "html/", //dossiers à ignorer ou fichiers à ignorer
      "workflow/test/",
      "assets/js/jquery-ui.js",
      "assets/js/perspective-transform.min.js",
      "assets/js/*.min.js",
      ".conda/",
      "workflow/docs/"
    ],
  },
];
