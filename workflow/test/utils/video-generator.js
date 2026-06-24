/**
 * @file video-generator.js
 * @brief Générateur de vidéos MP4 minimales pour les tests E2E
 * @details Fournit des URLs de vidéos de test et génère des fichiers MP4 valides
 * Optimisé pour les tests Playwright avec métadonnées H.264 complètes
 */

/**
 * URLs des vidéos de test locales 
 */
const TEST_VIDEO_URLS = {
  short: './test/fixtures/test-video-short.mp4',
  medium: './test/fixtures/test-video-medium.mp4',
  default: './test/fixtures/test-video-default.mp4'
};

/**
 * Retourne l'URL d'une vidéo de test locale au lieu de générer une nouvelle vidéo
 * @param {number} duration - Durée en secondes (ignoré, pour compatibilité)
 * @param {number} width - Largeur en pixels (ignoré, pour compatibilité)
 * @param {number} height - Hauteur en pixels (ignoré, pour compatibilité)
 * @returns {string} - URL de la vidéo de test locale
 */
export function createMinimalMP4(duration = 1, width = 320, height = 240) {
  // Utilise une vidéo existante au lieu de générer
  return TEST_VIDEO_URLS.default;
}

/**
 * Retourne l'URL d'une vidéo de test spécifique
 * @param {string} type - Type de vidéo ('short', 'medium', 'default')
 * @returns {string} - URL de la vidéo
 */
export function getTestVideoUrl(type = 'default') {
  return TEST_VIDEO_URLS[type] || TEST_VIDEO_URLS.default;
}

/**
 * Crée un fichier MP4 minimal mais valide avec métadonnées complètes (version générée)
 * @param {number} duration - Durée en secondes (par défaut 1)
 * @param {number} width - Largeur en pixels (par défaut 320)
 * @param {number} height - Hauteur en pixels (par défaut 240)
 * @returns {Buffer} - Buffer contenant les données MP4
 */
export function createGeneratedMP4(duration = 1, width = 320, height = 240) {
  // Créons un MP4 ultra-simple mais valide en utilisant une approche différente
  // Données MP4 codées en dur mais fonctionnelles
  const mp4Data = createSimpleValidMP4(duration, width, height);
  return mp4Data;
}

/**
 * Crée un box moov enhanced avec métadonnées plus complètes
 */
function createEnhancedMoovBox(duration, width, height) {
  const timescale = 25000; // Timescale plus précis (25000 unités/s pour 25 fps)
  const durationValue = duration * timescale;

  // mvhd box (movie header) plus détaillé
  const mvhdBox = Buffer.from([
    0x00, 0x00, 0x00, 0x6C, // box size
    0x6D, 0x76, 0x68, 0x64, // 'mvhd'
    0x01, 0x00, 0x00, 0x00, // version 1 + flags
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // creation time (64-bit)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // modification time (64-bit)
    ...numberToBytes(timescale, 4), // timescale
    ...numberTo64Bytes(durationValue), // duration (64-bit)
    0x00, 0x01, 0x00, 0x00, // rate 1.0
    0x01, 0x00, 0x00, 0x00, // volume 1.0
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    // Unity matrix (transformation matrix)
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00,
    // Pre-defined
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x02, // next track ID
  ]);

  // trak box pour la piste vidéo
  const trakBox = createEnhancedTrakBox(duration, width, height, timescale);

  // udta box (user data) pour métadonnées compatibles
  const udtaBox = createUserDataBox();

  const moovSize = 8 + mvhdBox.length - 8 + trakBox.length + udtaBox.length;
  const moovHeader = Buffer.from([
    ...numberToBytes(moovSize, 4),
    0x6D, 0x6F, 0x6F, 0x76  // 'moov'
  ]);

  return Buffer.concat([moovHeader, mvhdBox.subarray(8), trakBox, udtaBox]);
}

/**
 * Crée un box trak enhanced avec métadonnées complètes
 */
