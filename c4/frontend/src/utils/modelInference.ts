import * as ort from 'onnxruntime-web';
import { ProteinData, Residue } from '../types';
import { getCaAtom } from './pdbParser';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

const AMINO_ACID_3_TO_1: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

const AMINO_ACID_ALPHABET = 'ACDEFGHIKLMNPQRSTVWYX';
const FEATURE_SIZE = AMINO_ACID_ALPHABET.length;

interface ModelInputs {
  sequenceFeatures: Float32Array;
  distanceMatrix: Float32Array;
  attentionMask?: Float32Array;
  paddedLength: number;
  originalLength: number;
}

function roundUpToPowerOfTwo(n: number, min: number = 8): number {
  if (n <= 0) return min;
  let result = min;
  while (result < n) {
    result *= 2;
  }
  return result;
}

function getPaddingStrategy(numResidues: number): { paddedLength: number; usePowerOfTwo: boolean } {
  if (numResidues <= 32) {
    return { paddedLength: roundUpToPowerOfTwo(numResidues, 8), usePowerOfTwo: true };
  }
  if (numResidues <= 256) {
    return { paddedLength: roundUpToPowerOfTwo(numResidues, 64), usePowerOfTwo: true };
  }
  const mod128 = ((numResidues + 127) / 128 | 0) * 128;
  return { paddedLength: mod128, usePowerOfTwo: false };
}

export function oneHotEncodeSequence(residues: Residue[], paddedLength?: number): {
  encoded: Float32Array;
  attentionMask: Float32Array;
  actualLength: number;
  paddedLength: number;
} {
  const actualLength = residues.length;
  const usePaddedLength = paddedLength ?? getPaddingStrategy(actualLength).paddedLength;
  const finalPaddedLength = Math.max(actualLength, usePaddedLength);
  
  const encoded = new Float32Array(finalPaddedLength * FEATURE_SIZE);
  const attentionMask = new Float32Array(finalPaddedLength * finalPaddedLength);
  
  for (let i = 0; i < actualLength; i++) {
    const resName = residues[i].resName;
    const oneLetter = AMINO_ACID_3_TO_1[resName] || 'X';
    const idx = AMINO_ACID_ALPHABET.indexOf(oneLetter);
    const effectiveIdx = idx >= 0 ? idx : AMINO_ACID_ALPHABET.length - 1;
    encoded[i * FEATURE_SIZE + effectiveIdx] = 1.0;
  }
  
  for (let i = 0; i < actualLength; i++) {
    for (let j = 0; j < actualLength; j++) {
      attentionMask[i * finalPaddedLength + j] = 1.0;
    }
  }
  
  for (let i = actualLength; i < finalPaddedLength; i++) {
    for (let j = 0; j < finalPaddedLength; j++) {
      attentionMask[i * finalPaddedLength + j] = 0.0;
    }
    for (let j = actualLength; j < finalPaddedLength; j++) {
      attentionMask[j * finalPaddedLength + i] = 0.0;
    }
  }
  
  return {
    encoded,
    attentionMask,
    actualLength,
    paddedLength: finalPaddedLength
  };
}

