/**
 * @file homography_handler.js
 * @brief gère les calculs d'homographie afin de passer d'un rectangle représantant une piscine vue du dessus à la vue de la caméra.
 */
import { getSize } from './utils.js';
import { pool_size, getLaneCount } from './loader.js';
import { getPoolLaneSegment } from './pool_geometry.js';

const PerspT= window.PerspT;
let pool_vid_xscale ;
let pool_vid_yscale ;

/**
 * @brief Transforme un point de coordonnées de piscine en coordonnées vidéo via homographie
 * Utilise la calibration pour convertir des coordonnées métriques de la piscine en pixels vidéo
 * 
 * @param {array} pt Point [x, y] en coordonnées de piscine (mètres)
 * @param {object} meta Métadonnées de calibration vidéo contenant srcPts et destPts
 * @return {array} Point transformé [x, y] en coordonnées vidéo (pixels)
 */
export function getPoint(pt, meta) {
    pool_vid_xscale = d3.scaleLinear([0, pool_size[0]], [1920, 0]);
    pool_vid_yscale = d3.scaleLinear([0, pool_size[1]], [1080, 0]);
    let try_scale = d3.scaleLinear([0, 360], [0, 1080])
    let trx_scale = d3.scaleLinear([0, 900], [0, 960])

    let src_tmeta = meta.srcPts.map(d => [d[0], d[1]]) // Does their vids' x are from right to left?
    let dst_tmeta = meta.destPts.map(d => [trx_scale(d[0]), try_scale(d[1])]) // This is in from_above reference

    let srcCorners = src_tmeta.flat()
    let dstCorners = dst_tmeta.flat()

    let perspT = new PerspT(dstCorners, srcCorners);

    let srcPt = [pool_vid_xscale(pt[0]) / 2, pool_vid_yscale(pt[1])] // In from_above space
    let dstPt = perspT.transform(srcPt[0], srcPt[1]);

    return [dstPt[0], dstPt[1]]
}

/**
 * @brief Transforme un point de coordonnées vidéo en coordonnées de piscine (transformation inverse)
 * Convertit des coordonnées pixel de la vidéo en coordonnées métriques de la piscine
 * 
 * @param {array} pt Point [x, y] en coordonnées vidéo normalisées (0-1)
 * @param {object} meta Métadonnées de calibration vidéo
 * @return {array} Point transformé [x, y] en coordonnées de piscine (mètres)
 */
export function getPointInverted(pt, meta) { // I.E. from side view to meters

    let [twidth, theight] = getSize(meta)

    let try_scale = d3.scaleLinear([0, 360], [0, 1080]);
    let trx_scale = d3.scaleLinear([0, 901], [0, 960]);

    let src_tmeta = meta.srcPts.map(d => [d[0], d[1]]); // Does their vids' x are from right to left?
    let dst_tmeta = meta.destPts.map(d => [trx_scale(d[0]), try_scale(d[1])]); // This is in from_above reference

    let srcCorners = src_tmeta.flat();
    let dstCorners = dst_tmeta.flat();

    let perspT = new PerspT(srcCorners, dstCorners);

    let dstPt = perspT.transform(pt[0] * twidth, pt[1] * theight);

    return [dstPt[0], dstPt[1]]
}
/**
 * @brief Cette fonction permet de calculer les points délimitant l'affichage des barres d'annotation sur une seule ligne.
 * Les points retournes sont en pixels source; l'ajustement de l'affichage est applique par la surface video.
 * @param {*} pt indique à quel point on est avancé dans la piscine
 * @param {*} meta comporte les informations de la course et de comment elles ont été filmés, notamment de la calibration
 * @param {*} swimmer le nageur sur la ligne
 * @returns Les points pour faire une barre sur une seule ligne 
 */

export function getBar(pt, meta, swimmer) { // Here we take the assumption that pt is at the middle of a lane
    const laneCount = Math.max(1, getLaneCount());
    const [dstPt1, dstPt2] = getPoolLaneSegment(pt[0], swimmer, laneCount, pool_size, meta, PerspT);
    if (!dstPt1 || !dstPt2) {
        return [[0, 0], [0, 0]];
    }

    return [[dstPt1[0], dstPt1[1]], [dstPt2[0], dstPt2[1]]]
}

/**
 * @brief Calcule la distance euclidienne entre deux points
 * Fonction utilitaire pour mesurer la distance entre deux points dans un espace 2D
 * 
 * @param {array} a Premier point [x, y]
 * @param {array} b Deuxième point [x, y]
 * @return {number} Distance euclidienne entre les deux points
 */
export function eucDistance(a, b) {
    return a
            .map((x, i) => Math.abs(x - b[i]) ** 2)
            .reduce((sum, now) => sum + now)
        ** (1 / 2)
}

/**
 * @brief Calcule l'angle d'orientation entre deux points
 * Détermine l'angle de rotation nécessaire pour orienter une ligne entre deux points
 * 
 * @param {array} p1 Premier point [x, y]
 * @param {array} p2 Deuxième point [x, y]
 * @return {number} Angle en degrés (avec correction de +90°)
 */
export function get_orr(p1, p2) {
    let a = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0])) * (180 / Math.PI);
    a += 90;
    return a;
}


/**
 * @brief Calcule les points de barre en pixels source. L'ajustement d'affichage est appliqué ensuite par la surface vidéo.
 * @function getPoolBar permet de calculer les 2 points délimitant chaque barre tracée dans l'application
 * @param x indique à quel point on est avancé dans la piscine
 * @param meta comporte les informations de la course et de comment elles ont été filmés, notamment de la calibration
 * @param D3Instance utile pour les tests automatisés
 * @return les 2 points délimitant chaque barre tracée dans l'application
 */
export function getPoolBar(x, meta,D3Instance=d3) {
    pool_vid_xscale = d3.scaleLinear([0, pool_size[0]], [1920, 0]);
    pool_vid_yscale = d3.scaleLinear([0, pool_size[1]], [1080, 0]);

    let try_scale = D3Instance.scaleLinear([0, 360], [0, 1080])
    let trx_scale = D3Instance.scaleLinear([0, 900], [0, 960])

    let src_tmeta = meta.srcPts.map(d => [d[0], d[1]]) // Does their vids' x are from right to left?
    let dst_tmeta = meta.destPts.map(d => [trx_scale(d[0]), try_scale(d[1])]) // This is in from_above reference

    
    let srcCorners = src_tmeta.flat()
    let dstCorners = dst_tmeta.flat()

    let perspT = new PerspT(dstCorners, srcCorners);
    
    let srcPt1 = [(pool_vid_xscale(x) / 2), pool_vid_yscale(0)];
    let srcPt2 = [(pool_vid_xscale(x) / 2), pool_vid_yscale(pool_size[1])];
    //console.log(srcPt1,srcPt2," bons source points",x,"le x")
    let dstPt1 = perspT.transform(srcPt1[0], srcPt1[1]);
    let dstPt2 = perspT.transform(srcPt2[0], srcPt2[1]);
    return [dstPt1, dstPt2]
};