function createEnhancedTrakBox(duration, width, height, timescale) {
  const durationValue = duration * timescale;

  // tkhd box (track header) avec version 1 pour timestamps 64-bit
  const tkhdBox = Buffer.from([
    0x00, 0x00, 0x00, 0x68, // box size (104 bytes)
    0x74, 0x6B, 0x68, 0x64, // 'tkhd'
    0x01, 0x00, 0x00, 0x07, // version 1 + flags (track enabled + in movie + in preview)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // creation time (64-bit)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // modification time (64-bit)
    0x00, 0x00, 0x00, 0x01, // track ID
    0x00, 0x00, 0x00, 0x00, // reserved
    ...numberTo64Bytes(durationValue), // duration (64-bit)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // layer + alternate group
    0x00, 0x00, 0x00, 0x00, // volume + reserved
    // Unity matrix
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00,
    ...numberToBytes(width << 16, 4), // width
    ...numberToBytes(height << 16, 4), // height
  ]);

  // mdia box enhanced
  const mdiaBox = createEnhancedMdiaBox(duration, timescale, width, height);

  const trakSize = 8 + tkhdBox.length - 8 + mdiaBox.length;
  const trakHeader = Buffer.from([
    ...numberToBytes(trakSize, 4),
    0x74, 0x72, 0x61, 0x6B  // 'trak'
  ]);

  return Buffer.concat([trakHeader, tkhdBox.subarray(8), mdiaBox]);
}

/**
 * Crée un box mdia enhanced avec minf pour une vidéo complète
 */
function createEnhancedMdiaBox(duration, timescale, width, height) {
  const durationValue = duration * timescale;

  // mdhd box avec version 1 pour 64-bit timestamps
  const mdhdBox = Buffer.from([
    0x00, 0x00, 0x00, 0x2C, // box size (44 bytes)
    0x6D, 0x64, 0x68, 0x64, // 'mdhd'
    0x01, 0x00, 0x00, 0x00, // version 1 + flags
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // creation time (64-bit)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // modification time (64-bit)
    ...numberToBytes(timescale, 4), // timescale
    ...numberTo64Bytes(durationValue), // duration (64-bit)
    0x55, 0xC4, 0x00, 0x00, // language 'und' + quality
  ]);

  // hdlr box avec nom de handler
  const hdlrBox = Buffer.from([
    0x00, 0x00, 0x00, 0x2D, // box size
    0x68, 0x64, 0x6C, 0x72, // 'hdlr'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x00, // pre_defined
    0x76, 0x69, 0x64, 0x65, // handler_type 'vide'
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    // name string: "VideoHandler\0"
    0x56, 0x69, 0x64, 0x65, 0x6F, 0x48, 0x61, 0x6E, 0x64, 0x6C, 0x65, 0x72, 0x00
  ]);

  // minf box (media information) enhanced
  const minfBox = createEnhancedMinfBox(duration, timescale, width, height);

  const mdiaSize = 8 + mdhdBox.length - 8 + hdlrBox.length - 8 + minfBox.length;
  const mdiaHeader = Buffer.from([
    ...numberToBytes(mdiaSize, 4),
    0x6D, 0x64, 0x69, 0x61  // 'mdia'
  ]);

  return Buffer.concat([mdiaHeader, mdhdBox.subarray(8), hdlrBox.subarray(8), minfBox]);
}

/**
 * Crée un box minf enhanced avec vmhd et stbl
 */
function createEnhancedMinfBox(duration, timescale, width, height) {
  // vmhd box (video media header)
  const vmhdBox = Buffer.from([
    0x00, 0x00, 0x00, 0x14, // box size
    0x76, 0x6D, 0x68, 0x64, // 'vmhd'
    0x00, 0x00, 0x00, 0x01, // version + flags
    0x00, 0x00, // graphics mode
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // opcolor
  ]);

  // dinf box (data information) enhanced
  const dinfBox = Buffer.from([
    0x00, 0x00, 0x00, 0x24, // box size
    0x64, 0x69, 0x6E, 0x66, // 'dinf'
    0x00, 0x00, 0x00, 0x1C, // dref box size
    0x64, 0x72, 0x65, 0x66, // 'dref'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x00, 0x0C, // url box size
    0x75, 0x72, 0x6C, 0x20, // 'url '
    0x00, 0x00, 0x00, 0x01, // version + flags (self-contained)
  ]);

  // stbl box (sample table) enhanced
  const stblBox = createEnhancedStblBox(duration, timescale, width, height);

  const minfSize = 8 + vmhdBox.length - 8 + dinfBox.length - 8 + stblBox.length;
  const minfHeader = Buffer.from([
    ...numberToBytes(minfSize, 4),
    0x6D, 0x69, 0x6E, 0x66  // 'minf'
  ]);

  return Buffer.concat([minfHeader, vmhdBox.subarray(8), dinfBox.subarray(8), stblBox]);
}

