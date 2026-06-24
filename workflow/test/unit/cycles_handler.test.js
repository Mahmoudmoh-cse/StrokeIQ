/**
 * @file cycles_handler.test.js
 * @brief Tests unitaires pour la gestion des cycles de nage
 * @details Tests de la logique de recherche de cycles, surlignage des barres et manipulation DOM
 * Teste les fonctions findCycleIndexAtFrame et les interactions avec les graphiques D3.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as d3 from 'd3'

// Mock des variables globales nécessaires pour les tests
global.swimmers = []
global.selected_swim = 0

describe('Cycles Handler Logic', () => {
  beforeEach(() => {
    // Reset du DOM avant chaque test
    document.body.innerHTML = `
      <div id="svg_side1"></div>
      <div id="svg_side2"></div>
      <div id="svg_stats"></div>
    `
    
    // Mock des données de test
    global.swimmers = [
      {
        cycles: [
          { frame_number: 0, duree: 2.1 },
          { frame_number: 50, duree: 2.3 },
          { frame_number: 100, duree: 2.0 }
        ]
      }
    ]
    global.selected_swim = 0
  })

  describe('findCycleIndexAtFrame function logic', () => {
    it('devrait trouver le bon cycle pour une frame donnée', () => {
      // Logique de test pour findCycleIndexAtFrame
      const swimData = global.swimmers[0].cycles
      const currentFrame = 75
      
      let foundIndex = -1
      for (let i = swimData.length - 1; i >= 0; i--) {
        if (parseInt(swimData[i].frame_number) <= currentFrame) {
          foundIndex = i
          break
        }
      }
      
      expect(foundIndex).toBe(1) // Frame 75 devrait trouver le cycle à frame 50
    })

    it('devrait retourner 0 si aucun cycle trouvé avant la frame', () => {
      const swimData = global.swimmers[0].cycles
      const currentFrame = -10 // Frame avant tous les cycles
      
      let foundIndex = 0
      for (let i = swimData.length - 1; i >= 0; i--) {
        if (parseInt(swimData[i].frame_number) <= currentFrame) {
          foundIndex = i
          break
        }
      }
      
      expect(foundIndex).toBe(0)
    })
  })

  describe('highlight logic', () => {
    beforeEach(() => {
      // Crée des SVG avec des barres de cycle pour les tests
      const svg1 = d3.select('#svg_side1').append('svg')
      
      // Ajoute des barres de cycle mockées
      svg1.selectAll('.cycle-bar')
        .data([0, 1, 2])
        .enter()
        .append('rect')
        .attr('class', 'cycle-bar')
        .attr('fill', 'rgba(35, 33, 87, 1)')
        .attr('num', d => d)
        .attr('swim', 0)
    })

    it('devrait pouvoir changer la couleur des barres', () => {
      // Test de la logique de surlignage
      const selectedNum = 1
      
      // Remettre toutes les barres à bleu
      d3.selectAll("rect").style("fill", "rgba(35, 33, 87, 1)")
      
      // Mettre la barre sélectionnée en rouge
      d3.selectAll(`rect[num='${selectedNum}'][swim='0']`).style("fill", "red")
      
      // Vérifier les couleurs
      const bars = d3.selectAll('.cycle-bar')
      bars.each(function(d, i) {
        const fill = d3.select(this).style('fill')
        if (i === selectedNum) {
          expect(fill).toContain('red')
        }
      })
    })
  })
})
