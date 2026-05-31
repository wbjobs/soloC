import { Atom, Residue, Chain, ProteinData } from '../types';

const AMINO_ACID_3_TO_1: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

export function parsePDB(content: string): ProteinData {
  const lines = content.split('\n');
  const atoms: Atom[] = [];
  const chainMap = new Map<string, Map<number, Atom[]>>();
  
  for (const line of lines) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;
    
    const atom = parseAtomLine(line);
    if (atom) {
      atoms.push(atom);
      
      if (!chainMap.has(atom.chainID)) {
        chainMap.set(atom.chainID, new Map());
      }
      const residueMap = chainMap.get(atom.chainID)!;
      
      if (!residueMap.has(atom.resSeq)) {
        residueMap.set(atom.resSeq, []);
      }
      residueMap.get(atom.resSeq)!.push(atom);
    }
  }
  
  const chains: Chain[] = [];
  let sequence = '';
  let totalResidues = 0;
  
  for (const [chainID, residueMap] of chainMap.entries()) {
    const residues: Residue[] = [];
    
    const sortedResSeqs = Array.from(residueMap.keys()).sort((a, b) => a - b);
    
    for (const resSeq of sortedResSeqs) {
      const residueAtoms = residueMap.get(resSeq)!;
      const firstAtom = residueAtoms[0];
      const oneLetter = AMINO_ACID_3_TO_1[firstAtom.resName] || 'X';
      
      residues.push({
        resSeq,
        resName: firstAtom.resName,
        chainID,
        atoms: residueAtoms,
      });
      
      sequence += oneLetter;
      totalResidues++;
    }
    
    chains.push({ id: chainID, residues });
  }
  
  return {
    atoms,
    chains,
    sequence,
    numAtoms: atoms.length,
    numResidues: totalResidues,
    numChains: chains.length,
  };
}

function parseAtomLine(line: string): Atom | null {
  try {
    return {
      serial: parseInt(line.slice(6, 11).trim(), 10),
      name: line.slice(12, 16).trim(),
      altLoc: line.slice(16, 17).trim(),
      resName: line.slice(17, 20).trim(),
      chainID: line.slice(21, 22).trim() || 'A',
      resSeq: parseInt(line.slice(22, 26).trim(), 10),
      iCode: line.slice(26, 27).trim(),
      x: parseFloat(line.slice(30, 38).trim()),
      y: parseFloat(line.slice(38, 46).trim()),
      z: parseFloat(line.slice(46, 54).trim()),
      occupancy: parseFloat(line.slice(54, 60).trim()) || 1.0,
      tempFactor: parseFloat(line.slice(60, 66).trim()) || 0.0,
      element: line.slice(76, 78).trim() || extractElementFromName(line.slice(12, 16)),
      charge: line.slice(78, 80).trim(),
    };
  } catch {
    return null;
  }
}

function extractElementFromName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'C';
  
  const first = trimmed[0];
  if (['C', 'N', 'O', 'S', 'P', 'H'].includes(first)) {
    return first;
  }
  
  if (trimmed.length >= 2) {
    const two = trimmed.substring(0, 2);
    if (['CA', 'CB', 'CD', 'CG', 'CZ', 'ND', 'NE', 'NZ', 'OD', 'OE', 'OG', 'OH'].includes(two.toUpperCase())) {
      return two[0];
    }
  }
  
  return first;
}

export function getAllResidues(protein: ProteinData): Residue[] {
  return protein.chains.flatMap(chain => chain.residues);
}

export function getBackboneAtoms(residue: Residue): Atom[] {
  const backboneNames = ['N', 'CA', 'C', 'O'];
  return residue.atoms.filter(atom => backboneNames.includes(atom.name));
}

export function getCaAtom(residue: Residue): Atom | null {
  return residue.atoms.find(atom => atom.name === 'CA') || null;
}
