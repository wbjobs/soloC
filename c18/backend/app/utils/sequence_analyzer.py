import numpy as np
from collections import Counter
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class SequenceAnalyzer:
    def __init__(self):
        self.nucleotides = ['A', 'T', 'G', 'C']
        self.amino_acids = ['A', 'R', 'N', 'D', 'C', 'Q', 'E', 'G', 'H', 'I', 
                           'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V']
        self.codons = {
            'TTT': 'F', 'TTC': 'F', 'TTA': 'L', 'TTG': 'L',
            'TCT': 'S', 'TCC': 'S', 'TCA': 'S', 'TCG': 'S',
            'TAT': 'Y', 'TAC': 'Y', 'TAA': '*', 'TAG': '*',
            'TGT': 'C', 'TGC': 'C', 'TGA': '*', 'TGG': 'W',
            'CTT': 'L', 'CTC': 'L', 'CTA': 'L', 'CTG': 'L',
            'CCT': 'P', 'CCC': 'P', 'CCA': 'P', 'CCG': 'P',
            'CAT': 'H', 'CAC': 'H', 'CAA': 'Q', 'CAG': 'Q',
            'CGT': 'R', 'CGC': 'R', 'CGA': 'R', 'CGG': 'R',
            'ATT': 'I', 'ATC': 'I', 'ATA': 'I', 'ATG': 'M',
            'ACT': 'T', 'ACC': 'T', 'ACA': 'T', 'ACG': 'T',
            'AAT': 'N', 'AAC': 'N', 'AAA': 'K', 'AAG': 'K',
            'AGT': 'S', 'AGC': 'S', 'AGA': 'R', 'AGG': 'R',
            'GTT': 'V', 'GTC': 'V', 'GTA': 'V', 'GTG': 'V',
            'GCT': 'A', 'GCC': 'A', 'GCA': 'A', 'GCG': 'A',
            'GAT': 'D', 'GAC': 'D', 'GAA': 'E', 'GAG': 'E',
            'GGT': 'G', 'GGC': 'G', 'GGA': 'G', 'GGG': 'G'
        }
        self.amino_acid_properties = {
            'hydrophobic': ['A', 'V', 'L', 'I', 'P', 'F', 'M', 'W'],
            'polar': ['G', 'S', 'T', 'C', 'Y', 'N', 'Q'],
            'positive': ['K', 'R', 'H'],
            'negative': ['D', 'E']
        }

    def calculate_nucleotide_frequency(self, sequence: str) -> Dict[str, float]:
        seq = sequence.upper().replace('U', 'T')
        total = len(seq)
        if total == 0:
            return {n: 0.0 for n in self.nucleotides}
        
        counts = Counter(seq)
        return {n: counts.get(n, 0) / total * 100 for n in self.nucleotides}

    def calculate_gc_content(self, sequence: str) -> float:
        seq = sequence.upper()
        gc = seq.count('G') + seq.count('C')
        total = len(seq)
        return gc / total * 100 if total > 0 else 0.0

    def calculate_dinucleotide_frequency(self, sequence: str) -> Dict[str, float]:
        seq = sequence.upper().replace('U', 'T')
        dinucleotides = []
        for i in range(len(seq) - 1):
            dinucleotide = seq[i:i+2]
            if all(n in self.nucleotides for n in dinucleotide):
                dinucleotides.append(dinucleotide)
        
        total = len(dinucleotides)
        counts = Counter(dinucleotides)
        return {dn: counts.get(dn, 0) / total * 100 if total > 0 else 0.0 
                for dn in [a + b for a in self.nucleotides for b in self.nucleotides]}

    def calculate_codon_usage(self, sequence: str) -> Dict[str, float]:
        seq = sequence.upper().replace('U', 'T')
        codons = []
        for i in range(0, len(seq) - 2, 3):
            codon = seq[i:i+3]
            if all(n in self.nucleotides for n in codon):
                codons.append(codon)
        
        total = len(codons)
        counts = Counter(codons)
        return {codon: counts.get(codon, 0) / total * 100 if total > 0 else 0.0 
                for codon in self.codons.keys()}

    def translate_sequence(self, sequence: str, frame: int = 0) -> str:
        seq = sequence.upper().replace('U', 'T')
        protein = []
        for i in range(frame, len(seq) - 2, 3):
            codon = seq[i:i+3]
            if all(n in self.nucleotides for n in codon):
                amino_acid = self.codons.get(codon, 'X')
                protein.append(amino_acid)
                if amino_acid == '*':
                    break
        return ''.join(protein)

    def calculate_amino_acid_frequency(self, protein_sequence: str) -> Dict[str, float]:
        seq = protein_sequence.upper()
        total = len([aa for aa in seq if aa in self.amino_acids])
        if total == 0:
            return {aa: 0.0 for aa in self.amino_acids}
        
        counts = Counter(seq)
        return {aa: counts.get(aa, 0) / total * 100 for aa in self.amino_acids}

    def calculate_hydropathy_index(self, protein_sequence: str) -> float:
        kd_hydro = {
            'I': 4.5, 'V': 4.2, 'L': 3.8, 'F': 2.8, 'C': 2.5,
            'M': 1.9, 'A': 1.8, 'G': -0.4, 'T': -0.7, 'W': -0.9,
            'S': -0.8, 'Y': -1.3, 'P': -1.6, 'H': -3.2, 'E': -3.5,
            'Q': -3.5, 'D': -3.5, 'N': -3.5, 'K': -3.9, 'R': -4.5
        }
        
        seq = protein_sequence.upper()
        values = [kd_hydro.get(aa, 0) for aa in seq if aa in kd_hydro]
        return sum(values) / len(values) if values else 0.0

    def calculate_molecular_weight(self, protein_sequence: str) -> float:
        aa_weights = {
            'A': 71.09, 'R': 156.19, 'N': 114.11, 'D': 115.09, 'C': 103.15,
            'Q': 128.14, 'E': 129.12, 'G': 57.05, 'H': 137.14, 'I': 113.16,
            'L': 113.16, 'K': 128.17, 'M': 131.19, 'F': 147.18, 'P': 97.12,
            'S': 87.08, 'T': 101.11, 'W': 186.21, 'Y': 163.18, 'V': 99.14
        }
        
        seq = protein_sequence.upper().replace('*', '')
        total = sum(aa_weights.get(aa, 0) for aa in seq)
        return total if seq else 0.0

    def calculate_isoelectric_point(self, protein_sequence: str) -> float:
        pKa_values = {
            'K': 10.0, 'R': 12.0, 'H': 5.98,
            'D': 3.65, 'E': 4.25,
            'C': 8.18, 'Y': 10.1,
            'N_term': 8.0, 'C_term': 3.1
        }
        
        seq = protein_sequence.upper().replace('*', '')
        if not seq:
            return 7.0
        
        counts = Counter(seq)
        
        def calculate_net_charge(pH):
            positive = 0
            negative = 0
            
            if seq:
                positive += 1 / (1 + 10 ** (pH - pKa_values['N_term']))
                negative += 1 / (1 + 10 ** (pKa_values['C_term'] - pH))
            
            for aa in ['K', 'R', 'H']:
                positive += counts.get(aa, 0) / (1 + 10 ** (pH - pKa_values[aa]))
            
            for aa in ['D', 'E', 'C', 'Y']:
                negative += counts.get(aa, 0) / (1 + 10 ** (pKa_values[aa] - pH))
            
            return positive - negative
        
        low, high = 0.0, 14.0
        for _ in range(20):
            mid = (low + high) / 2
            if calculate_net_charge(mid) > 0:
                low = mid
            else:
                high = mid
        
        return round((low + high) / 2, 2)

    def extract_sequence_features(self, sequence: str) -> Dict:
        is_dna = all(n in 'ATCGatcgNnUu' for n in sequence if n.strip())
        
        features = {
            'length': len(sequence),
            'is_dna': is_dna
        }
        
        if is_dna:
            nuc_freq = self.calculate_nucleotide_frequency(sequence)
            features.update({
                'a_content': nuc_freq['A'],
                't_content': nuc_freq['T'],
                'g_content': nuc_freq['G'],
                'c_content': nuc_freq['C'],
                'gc_content': self.calculate_gc_content(sequence),
                'at_content': nuc_freq['A'] + nuc_freq['T']
            })
            
            protein = self.translate_sequence(sequence)
            if protein:
                features.update({
                    'protein_length': len(protein),
                    'has_stop_codon': '*' in protein,
                    'hydrophobicity': self.calculate_hydropathy_index(protein),
                    'molecular_weight': self.calculate_molecular_weight(protein),
                    'isoelectric_point': self.calculate_isoelectric_point(protein)
                })
        else:
            features.update({
                'hydrophobicity': self.calculate_hydropathy_index(sequence),
                'molecular_weight': self.calculate_molecular_weight(sequence),
                'isoelectric_point': self.calculate_isoelectric_point(sequence)
            })
        
        return features

    def find_cpg_islands(self, sequence: str, window_size: int = 200, min_gc: float = 50.0) -> List[Dict]:
        seq = sequence.upper().replace('U', 'T')
        islands = []
        
        for i in range(0, len(seq) - window_size + 1, window_size // 2):
            window = seq[i:i + window_size]
            gc = self.calculate_gc_content(window)
            
            if gc >= min_gc:
                cg_count = window.count('CG')
                total_cg_possible = len(window) - 1
                
                islands.append({
                    'start': i,
                    'end': i + window_size,
                    'gc_content': round(gc, 2),
                    'cg_ratio': round(cg_count / total_cg_possible * 100, 2) if total_cg_possible > 0 else 0
                })
        
        return islands

    def find_repeat_regions(self, sequence: str, min_repeat: int = 3) -> List[Dict]:
        seq = sequence.upper()
        repeats = []
        
        for unit_len in range(1, 10):
            for i in range(len(seq) - unit_len * min_repeat + 1):
                unit = seq[i:i + unit_len]
                if any(n not in 'ATCG' for n in unit):
                    continue
                
                repeat_count = 0
                j = i
                while j + unit_len <= len(seq) and seq[j:j + unit_len] == unit:
                    repeat_count += 1
                    j += unit_len
                
                if repeat_count >= min_repeat:
                    repeats.append({
                        'unit': unit,
                        'start': i,
                        'end': j,
                        'count': repeat_count,
                        'length': j - i
                    })
                    i = j - 1
        
        repeats.sort(key=lambda x: (-x['count'], -x['length']))
        return repeats[:50]