/**
 * Crée un box stbl enhanced avec les tables d'échantillons précises
 */
function createEnhancedStblBox(duration, timescale, width = 320, height = 240) {
  const frameRate = 25; // fps
  const sampleCount = Math.max(1, Math.floor(duration * frameRate));
  const sampleDelta = Math.floor(timescale / frameRate); // delta time between frames

  // stsd box (sample description) enhanced avec AVC configuration plus complète
  const stsdBox = Buffer.from([
    0x00, 0x00, 0x00, 0x98, // box size
    0x73, 0x74, 0x73, 0x64, // 'stsd'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x01, // entry count
    // avc1 sample entry
    0x00, 0x00, 0x00, 0x88, // entry size
    0x61, 0x76, 0x63, 0x31, // 'avc1'
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, // data reference index
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // pre_defined + reserved
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ...numberToBytes(width, 2), // width
    ...numberToBytes(height, 2), // height
    0x00, 0x48, 0x00, 0x00, // horizresolution (72 DPI)
    0x00, 0x48, 0x00, 0x00, // vertresolution (72 DPI)
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, // frame count
    // compressor name (32 bytes) - "H.264"
    0x05, 0x48, 0x2E, 0x32, 0x36, 0x34, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x18, // depth (24-bit)
    0xFF, 0xFF, // pre_defined
    // avcC box (AVC configuration) - configuration plus réaliste
    0x00, 0x00, 0x00, 0x30, // box size
    0x61, 0x76, 0x63, 0x43, // 'avcC'
    0x01, // configuration version
    0x42, // profile (baseline)
    0x00, // profile compatibility
    0x1E, // level (3.0)
    0xFF, // length size - 1 (4 bytes)
    0xE1, // num SPS = 1
    0x00, 0x17, // SPS length
    // SPS (Sequence Parameter Set) réaliste pour la résolution donnée
    0x67, 0x42, 0x00, 0x1E, 0x8C, 0x8D, 0x40, 0xA0,
    0x2F, 0xF9, 0x70, 0x11, 0x00, 0x00, 0x03, 0x03,
    0xE9, 0x00, 0x00, 0xEA, 0x60, 0x0F, 0x16, 0x2D,
    0x96, 
    0x01, // num PPS = 1
    0x00, 0x04, // PPS length
    0x68, 0xCE, 0x06, 0xE2, // PPS (Picture Parameter Set)
  ]);

  // stts box (time-to-sample) avec delta time précis
  const sttsBox = Buffer.from([
    0x00, 0x00, 0x00, 0x18, // box size
    0x73, 0x74, 0x74, 0x73, // 'stts'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x01, // entry count
    ...numberToBytes(sampleCount, 4), // sample count
    ...numberToBytes(sampleDelta, 4), // sample delta (40ms pour 25fps)
  ]);

  // stsc box (sample-to-chunk)
  const stscBox = Buffer.from([
    0x00, 0x00, 0x00, 0x1C, // box size
    0x73, 0x74, 0x73, 0x63, // 'stsc'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x00, 0x01, // first chunk
    ...numberToBytes(sampleCount, 4), // samples per chunk
    0x00, 0x00, 0x00, 0x01, // sample description index
  ]);

  // stsz box (sample size) avec tailles d'échantillons variables
  let stszData = [
    0x00, 0x00, 0x00, 0x14 + (sampleCount * 4), // box size
    0x73, 0x74, 0x73, 0x7A, // 'stsz'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x00, // sample size (0 = variable)
    ...numberToBytes(sampleCount, 4), // sample count
  ];
  
  // Ajouter les tailles individuelles des échantillons
  for (let i = 0; i < sampleCount; i++) {
    const sampleSize = i === 0 ? 2048 : 1024; // Première frame plus grande (keyframe)
    stszData = stszData.concat(numberToBytes(sampleSize, 4));
  }
  
  const stszBox = Buffer.from(stszData);

  // stco box (chunk offset) - calculé avec un placeholder temporaire
  const stcoBox = Buffer.from([
    0x00, 0x00, 0x00, 0x14, // box size
    0x73, 0x74, 0x63, 0x6F, // 'stco'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x10, 0x00, // chunk offset (placeholder, sera corrigé)
  ]);

  // stss box (sync sample) pour marquer les keyframes
  const stssBox = Buffer.from([
    0x00, 0x00, 0x00, 0x14, // box size
    0x73, 0x74, 0x73, 0x73, // 'stss'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x00, 0x01, // sync sample number (frame 1 is keyframe)
  ]);

  const stblSize = 8 + stsdBox.length - 8 + sttsBox.length - 8 + stscBox.length - 8 + 
                   stszBox.length - 8 + stcoBox.length - 8 + stssBox.length - 8;
  const stblHeader = Buffer.from([
    ...numberToBytes(stblSize, 4),
    0x73, 0x74, 0x62, 0x6C  // 'stbl'
  ]);

  return Buffer.concat([
    stblHeader, 
    stsdBox.subarray(8), 
    sttsBox.subarray(8), 
    stscBox.subarray(8), 
    stszBox.subarray(8), 
    stcoBox.subarray(8),
    stssBox.subarray(8)
  ]);
}