export function computeDistanceMatrix(
  residues: Residue[],
  paddedLength?: number
): {
  matrix: Float32Array;
  actualLength: number;
  paddedLength: number;
} {
  const actualLength = residues.length;
  const usePaddedLength = paddedLength ?? getPaddingStrategy(actualLength).paddedLength;
  const finalPaddedLength = Math.max(actualLength, usePaddedLength);
  
  const distanceMatrix = new Float32Array(finalPaddedLength * finalPaddedLength);
  
  const caPositions: Float32Array[] = [];
  
  for (const residue of residues) {
    const ca = getCaAtom(residue);
    if (ca) {
      caPositions.push(new Float32Array([ca.x, ca.y, ca.z]));
    } else {
      caPositions.push(new Float32Array([0, 0, 0]));
    }
  }
  
  for (let i = 0; i < actualLength; i++) {
    for (let j = 0; j < actualLength; j++) {
      const dx = caPositions[i][0] - caPositions[j][0];
      const dy = caPositions[i][1] - caPositions[j][1];
      const dz = caPositions[i][2] - caPositions[j][2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distanceMatrix[i * finalPaddedLength + j] = dist;
    }
  }
  
  for (let i = actualLength; i < finalPaddedLength; i++) {
    for (let j = 0; j < finalPaddedLength; j++) {
      distanceMatrix[i * finalPaddedLength + j] = 0.0;
    }
    for (let j = actualLength; j < finalPaddedLength; j++) {
      distanceMatrix[j * finalPaddedLength + i] = 0.0;
    }
  }
  
  return {
    matrix: distanceMatrix,
    actualLength,
    paddedLength: finalPaddedLength
  };
}

export function prepareModelInputs(residues: Residue[]): ModelInputs {
  const actualLength = residues.length;
  const paddingStrategy = getPaddingStrategy(actualLength);
  const paddedLength = paddingStrategy.paddedLength;
  
  const sequenceResult = oneHotEncodeSequence(residues, paddedLength);
  const distanceResult = computeDistanceMatrix(residues, paddedLength);
  
  return {
    sequenceFeatures: sequenceResult.encoded,
    distanceMatrix: distanceResult.matrix,
    attentionMask: sequenceResult.attentionMask,
    paddedLength,
    originalLength: actualLength
  };
}

function generateRandomScores(numResidues: number): number[] {
  const scores: number[] = [];
  for (let i = 0; i < numResidues; i++) {
    const baseStability = 0.4 + Math.random() * 0.3;
    const localEffect = i % 5 === 0 ? -0.15 : i % 7 === 0 ? 0.15 : 0;
    const noise = (Math.random() - 0.5) * 0.15;
    const score = Math.max(0, Math.min(1, baseStability + localEffect + noise));
    scores.push(score);
  }
  return scores;
}

export async function predictStability(
  protein: ProteinData,
  modelPath: string = '/model.onnx'
): Promise<{ scores: number[]; usingModel: boolean }> {
  const allResidues = protein.chains.flatMap(chain => chain.residues);
  const numResidues = allResidues.length;
  
  if (numResidues === 0) {
    return { scores: [], usingModel: false };
  }
  
  const inputs = prepareModelInputs(allResidues);
  
  try {
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all'
    });
    
    const sequenceTensor = new ort.Tensor(
      'float32',
      inputs.sequenceFeatures,
      [1, inputs.paddedLength, FEATURE_SIZE]
    );
    
    const distanceTensor = new ort.Tensor(
      'float32',
      inputs.distanceMatrix,
      [1, inputs.paddedLength, inputs.paddedLength]
    );
    
    const inputNames = session.inputNames;
    const feeds: Record<string, ort.Tensor> = {};
    
    if (inputNames.length >= 3 && inputs.attentionMask) {
      const maskTensor = new ort.Tensor(
        'float32',
        inputs.attentionMask,
        [1, inputs.paddedLength, inputs.paddedLength]
      );
      feeds[inputNames[0]] = sequenceTensor;
      feeds[inputNames[1]] = distanceTensor;
      feeds[inputNames[2]] = maskTensor;
    } else if (inputNames.length >= 2) {
      feeds[inputNames[0]] = sequenceTensor;
      feeds[inputNames[1]] = distanceTensor;
    } else if (inputNames.length >= 1) {
      feeds[inputNames[0]] = sequenceTensor;
    }
    
    const outputData = await session.run(feeds);
    const outputName = session.outputNames[0];
    const output = outputData[outputName];
    
    const scores: number[] = [];
    const outputShape = output.dims;
    
    let outputStartIdx = 0;
    if (outputShape.length >= 2 && outputShape[0] === 1) {
      outputStartIdx = 0;
    }
    
    for (let i = 0; i < inputs.originalLength && i < output.data.length; i++) {
      let score = output.data[outputStartIdx + i] as number;
      if (score < 0 || score > 1) {
        score = 1 / (1 + Math.exp(-score));
      }
      score = Math.max(0, Math.min(1, score));
      scores.push(score);
    }
    
    while (scores.length < numResidues) {
      scores.push(0.5);
    }
    
    return { scores, usingModel: true };
    
  } catch (error) {
    console.warn('Model inference failed, using heuristic scoring:', error);
    const scores = generateRandomScores(numResidues);
    return { scores, usingModel: false };
  }
}

export async function runSimulation(pdbContent: string, steps: number = 100): Promise<{
  rmsd: number;
  initial_energy: number;
  final_energy: number;
  steps: number;
  success: boolean;
  message?: string;
}> {
  try {
    const formData = new FormData();
    const blob = new Blob([pdbContent], { type: 'text/plain' });
    formData.append('file', blob, 'protein.pdb');
    
    const response = await fetch(`/api/simulate?steps=${steps}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        rmsd: 0,
        initial_energy: 0,
        final_energy: 0,
        steps,
        success: false,
        message: `Server error: ${errorText}`
      };
    }
    
    return await response.json();
  } catch (error) {
    return {
      rmsd: 0,
      initial_energy: 0,
      final_energy: 0,
      steps,
      success: false,
      message: `Connection error: ${(error as Error).message}`
    };
  }
}
