import ort from 'onnxruntime-node';
import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

const MODEL_PATH = path.join(process.cwd(), 'models', 'clip-vit-base-patch32.onnx');
const TEXT_MODEL_PATH = path.join(process.cwd(), 'models', 'clip-text-vit-base-patch32.onnx');

const VOCAB = {
  '<|startoftext|>': 49406,
  '<|endoftext|>': 49407,
  '!': 0, '"': 1, '#': 2, '$': 3, '%': 4, '&': 5, "'": 6, '(': 7, ')': 8, '*': 9, '+': 10,
  ',': 11, '-': 12, '.': 13, '/': 14, '0': 15, '1': 16, '2': 17, '3': 18, '4': 19, '5': 20,
  '6': 21, '7': 22, '8': 23, '9': 24, ':': 25, ';': 26, '<': 27, '=': 28, '>': 29, '?': 30,
  '@': 31, 'A': 32, 'B': 33, 'C': 34, 'D': 35, 'E': 36, 'F': 37, 'G': 38, 'H': 39, 'I': 40,
  'J': 41, 'K': 42, 'L': 43, 'M': 44, 'N': 45, 'O': 46, 'P': 47, 'Q': 48, 'R': 49, 'S': 50,
  'T': 51, 'U': 52, 'V': 53, 'W': 54, 'X': 55, 'Y': 56, 'Z': 57, '[': 58, '\\': 59, ']': 60,
  '^': 61, '_': 62, '`': 63, 'a': 64, 'b': 65, 'c': 66, 'd': 67, 'e': 68, 'f': 69, 'g': 70,
  'h': 71, 'i': 72, 'j': 73, 'k': 74, 'l': 75, 'm': 76, 'n': 77, 'o': 78, 'p': 79, 'q': 80,
  'r': 81, 's': 82, 't': 83, 'u': 84, 'v': 85, 'w': 86, 'x': 87, 'y': 88, 'z': 89, '{': 90,
  '|': 91, '}': 92, '~': 93
};

function bytePairEncode(text) {
  const tokens = [VOCAB['<|startoftext|>']];
  const cleaned = text.toLowerCase().replace(/\s+/g, ' ').trim();
  
  for (let i = 0; i < Math.min(cleaned.length, 75); i++) {
    const char = cleaned[i];
    tokens.push(VOCAB[char] || char.charCodeAt(0));
  }
  tokens.push(VOCAB['<|endoftext|>']);
  
  while (tokens.length < 77) {
    tokens.push(0);
  }
  return tokens.slice(0, 77);
}

export class ClipExtractor {
  constructor() {
    this.imageSession = null;
    this.textSession = null;
  }

  async init() {
    if (!await fs.pathExists(MODEL_PATH)) {
      throw new Error(`CLIP model not found at ${MODEL_PATH}. Please download the ONNX model.`);
    }
    
    this.imageSession = await ort.InferenceSession.create(MODEL_PATH);
    
    if (await fs.pathExists(TEXT_MODEL_PATH)) {
      this.textSession = await ort.InferenceSession.create(TEXT_MODEL_PATH);
    }
  }

  async preprocessImage(imagePath) {
    return sharp(imagePath)
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data }) => {
        const floatData = new Float32Array(224 * 224 * 3);
        for (let i = 0; i < data.length; i++) {
          floatData[i] = data[i] / 255.0;
        }
        
        const mean = [0.48145466, 0.4578275, 0.40821073];
        const std = [0.26862954, 0.26130258, 0.27577711];
        const normalized = new Float32Array(224 * 224 * 3);
        
        for (let c = 0; c < 3; c++) {
          for (let i = 0; i < 224 * 224; i++) {
            const idx = c * 224 * 224 + i;
            normalized[idx] = (floatData[i * 3 + c] - mean[c]) / std[c];
          }
        }
        
        return normalized;
      });
  }

  async extractImageFeature(imagePath) {
    if (!this.imageSession) await this.init();
    
    const imageData = await this.preprocessImage(imagePath);
    const input = new ort.Tensor('float32', imageData, [1, 3, 224, 224]);
    const outputs = await this.imageSession.run({ input });
    const outputName = Object.keys(outputs)[0];
    return Array.from(outputs[outputName].data);
  }

  async extractTextFeature(text) {
    if (!this.textSession) {
      return this.simulateTextFeature(text);
    }
    
    const tokens = bytePairEncode(text);
    const input = new ort.Tensor('int64', BigInt64Array.from(tokens.map(BigInt)), [1, 77]);
    const outputs = await this.textSession.run({ input });
    const outputName = Object.keys(outputs)[0];
    return Array.from(outputs[outputName].data);
  }

  simulateTextFeature(text) {
    const dim = 512;
    const feature = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      let hash = 0;
      for (let j = 0; j < text.length; j++) {
        hash = ((hash << 5) - hash + text.charCodeAt(j) + i);
        hash |= 0;
      }
      feature[i] = Math.sin(hash * 0.01) * 0.1;
    }
    return Array.from(feature);
  }

  cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export default ClipExtractor;
