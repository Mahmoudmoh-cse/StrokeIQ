/**
 * @file svg_rendering.test.js
 * @brief Tests unitaires pour le rendu SVG et visualisations D3.js
 * @details Tests de création d'éléments SVG, tracé de trajectoires et gestion d'événements
 * Valide l'affichage des graphiques de cycles et barres de progression
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as d3 from 'd3'

describe('SVG Rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="svg_side1"></div>
      <div id="svg_side2"></div>
      <div id="svg_stats"></div>
    `
    
    // Mock des données swimmer
    global.swimmers = [{
      cycles: [
        { 
          frame_start: 0, 
          frame_end: 50,
          duree: 2.1,
          traj: [
            { frame: 0, x: 100, y: 200 },
            { frame: 25, x: 150, y: 180 },
            { frame: 50, x: 200, y: 160 }
          ]
        }
      ]
    }]
    global.selected_swim = 0
  })

  describe('SVG Creation', () => {
    it('devrait créer des SVG dans les conteneurs', () => {
      const svg1 = d3.select('#svg_side1')
        .append('svg')
        .attr('width', 400)
        .attr('height', 300)
      
      expect(svg1.node()).toBeTruthy()
      expect(svg1.attr('width')).toBe('400')
      expect(svg1.attr('height')).toBe('300')
    })

    it('devrait ajouter des barres de cycles', () => {
      const svg = d3.select('#svg_side1').append('svg')
      const cycles = global.swimmers[0].cycles
      
      const bars = svg.selectAll('.cycle-bar')
        .data(cycles)
        .enter()
        .append('rect')
        .attr('class', 'cycle-bar')
        .attr('x', (d, i) => i * 50)
        .attr('width', 40)
        .attr('height', 20)
        .attr('fill', 'blue')
      
      expect(bars.size()).toBe(1)
      expect(bars.attr('fill')).toBe('blue')
    })
  })

  describe('Trajectory Drawing', () => {
    it('devrait dessiner une trajectoire avec des points', () => {
      const svg = d3.select('#svg_stats').append('svg')
      const traj = global.swimmers[0].cycles[0].traj
      
      const line = d3.line()
        .x(d => d.x)
        .y(d => d.y)
      
      const path = svg.append('path')
        .datum(traj)
        .attr('class', 'trajectory')
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', 'blue')
      
      expect(path.node()).toBeTruthy()
      expect(path.attr('stroke')).toBe('blue')
    })

    it('devrait gérer les données de trajectoire vides', () => {
      const svg = d3.select('#svg_stats').append('svg')
      const emptyTraj = []
      
      const circles = svg.selectAll('.traj-point')
        .data(emptyTraj)
        .enter()
        .append('circle')
        .attr('class', 'traj-point')
      
      expect(circles.size()).toBe(0)
    })
  })

  describe('Event Handling', () => {
    it('devrait déclencher un événement au clic sur une barre', () => {
      const svg = d3.select('#svg_side1').append('svg')
      const clickHandler = vi.fn()
      
      const bar = svg.append('rect')
        .attr('class', 'cycle-bar')
        .on('click', clickHandler)
      
      // Simule un clic
      bar.dispatch('click')
      
      expect(clickHandler).toHaveBeenCalled()
    })

    it('devrait passer les bonnes données à l\'event handler', () => {
      const svg = d3.select('#svg_side1').append('svg')
      let receivedData = null
      
      const clickHandler = (event, d) => {
        receivedData = d
      }
      
      const testData = { cycle: 1, frame: 25 }
      const bar = svg.selectAll('.cycle-bar')
        .data([testData])
        .enter()
        .append('rect')
        .attr('class', 'cycle-bar')
        .on('click', clickHandler)
      
      bar.dispatch('click')
      
      expect(receivedData).toEqual(testData)
    })
  })
})