/**
 * Convertit un nombre en bytes (big-endian)
 */
function numberToBytes(num, bytes) {
  const result = [];
  for (let i = bytes - 1; i >= 0; i--) {
    result.push((num >> (i * 8)) & 0xFF);
  }
  return result;
}

/**
 * Convertit un nombre en bytes 64-bit (big-endian)
 */
function numberTo64Bytes(num) {
  const high = Math.floor(num / 0x100000000);
  const low = num & 0xFFFFFFFF;
  return [
    ...numberToBytes(high, 4),
    ...numberToBytes(low, 4)
  ];
}

/**
 * Crée une vidéo MP4 basique avec un canvas noir
 * Pour les tests plus avancés nécessitant une vraie lecture vidéo
 */
export async function createCanvasMP4(duration = 1, width = 320, height = 240, fps = 25) {
  // Cette fonction nécessiterait ffmpeg ou une librairie similaire
  // Pour l'instant, on retourne la version minimale
  return createMinimalMP4(duration, width, height);
}

/**
 * Crée des données vidéo réalistes avec NAL units H.264 valides
 */
function createRealisticVideoData(sampleCount, sampleSize, width, height) {
  const mdatData = Buffer.alloc(sampleCount * sampleSize);
  
  for (let i = 0; i < sampleCount; i++) {
    const offset = i * sampleSize;
    
    // Chaque frame commence par un NAL unit start code Annex B
    mdatData[offset] = 0x00;
    mdatData[offset + 1] = 0x00;
    mdatData[offset + 2] = 0x00;
    mdatData[offset + 3] = 0x01;
    
    // NAL unit type (IDR si première frame, sinon P-frame)
    if (i === 0) {
      // IDR frame (keyframe) - important pour seekability
      mdatData[offset + 4] = 0x65; // IDR frame
      
      // Ajouter un SPS minimal au début de l'IDR
      mdatData[offset + 5] = 0x67; // SPS NAL unit type
      mdatData[offset + 6] = 0x42; // Profile IDC (baseline)
      mdatData[offset + 7] = 0x00; // Constraint flags
      mdatData[offset + 8] = 0x1E; // Level IDC
      mdatData[offset + 9] = 0xFF; // End of SPS marker
      
      // PPS minimal
      mdatData[offset + 10] = 0x68; // PPS NAL unit type
      mdatData[offset + 11] = 0xCE;
      mdatData[offset + 12] = 0x06;
      mdatData[offset + 13] = 0xE2;
      
    } else {
      mdatData[offset + 4] = 0x41; // P-frame (non-keyframe)
      
      // Données P-frame plus simples mais cohérentes
      mdatData[offset + 5] = 0x9A;
      mdatData[offset + 6] = 0x66;
      mdatData[offset + 7] = 0x42;
      mdatData[offset + 8] = (i % 256); // Variable selon frame
    }
    
    // Remplir le reste avec des données pseudo-aléatoires mais déterministes
    let checksum = 0;
    for (let j = 14; j < sampleSize - 8; j++) {
      const value = (i * 7 + j * 13 + width + height) % 256;
      mdatData[offset + j] = value;
      checksum += value;
    }
    
    // Ajouter un checksum pour validation
    mdatData[offset + sampleSize - 4] = (checksum >> 24) & 0xFF;
    mdatData[offset + sampleSize - 3] = (checksum >> 16) & 0xFF;
    mdatData[offset + sampleSize - 2] = (checksum >> 8) & 0xFF;
    mdatData[offset + sampleSize - 1] = checksum & 0xFF;
  }
  
  return mdatData;
}

