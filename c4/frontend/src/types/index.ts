export interface Atom {
  serial: number;
  name: string;
  altLoc: string;
  resName: string;
  chainID: string;
  resSeq: number;
  iCode: string;
  x: number;
  y: number;
  z: number;
  occupancy: number;
  tempFactor: number;
  element: string;
  charge: string;
}

export interface Residue {
  resSeq: number;
  resName: string;
  chainID: string;
  atoms: Atom[];
  stabilityScore?: number;
}

export interface Chain {
  id: string;
  residues: Residue[];
}

export interface ProteinData {
  atoms: Atom[];
  chains: Chain[];
  sequence: string;
  numAtoms: number;
  numResidues: number;
  numChains: number;
}

export interface SimulationResult {
  rmsd: number;
  initial_energy: number;
  final_energy: number;
  steps: number;
  success: boolean;
  message?: string;
}

export interface PredictionResult {
  residueIndex: number;
  resName: string;
  score: number;
}

export interface ProcessingState {
  stage: 'idle' | 'loading' | 'parsing' | 'predicting' | 'visualizing' | 'simulating' | 'mutating' | 'complete' | 'error';
  message: string;
  progress: number;
}

export interface MutationResult {
  residueIndex: number;
  originalResName: string;
  mutatedResName: string;
  originalScore: number;
  mutatedScore: number;
  deltaScore: number;
  energyLandscapeUrl?: string;
  isStabilizing: boolean;
  confidence: number;
}

export interface MutationOptions {
  residueIndex: number;
  targetResName: string;
}
