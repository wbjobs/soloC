import { Residue, ProteinData } from '../types';
import { predictStability } from './modelInference';

const AMINO_ACID_3_TO_1: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

const AMINO_ACID_1_TO_3: Record<string, string> = {
  A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS',
  Q: 'GLN', E: 'GLU', G: 'GLY', H: 'HIS', I: 'ILE',
  L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO',
  S: 'SER', T: 'THR', W: 'TRP', Y: 'TYR', V: 'VAL',
};

const AMINO_ACID_NAMES: Record<string, string> = {
  ALA: 'Alanine', ARG: 'Arginine', ASN: 'Asparagine',
  ASP: 'Aspartic acid', CYS: 'Cysteine', GLN: 'Glutamine',
  GLU: 'Glutamic acid', GLY: 'Glycine', HIS: 'Histidine',
  ILE: 'Isoleucine', LEU: 'Leucine', LYS: 'Lysine',
  MET: 'Methionine', PHE: 'Phenylalanine', PRO: 'Proline',
  SER: 'Serine', THR: 'Threonine', TRP: 'Tryptophan',
  TYR: 'Tyrosine', VAL: 'Valine',
};

export const ALL_AMINO_ACIDS: string[] = [
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS',
  'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO',
  'SER', 'THR', 'TRP', 'TYR', 'VAL'
];

export function threeToOne(code: string): string {
  return AMINO_ACID_3_TO_1[code] || 'X';
}

export function oneToThree(code: string): string {
  return AMINO_ACID_1_TO_3[code] || 'X';
}

export function getAminoAcidName(code: string): string {
  return AMINO_ACID_NAMES[code] || code;
}

export function formatMutation(original: string, residueSeq: number, target: string): string {
  const orig1 = threeToOne(original);
  const tgt1 = threeToOne(target);
  return `${orig1}${residueSeq}${tgt1}`;
}

export function getOriginalAndAvailableMutations(
  originalResName: string
): {
  original: string;
  originalName: string;
  available: string[];
} {
  return {
    original: originalResName,
    originalName: getAminoAcidName(originalResName),
    available: ALL_AMINO_ACIDS.filter(aa => aa !== originalResName)
  };
}

function createMutatedResidue(original: Residue, targetResName: string): Residue {
  return {
    resSeq: original.resSeq,
    resName: targetResName,
    chainID: original.chainID,
    atoms: original.atoms,
  };
}

export function createMutatedProteinData(
  original: ProteinData,
  residueIndex: number,
  targetResName: string
): ProteinData | null {
  const allResidues = original.chains.flatMap(chain => chain.residues);
  
  if (residueIndex < 0 || residueIndex >= allResidues.length) {
    return null;
  }
  
  let currentIndex = 0;
  const newChains = original.chains.map(chain => {
    const newResidues = chain.residues.map(residue => {
      if (currentIndex === residueIndex) {
        currentIndex++;
        return createMutatedResidue(residue, targetResName);
      }
      currentIndex++;
      return residue;
    });
    return {
      id: chain.id,
      residues: newResidues
    };
  });
  
  const newSequence = newChains
    .flatMap(chain => chain.residues)
    .map(res => threeToOne(res.resName))
    .join('');
  
  return {
    atoms: original.atoms,
    chains: newChains,
    sequence: newSequence,
    numAtoms: original.numAtoms,
    numResidues: original.numResidues,
    numChains: original.numChains,
  };
}

export async function computeMutationDeltaScore(
  originalProtein: ProteinData,
  originalScores: number[],
  residueIndex: number,
  targetResName: string
): Promise<{
  mutatedScore: number;
  deltaScore: number;
  mutatedScores: number[];
  usingModel: boolean;
} | null> {
  const mutatedProtein = createMutatedProteinData(originalProtein, residueIndex, targetResName);
  if (!mutatedProtein) {
    return null;
  }
  
  const result = await predictStability(mutatedProtein);
  
  const mutatedScore = result.scores[residueIndex] ?? originalScores[residueIndex];
  const originalScore = originalScores[residueIndex] ?? 0.5;
  
  return {
    mutatedScore,
    deltaScore: mutatedScore - originalScore,
    mutatedScores: result.scores,
    usingModel: result.usingModel
  };
}

export async function runMutationAnalysis(
  pdbContent: string,
  residueIndex: number,
  originalResName: string,
  targetResName: string
): Promise<{
  success: boolean;
  energyLandscapeUrl?: string;
  message?: string;
}> {
  try {
    const formData = new FormData();
    const blob = new Blob([pdbContent], { type: 'text/plain' });
    formData.append('file', blob, 'protein.pdb');
    
    const response = await fetch('/api/mutation-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pdb_content: pdbContent,
        residue_index: residueIndex,
        original_res_name: originalResName,
        target_res_name: targetResName
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Server error: ${errorText}`
      };
    }
    
    return await response.json();
  } catch (error) {
    return {
      success: false,
      message: `Connection error: ${(error as Error).message}`
    };
  }
}