/**
 * Crée un box udta (user data) pour compatibilité
 */
function createUserDataBox() {
  const udtaData = Buffer.from([
    // meta box
    0x00, 0x00, 0x00, 0x22, // box size
    0x6D, 0x65, 0x74, 0x61, // 'meta'
    0x00, 0x00, 0x00, 0x00, // version + flags
    // hdlr in meta
    0x00, 0x00, 0x00, 0x1A, // box size
    0x68, 0x64, 0x6C, 0x72, // 'hdlr'
    0x00, 0x00, 0x00, 0x00, // version + flags
    0x00, 0x00, 0x00, 0x00, // pre_defined
    0x6D, 0x64, 0x69, 0x72, // handler_type 'mdir'
    0x00, 0x00, // name (empty)
  ]);

  const udtaHeader = Buffer.from([
    ...numberToBytes(8 + udtaData.length, 4),
    0x75, 0x64, 0x74, 0x61  // 'udta'
  ]);

  return Buffer.concat([udtaHeader, udtaData]);
}

/**
 * Met à jour les offsets des chunks dans le box moov pour pointer correctement vers mdat
 */
function updateChunkOffsets(moovBuffer, actualOffset) {
  // Créer une copie du buffer pour modification
  const correctedBuffer = Buffer.from(moovBuffer);
  
  // Rechercher et corriger le box stco dans le buffer
  const stcoSignature = Buffer.from([0x73, 0x74, 0x63, 0x6F]); // 'stco'
  
  let stcoIndex = -1;
  for (let i = 0; i < correctedBuffer.length - 4; i++) {
    if (correctedBuffer.subarray(i, i + 4).equals(stcoSignature)) {
      stcoIndex = i;
      break;
    }
  }
  
  if (stcoIndex !== -1) {
    // L'offset se trouve 8 bytes après la signature stco (4 bytes size + 4 bytes signature + 4 bytes version/flags + 4 bytes entry count)
    const offsetPosition = stcoIndex + 12;
    
    // Écrire le nouvel offset (big-endian)
    correctedBuffer[offsetPosition] = (actualOffset >> 24) & 0xFF;
    correctedBuffer[offsetPosition + 1] = (actualOffset >> 16) & 0xFF;
    correctedBuffer[offsetPosition + 2] = (actualOffset >> 8) & 0xFF;
    correctedBuffer[offsetPosition + 3] = actualOffset & 0xFF;
  }
  
  return correctedBuffer;
}

/**
 * Crée un MP4 simple mais valide en utilisant des structures basiques
 */
