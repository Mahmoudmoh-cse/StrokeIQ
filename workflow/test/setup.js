/**
 * @file setup.js
 * @brief Configuration d'environnement de test pour Vitest avec JSDOM
 * @details Configure DOM, jQuery, D3.js, fetch et mocks pour les tests unitaires
 * Charge le HTML réel et initialise l'environnement de test complet
 */
import { vi } from 'vitest';
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import { readFileSync } from 'fs';
import * as d3 from 'd3';
;
import fetch from 'node-fetch';
import path from 'path';

global.d3 = d3
global.fetch = fetch;

// Mock des APIs Web pour Vitest
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

// Lis le contenu réel du fichier HTML
const html = readFileSync('./index.html', 'utf8');
global.__TEST__ = true; 
// Crée le DOM à partir du HTML réel
const { window } = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
global.window = window;
global.document = window.document;
// Patch pour garantir que navigator existe toujours (utile pour jsdom/Vitest)
if (typeof window.navigator === 'undefined') {
  window.navigator = { userAgent: 'nodejs' };
}
global.navigator = window.navigator;
// Patch pour garantir que document.createElement existe toujours (utile pour jsdom/Vitest)
if (typeof document.createElement !== 'function') {
  document.createElement = (...args) => window.document.createElement.apply(window.document, args);
}

global.$ = jquery(window);
global.jQuery = global.$;

// Mock des plugins jQuery UI pour les tests
if (global.$ && global.$.fn) {
  global.$.fn.selectmenu = function() { return this; };
  global.$.fn.dialog = function() { return this; };
}

global.fetch = async function(url, options) {
  // Si c'est un chemin relatif/local, charge le fichier local
  if (typeof url === 'string' && !url.match(/^https?:\/\//)) {
    // Résout le chemin relatif par rapport au dossier du projet
    const filePath = path.resolve(process.cwd(), url.replace(/^\.\\|^\.\//, ''));
    try {
      const data = readFileSync(filePath, 'utf8');
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(data),
        text: async () => data,
      };
    } catch (e) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => { throw e; },
        text: async () => { throw e; },
      };
    }
  }
  // Sinon, utilise node-fetch normal
  return fetch(url, options);
};

// Charge le script PerspT dans le contexte jsdom
const perspTCode = readFileSync('./assets/js/perspective-transform.min.js', 'utf8');
window.eval(perspTCode); // Ajoute PerspT à window

window.fetch = fetch;
window.__TEST__ = true;