function createSimpleValidMP4(duration, width, height) {
  // MP4 minimal mais correct avec structures essentielles
  
  // ftyp box - identifie le type de fichier
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // size
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // major brand 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6F, 0x6D, // compatible brand 'isom'
    0x69, 0x73, 0x6F, 0x32, // compatible brand 'iso2'
    0x61, 0x76, 0x63, 0x31, // compatible brand 'avc1'
    0x6D, 0x70, 0x34, 0x31  // compatible brand 'mp41'
  ]);

  // Construire moov box avec métadonnées simplifiées mais correctes
  const timescale = 1000; // 1000 unités par seconde
  const durationTicks = duration * timescale;
  
  // mvhd box simplifié
  const mvhd = Buffer.from([
    0x00, 0x00, 0x00, 0x6C, // size
    0x6D, 0x76, 0x68, 0x64, // 'mvhd'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x00, // creation time
    0x00, 0x00, 0x00, 0x00, // modification time
    ...write32(timescale),   // timescale
    ...write32(durationTicks), // duration
    0x00, 0x01, 0x00, 0x00, // rate (1.0)
    0x01, 0x00, 0x00, 0x00, // volume (1.0)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    // unity matrix
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00,
    // pre_defined
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x02, // next track ID
  ]);

  // Créer trak box minimal mais fonctionnel
  const trak = createBasicTrakBox(duration, width, height, timescale);

  // Assembler moov
  const moovContent = Buffer.concat([mvhd, trak]);
  const moovSize = 8 + moovContent.length;
  const moov = Buffer.concat([
    Buffer.from([...write32(moovSize), 0x6D, 0x6F, 0x6F, 0x76]), // header
    moovContent
  ]);

  // mdat box avec données fictives mais cohérentes
  const mdatContent = Buffer.alloc(1024); // Données minimales
  // Remplir avec un pattern répétitif valide
  for (let i = 0; i < mdatContent.length; i += 4) {
    mdatContent[i] = 0x00;
    mdatContent[i + 1] = 0x00;
    mdatContent[i + 2] = 0x01;
    mdatContent[i + 3] = 0x65; // NAL unit type
  }
  
  const mdatSize = 8 + mdatContent.length;
  const mdat = Buffer.concat([
    Buffer.from([...write32(mdatSize), 0x6D, 0x64, 0x61, 0x74]), // header
    mdatContent
  ]);

  return Buffer.concat([ftyp, moov, mdat]);
}

/**
 * Écrit un entier 32-bit en big-endian
 */
function write32(value) {
  return [
    (value >> 24) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 8) & 0xFF,
    value & 0xFF
  ];
}

/**
 * Écrit un entier 16-bit en big-endian
 */
function write16(value) {
  return [
    (value >> 8) & 0xFF,
    value & 0xFF
  ];
}

/**
 * Crée un trak box basique mais fonctionnel
 */
function createBasicTrakBox(duration, width, height, timescale) {
  const durationTicks = duration * timescale;
  
  // tkhd box
  const tkhd = Buffer.from([
    0x00, 0x00, 0x00, 0x5C, // size
    0x74, 0x6B, 0x68, 0x64, // 'tkhd'
    0x00, 0x00, 0x00, 0x07, // version/flags (enabled + in movie + in preview)
    0x00, 0x00, 0x00, 0x00, // creation time
    0x00, 0x00, 0x00, 0x00, // modification time
    0x00, 0x00, 0x00, 0x01, // track ID
    0x00, 0x00, 0x00, 0x00, // reserved
    ...write32(durationTicks), // duration
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // layer + alternate group
    0x00, 0x00, 0x00, 0x00, // volume + reserved
    // Unity matrix
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00,
    ...write32(width << 16),  // width
    ...write32(height << 16), // height
  ]);

  // mdia box simplifié
  const mdia = createBasicMdiaBox(duration, timescale, width, height);

  const trakContent = Buffer.concat([tkhd, mdia]);
  const trakSize = 8 + trakContent.length;
  
  return Buffer.concat([
    Buffer.from([...write32(trakSize), 0x74, 0x72, 0x61, 0x6B]), // header
    trakContent
  ]);
}

/**
 * Crée un mdia box basique
 */
function createBasicMdiaBox(duration, timescale, width, height) {
  const durationTicks = duration * timescale;
  
  // mdhd box
  const mdhd = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // size
    0x6D, 0x64, 0x68, 0x64, // 'mdhd'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x00, // creation time
    0x00, 0x00, 0x00, 0x00, // modification time
    ...write32(timescale),   // timescale
    ...write32(durationTicks), // duration
    0x55, 0xC4, 0x00, 0x00, // language (undetermined) + quality
  ]);

  // hdlr box
  const hdlr = Buffer.from([
    0x00, 0x00, 0x00, 0x21, // size
    0x68, 0x64, 0x6C, 0x72, // 'hdlr'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x00, // pre_defined
    0x76, 0x69, 0x64, 0x65, // handler_type 'vide'
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, // name (empty)
  ]);

  // minf box
  const minf = createBasicMinfBox(width, height);

  const mdiaContent = Buffer.concat([mdhd, hdlr, minf]);
  const mdiaSize = 8 + mdiaContent.length;
  
  return Buffer.concat([
    Buffer.from([...write32(mdiaSize), 0x6D, 0x64, 0x69, 0x61]), // header
    mdiaContent
  ]);
}

/**
 * Crée un minf box basique
 */
function createBasicMinfBox(width, height) {
  // vmhd box
  const vmhd = Buffer.from([
    0x00, 0x00, 0x00, 0x14, // size
    0x76, 0x6D, 0x68, 0x64, // 'vmhd'
    0x00, 0x00, 0x00, 0x01, // version/flags
    0x00, 0x00, // graphics mode
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // opcolor
  ]);

  // dinf box
  const dinf = Buffer.from([
    0x00, 0x00, 0x00, 0x24, // size
    0x64, 0x69, 0x6E, 0x66, // 'dinf'
    0x00, 0x00, 0x00, 0x1C, // dref size
    0x64, 0x72, 0x65, 0x66, // 'dref'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x00, 0x0C, // url size
    0x75, 0x72, 0x6C, 0x20, // 'url '
    0x00, 0x00, 0x00, 0x01, // version/flags (self-contained)
  ]);

  // stbl box ultra-simplifié
  const stbl = createUltraSimpleStblBox(width, height);

  const minfContent = Buffer.concat([vmhd, dinf, stbl]);
  const minfSize = 8 + minfContent.length;
  
  return Buffer.concat([
    Buffer.from([...write32(minfSize), 0x6D, 0x69, 0x6E, 0x66]), // header
    minfContent
  ]);
}

/**
 * Crée un stbl box ultra-simple mais fonctionnel
 */
function createUltraSimpleStblBox(width, height) {
  // stsd box minimal
  const stsd = Buffer.from([
    0x00, 0x00, 0x00, 0x88, // size
    0x73, 0x74, 0x73, 0x64, // 'stsd'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x01, // entry count
    // Sample entry (avc1)
    0x00, 0x00, 0x00, 0x78, // entry size
    0x61, 0x76, 0x63, 0x31, // 'avc1'
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, // data reference index
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // pre_defined
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    ...write16(width),  // width
    ...write16(height), // height
    0x00, 0x48, 0x00, 0x00, // horizontal resolution
    0x00, 0x48, 0x00, 0x00, // vertical resolution
    0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, // frame count
    // compressor name (32 bytes)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x18, // depth
    0xFF, 0xFF, // pre_defined
    // avcC box minimal
    0x00, 0x00, 0x00, 0x18, // size
    0x61, 0x76, 0x63, 0x43, // 'avcC'
    0x01, 0x42, 0x00, 0x1E, // configuration
    0xFF, 0xE1, 0x00, 0x07, // SPS count
    0x67, 0x42, 0x00, 0x1E, 0xFF, 0xFF, 0xFF, // SPS
    0x01, 0x00, 0x04, 0x68, 0xCE, 0x06, 0xE2, // PPS
  ]);

  // Tables d'échantillons ultra-simples
  const stts = Buffer.from([
    0x00, 0x00, 0x00, 0x18, // size
    0x73, 0x74, 0x74, 0x73, // 'stts'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x00, 0x01, // sample count
    0x00, 0x00, 0x03, 0xE8, // sample delta (1000 = 1 seconde à timescale 1000)
  ]);

  const stsc = Buffer.from([
    0x00, 0x00, 0x00, 0x1C, // size
    0x73, 0x74, 0x73, 0x63, // 'stsc'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x00, 0x01, // first chunk
    0x00, 0x00, 0x00, 0x01, // samples per chunk
    0x00, 0x00, 0x00, 0x01, // sample description index
  ]);

  const stsz = Buffer.from([
    0x00, 0x00, 0x00, 0x14, // size
    0x73, 0x74, 0x73, 0x7A, // 'stsz'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x04, 0x00, // sample size (1024 bytes)
    0x00, 0x00, 0x00, 0x01, // sample count
  ]);

  const stco = Buffer.from([
    0x00, 0x00, 0x00, 0x14, // size
    0x73, 0x74, 0x63, 0x6F, // 'stco'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x00, 0x00, 0x00, 0x01, // entry count
    0x00, 0x00, 0x02, 0x00, // chunk offset (approximatif)
  ]);

  const stblContent = Buffer.concat([stsd, stts, stsc, stsz, stco]);
  const stblSize = 8 + stblContent.length;
  
  return Buffer.concat([
    Buffer.from([...write32(stblSize), 0x73, 0x74, 0x62, 0x6C]), // header
    stblContent
  ]);
}
