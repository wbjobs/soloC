import numpy as np
from typing import Dict, List, Optional, Tuple
from collections import Counter
import logging
import os
import json

logger = logging.getLogger(__name__)

class VariantPredictor:
    def __init__(self):
        self.mutation_effects = {
            'synonymous': {
                'description': 'Silent mutation, no amino acid change',
                'severity': 'low',
                'impact_score': 0.1,
                'clinical_significance': 'benign'
            },
            'missense': {
                'description': 'Amino acid substitution',
                'severity': 'medium',
                'impact_score': 0.5,
                'clinical_significance': 'uncertain'
            },
            'nonsense': {
                'description': 'Premature stop codon',
                'severity': 'high',
                'impact_score': 0.9,
                'clinical_significance': 'pathogenic'
            },
            'frameshift': {
                'description': 'Reading frame shift',
                'severity': 'high',
                'impact_score': 0.95,
                'clinical_significance': 'pathogenic'
            },
            'inframe_indel': {
                'description': 'In-frame insertion/deletion',
                'severity': 'medium',
                'impact_score': 0.4,
                'clinical_significance': 'uncertain'
            },
            'splice_site': {
                'description': 'Affects splicing',
                'severity': 'high',
                'impact_score': 0.85,
                'clinical_significance': 'likely_pathogenic'
            },
            'regulatory': {
                'description': 'Regulatory region variant',
                'severity': 'medium',
                'impact_score': 0.3,
                'clinical_significance': 'uncertain'
            }
        }
        
        self.amino_acid_changes = {
            'conservative': ['VL', 'VI', 'IL', 'DE', 'KR', 'KRH', 'NQ', 'ST', 'FY'],
            'semi_conservative': ['AG', 'GS', 'DN', 'EQ', 'AV', 'LM', 'FW', 'YF'],
            'radical': ['KRDE', 'FYLIVM', 'STNQDE', 'PAVILM', 'GAVILM']
        }
        
        self.blosum62 = {
            'A': {'A': 4, 'R': -1, 'N': -2, 'D': -2, 'C': 0, 'Q': -1, 'E': -1, 'G': 0, 'H': -2, 'I': -1, 'L': -1, 'K': -1, 'M': -1, 'F': -2, 'P': -1, 'S': 1, 'T': 0, 'W': -3, 'Y': -2, 'V': 0},
            'R': {'A': -1, 'R': 5, 'N': 0, 'D': -2, 'C': -3, 'Q': 1, 'E': 0, 'G': -2, 'H': 0, 'I': -3, 'L': -2, 'K': 2, 'M': -1, 'F': -3, 'P': -2, 'S': -1, 'T': -1, 'W': -3, 'Y': -2, 'V': -3},
            'N': {'A': -2, 'R': 0, 'N': 6, 'D': 1, 'C': -3, 'Q': 0, 'E': 0, 'G': 0, 'H': 1, 'I': -3, 'L': -3, 'K': 0, 'M': -2, 'F': -3, 'P': -2, 'S': 1, 'T': 0, 'W': -4, 'Y': -2, 'V': -3},
            'D': {'A': -2, 'R': -2, 'N': 1, 'D': 6, 'C': -3, 'Q': 0, 'E': 2, 'G': -1, 'H': -1, 'I': -3, 'L': -4, 'K': -1, 'M': -3, 'F': -3, 'P': -1, 'S': 0, 'T': -1, 'W': -4, 'Y': -3, 'V': -3},
            'C': {'A': 0, 'R': -3, 'N': -3, 'D': -3, 'C': 9, 'Q': -3, 'E': -4, 'G': -3, 'H': -3, 'I': -1, 'L': -1, 'K': -3, 'M': -1, 'F': -2, 'P': -3, 'S': -1, 'T': -1, 'W': -2, 'Y': -2, 'V': -1},
            'Q': {'A': -1, 'R': 1, 'N': 0, 'D': 0, 'C': -3, 'Q': 5, 'E': 2, 'G': -2, 'H': 0, 'I': -3, 'L': -2, 'K': 1, 'M': 0, 'F': -3, 'P': -1, 'S': 0, 'T': -1, 'W': -2, 'Y': -1, 'V': -2},
            'E': {'A': -1, 'R': 0, 'N': 0, 'D': 2, 'C': -4, 'Q': 2, 'E': 5, 'G': -2, 'H': 0, 'I': -3, 'L': -3, 'K': 1, 'M': -2, 'F': -3, 'P': -1, 'S': 0, 'T': -1, 'W': -3, 'Y': -2, 'V': -2},
            'G': {'A': 0, 'R': -2, 'N': 0, 'D': -1, 'C': -3, 'Q': -2, 'E': -2, 'G': 6, 'H': -2, 'I': -4, 'L': -4, 'K': -2, 'M': -3, 'F': -3, 'P': -2, 'S': 0, 'T': -2, 'W': -2, 'Y': -3, 'V': -3},
            'H': {'A': -2, 'R': 0, 'N': 1, 'D': -1, 'C': -3, 'Q': 0, 'E': 0, 'G': -2, 'H': 8, 'I': -3, 'L': -3, 'K': -1, 'M': -2, 'F': -1, 'P': -2, 'S': -1, 'T': -2, 'W': -2, 'Y': 2, 'V': -3},
            'I': {'A': -1, 'R': -3, 'N': -3, 'D': -3, 'C': -1, 'Q': -3, 'E': -3, 'G': -4, 'H': -3, 'I': 4, 'L': 2, 'K': -3, 'M': 1, 'F': 0, 'P': -3, 'S': -2, 'T': -1, 'W': -3, 'Y': -1, 'V': 3},
            'L': {'A': -1, 'R': -2, 'N': -3, 'D': -4, 'C': -1, 'Q': -2, 'E': -3, 'G': -4, 'H': -3, 'I': 2, 'L': 4, 'K': -2, 'M': 2, 'F': 0, 'P': -3, 'S': -2, 'T': -1, 'W': -2, 'Y': -1, 'V': 1},
            'K': {'A': -1, 'R': 2, 'N': 0, 'D': -1, 'C': -3, 'Q': 1, 'E': 1, 'G': -2, 'H': -1, 'I': -3, 'L': -2, 'K': 5, 'M': -1, 'F': -3, 'P': -1, 'S': 0, 'T': -1, 'W': -3, 'Y': -2, 'V': -2},
            'M': {'A': -1, 'R': -1, 'N': -2, 'D': -3, 'C': -1, 'Q': 0, 'E': -2, 'G': -3, 'H': -2, 'I': 1, 'L': 2, 'K': -1, 'M': 5, 'F': 0, 'P': -2, 'S': -1, 'T': -1, 'W': -1, 'Y': -1, 'V': 1},
            'F': {'A': -2, 'R': -3, 'N': -3, 'D': -3, 'C': -2, 'Q': -3, 'E': -3, 'G': -3, 'H': -1, 'I': 0, 'L': 0, 'K': -3, 'M': 0, 'F': 6, 'P': -4, 'S': -2, 'T': -2, 'W': 1, 'Y': 3, 'V': -1},
            'P': {'A': -1, 'R': -2, 'N': -2, 'D': -1, 'C': -3, 'Q': -1, 'E': -1, 'G': -2, 'H': -2, 'I': -3, 'L': -3, 'K': -1, 'M': -2, 'F': -4, 'P': 7, 'S': -1, 'T': -1, 'W': -4, 'Y': -3, 'V': -2},
            'S': {'A': 1, 'R': -1, 'N': 1, 'D': 0, 'C': -1, 'Q': 0, 'E': 0, 'G': 0, 'H': -1, 'I': -2, 'L': -2, 'K': 0, 'M': -1, 'F': -2, 'P': -1, 'S': 4, 'T': 1, 'W': -3, 'Y': -2, 'V': -2},
            'T': {'A': 0, 'R': -1, 'N': 0, 'D': -1, 'C': -1, 'Q': -1, 'E': -1, 'G': -2, 'H': -2, 'I': -1, 'L': -1, 'K': -1, 'M': -1, 'F': -2, 'P': -1, 'S': 1, 'T': 5, 'W': -2, 'Y': -2, 'V': 0},
            'W': {'A': -3, 'R': -3, 'N': -4, 'D': -4, 'C': -2, 'Q': -2, 'E': -3, 'G': -2, 'H': -2, 'I': -3, 'L': -2, 'K': -3, 'M': -1, 'F': 1, 'P': -4, 'S': -3, 'T': -2, 'W': 11, 'Y': 2, 'V': -3},
            'Y': {'A': -2, 'R': -2, 'N': -2, 'D': -3, 'C': -2, 'Q': -1, 'E': -2, 'G': -3, 'H': 2, 'I': -1, 'L': -1, 'K': -2, 'M': -1, 'F': 3, 'P': -3, 'S': -2, 'T': -2, 'W': 2, 'Y': 7, 'V': -1},
            'V': {'A': 0, 'R': -3, 'N': -3, 'D': -3, 'C': -1, 'Q': -2, 'E': -2, 'G': -3, 'H': -3, 'I': 3, 'L': 1, 'K': -2, 'M': 1, 'F': -1, 'P': -2, 'S': -2, 'T': 0, 'W': -3, 'Y': -1, 'V': 4}
        }
        
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

    def translate(self, sequence: str, frame: int = 0) -> str:
        seq = sequence.upper().replace('U', 'T')
        protein = []
        for i in range(frame, len(seq) - 2, 3):
            codon = seq[i:i+3]
            aa = self.codons.get(codon, 'X')
            protein.append(aa)
            if aa == '*':
                break
        return ''.join(protein)

    def predict_variants(self, reference_sequence: str, variant_sequence: Optional[str] = None) -> Dict:
        ref_protein = self.translate(reference_sequence)
        
        result = {
            'reference': {
                'sequence': reference_sequence,
                'protein': ref_protein,
                'length': len(reference_sequence),
                'protein_length': len(ref_protein)
            },
            'variants': [],
            'summary': {
                'total_variants': 0,
                'by_severity': {'high': 0, 'medium': 0, 'low': 0},
                'by_type': {},
                'average_impact': 0.0,
                'overall_risk': 'low'
            },
            'recommendations': []
        }
        
        if variant_sequence:
            variants = self._compare_sequences(reference_sequence, variant_sequence)
            result['variants'] = variants
            result['variant'] = {
                'sequence': variant_sequence,
                'protein': self.translate(variant_sequence)
            }
        else:
            variants = self._predict_potential_variants(reference_sequence)
            result['variants'] = variants
        
        result['summary']['total_variants'] = len(result['variants'])
        
        for variant in result['variants']:
            severity = variant.get('severity', 'low')
            result['summary']['by_severity'][severity] = result['summary']['by_severity'].get(severity, 0) + 1
            
            var_type = variant.get('type', 'unknown')
            result['summary']['by_type'][var_type] = result['summary']['by_type'].get(var_type, 0) + 1
        
        if result['variants']:
            avg_impact = sum(v.get('impact_score', 0) for v in result['variants']) / len(result['variants'])
            result['summary']['average_impact'] = round(avg_impact, 3)
            
            if result['summary']['by_severity'].get('high', 0) > 0:
                result['summary']['overall_risk'] = 'high'
            elif result['summary']['by_severity'].get('medium', 0) > 2:
                result['summary']['overall_risk'] = 'medium'
            else:
                result['summary']['overall_risk'] = 'low'
        
        result['recommendations'] = self._generate_recommendations(result)
        
        return result

    def _compare_sequences(self, ref_seq: str, var_seq: str) -> List[Dict]:
        variants = []
        
        ref = ref_seq.upper().replace('U', 'T')
        var = var_seq.upper().replace('U', 'T')
        
        min_len = min(len(ref), len(var))
        
        for i in range(min_len):
            if ref[i] != var[i]:
                variant = self._analyze_single_variant(ref, var, i)
                if variant:
                    variants.append(variant)
        
        if len(ref) != len(var):
            indel_variant = self._analyze_indel(ref, var)
            if indel_variant:
                variants.append(indel_variant)
        
        return variants

    def _predict_potential_variants(self, sequence: str) -> List[Dict]:
        variants = []
        seq = sequence.upper().replace('U', 'T')
        
        cpg_sites = self._find_cpg_sites(seq)
        for pos in cpg_sites:
            variant = self._predict_cpg_methylation_effect(seq, pos)
            if variant:
                variants.append(variant)
        
        poly_q_regions = self._find_polyglutamine_regions(seq)
        for region in poly_q_regions:
            variant = self._predict_polyq_expansion_effect(seq, region)
            if variant:
                variants.append(variant)
        
        splice_sites = self._find_potential_splice_sites(seq)
        for site in splice_sites:
            variant = self._predict_splice_site_effect(seq, site)
            if variant:
                variants.append(variant)
        
        coding_regions = self._identify_coding_regions(seq)
        for region in coding_regions:
            var = self._predict_coding_region_effects(seq, region)
            if var:
                variants.extend(var)
        
        variants.sort(key=lambda x: -x.get('impact_score', 0))
        
        return variants[:20]

    def _analyze_single_variant(self, ref_seq: str, var_seq: str, position: int) -> Optional[Dict]:
        ref_nt = ref_seq[position]
        var_nt = var_seq[position]
        
        codon_pos = position // 3 * 3
        ref_codon = ref_seq[codon_pos:codon_pos + 3] if codon_pos + 3 <= len(ref_seq) else ''
        var_codon = var_seq[codon_pos:codon_pos + 3] if codon_pos + 3 <= len(var_seq) else ''
        
        ref_aa = self.codons.get(ref_codon, 'X')
        var_aa = self.codons.get(var_codon, 'X')
        
        variant = {
            'position': position,
            'ref_nucleotide': ref_nt,
            'var_nucleotide': var_nt,
            'ref_amino_acid': ref_aa,
            'var_amino_acid': var_aa,
            'codon_position': codon_pos,
            'ref_codon': ref_codon,
            'var_codon': var_codon
        }
        
        if ref_aa == var_aa:
            variant['type'] = 'synonymous'
            variant['effect'] = self.mutation_effects['synonymous'].copy()
            variant['impact_score'] = self._calculate_synonymous_impact(ref_codon, var_codon)
            variant['severity'] = 'low'
        elif var_aa == '*' and ref_aa != '*':
            variant['type'] = 'nonsense'
            variant['effect'] = self.mutation_effects['nonsense'].copy()
            variant['impact_score'] = 0.95
            variant['severity'] = 'high'
        elif ref_aa == '*':
            variant['type'] = 'stop_loss'
            variant['effect'] = {'description': 'Loss of stop codon', 'severity': 'high'}
            variant['impact_score'] = 0.85
            variant['severity'] = 'high'
        else:
            variant['type'] = 'missense'
            variant['effect'] = self.mutation_effects['missense'].copy()
            variant['impact_score'] = self._calculate_missense_impact(ref_aa, var_aa)
            variant['severity'] = self._determine_severity(variant['impact_score'])
            
            variant['blosum62_score'] = self._get_blosum_score(ref_aa, var_aa)
            variant['conservation_type'] = self._determine_conservation_type(ref_aa, var_aa)
        
        variant['probability'] = self._calculate_probability(variant)
        variant['clinical_significance'] = self._predict_clinical_significance(variant)
        
        return variant

    def _analyze_indel(self, ref_seq: str, var_seq: str) -> Optional[Dict]:
        ref_len = len(ref_seq)
        var_len = len(var_seq)
        diff = abs(ref_len - var_len)
        
        if diff % 3 != 0:
            return {
                'type': 'frameshift',
                'position': min(ref_len, var_len),
                'indel_length': diff,
                'indel_type': 'insertion' if var_len > ref_len else 'deletion',
                'effect': self.mutation_effects['frameshift'].copy(),
                'impact_score': 0.95,
                'severity': 'high',
                'probability': 0.85,
                'clinical_significance': 'pathogenic'
            }
        else:
            return {
                'type': 'inframe_indel',
                'position': min(ref_len, var_len),
                'indel_length': diff,
                'indel_type': 'insertion' if var_len > ref_len else 'deletion',
                'effect': self.mutation_effects['inframe_indel'].copy(),
                'impact_score': 0.5,
                'severity': 'medium',
                'probability': 0.6,
                'clinical_significance': 'uncertain'
            }

    def _calculate_synonymous_impact(self, ref_codon: str, var_codon: str) -> float:
        codon_usage_bias = {
            'optimal': ['TTC', 'CTG', 'ATC', 'ACC', 'GCC', 'CCC', 'CGC', 'TGC'],
            'non_optimal': ['TTT', 'TTA', 'TTG', 'CTT', 'CTC', 'CTA', 'ATA']
        }
        
        ref_optimal = ref_codon in codon_usage_bias['optimal']
        var_optimal = var_codon in codon_usage_bias['optimal']
        
        if ref_optimal and not var_optimal:
            return 0.3
        elif not ref_optimal and var_optimal:
            return 0.05
        else:
            return 0.1

    def _calculate_missense_impact(self, ref_aa: str, var_aa: str) -> float:
        blosum_score = self._get_blosum_score(ref_aa, var_aa)
        
        normalized_score = (blosum_score + 4) / 15
        
        base_impact = 1 - normalized_score
        
        conservation = self._determine_conservation_type(ref_aa, var_aa)
        if conservation == 'conservative':
            base_impact *= 0.5
        elif conservation == 'semi_conservative':
            base_impact *= 0.75
        
        aa_properties = self._get_amino_acid_properties(ref_aa, var_aa)
        if aa_properties['charge_change']:
            base_impact *= 1.5
        if aa_properties['polarity_change']:
            base_impact *= 1.3
        if aa_properties['size_change']:
            base_impact *= 1.2
        
        return min(base_impact, 0.9)

    def _get_blosum_score(self, aa1: str, aa2: str) -> int:
        return self.blosum62.get(aa1, {}).get(aa2, -4)

    def _determine_conservation_type(self, ref_aa: str, var_aa: str) -> str:
        pair = ref_aa + var_aa
        
        for change_type, pairs in self.amino_acid_changes.items():
            if pair in pairs or pair[::-1] in pairs:
                return change_type
        
        return 'non_conservative'

    def _get_amino_acid_properties(self, aa1: str, aa2: str) -> Dict:
        properties = {
            'positive': ['K', 'R', 'H'],
            'negative': ['D', 'E'],
            'polar': ['S', 'T', 'N', 'Q', 'Y', 'C'],
            'hydrophobic': ['A', 'V', 'L', 'I', 'P', 'F', 'M', 'W'],
            'small': ['G', 'A', 'S'],
            'large': ['W', 'F', 'Y', 'R', 'K', 'H', 'E', 'Q']
        }
        
        result = {
            'charge_change': False,
            'polarity_change': False,
            'size_change': False
        }
        
        def get_charge(aa):
            if aa in properties['positive']:
                return 1
            elif aa in properties['negative']:
                return -1
            else:
                return 0
        
        if get_charge(aa1) != get_charge(aa2):
            result['charge_change'] = True
        
        def is_polar(aa):
            return aa in properties['polar'] or aa in properties['positive'] or aa in properties['negative']
        
        if is_polar(aa1) != is_polar(aa2):
            result['polarity_change'] = True
        
        def get_size_category(aa):
            if aa in properties['small']:
                return 'small'
            elif aa in properties['large']:
                return 'large'
            else:
                return 'medium'
        
        if get_size_category(aa1) != get_size_category(aa2):
            result['size_change'] = True
        
        return result

    def _determine_severity(self, impact_score: float) -> str:
        if impact_score >= 0.7:
            return 'high'
        elif impact_score >= 0.3:
            return 'medium'
        else:
            return 'low'

    def _calculate_probability(self, variant: Dict) -> float:
        base_prob = 0.5
        
        if variant['severity'] == 'high':
            base_prob = 0.8
        elif variant['severity'] == 'medium':
            base_prob = 0.5
        else:
            base_prob = 0.2
        
        blosum = variant.get('blosum62_score', 0)
        if blosum < 0:
            base_prob *= (1 + abs(blosum) * 0.1)
        
        return min(base_prob, 1.0)

    def _predict_clinical_significance(self, variant: Dict) -> str:
        severity = variant.get('severity', 'low')
        impact = variant.get('impact_score', 0)
        
        if severity == 'high' and impact > 0.8:
            return 'pathogenic'
        elif severity == 'high':
            return 'likely_pathogenic'
        elif severity == 'medium' and impact > 0.6:
            return 'uncertain'
        elif severity == 'medium':
            return 'likely_benign'
        else:
            return 'benign'

    def _find_cpg_sites(self, sequence: str) -> List[int]:
        sites = []
        for i in range(len(sequence) - 1):
            if sequence[i:i+2] == 'CG':
                sites.append(i)
        return sites

    def _predict_cpg_methylation_effect(self, sequence: str, position: int) -> Optional[Dict]:
        codon_pos = position // 3 * 3
        if codon_pos + 3 <= len(sequence):
            original_codon = sequence[codon_pos:codon_pos + 3]
            original_aa = self.codons.get(original_codon, 'X')
            
            mutated_seq = sequence[:position] + 'T' + sequence[position + 1:]
            mutated_codon = mutated_seq[codon_pos:codon_pos + 3]
            mutated_aa = self.codons.get(mutated_codon, 'X')
            
            if original_aa != mutated_aa:
                impact = self._calculate_missense_impact(original_aa, mutated_aa)
                
                return {
                    'type': 'cpg_methylation',
                    'position': position,
                    'ref_nucleotide': 'C',
                    'var_nucleotide': 'T',
                    'ref_amino_acid': original_aa,
                    'var_amino_acid': mutated_aa,
                    'effect': {
                        'description': 'C→T transition at CpG site (potential methylation effect)',
                        'severity': self._determine_severity(impact)
                    },
                    'impact_score': impact,
                    'severity': self._determine_severity(impact),
                    'probability': 0.4,
                    'clinical_significance': 'uncertain'
                }
        return None

    def _find_polyglutamine_regions(self, sequence: str) -> List[Dict]:
        protein = self.translate(sequence)
        regions = []
        
        i = 0
        while i < len(protein):
            if protein[i] == 'Q':
                count = 0
                start = i
                while i < len(protein) and protein[i] == 'Q':
                    count += 1
                    i += 1
                if count >= 4:
                    regions.append({
                        'start': start,
                        'end': i,
                        'count': count
                    })
            else:
                i += 1
        
        return regions

    def _predict_polyq_expansion_effect(self, sequence: str, region: Dict) -> Optional[Dict]:
        count = region['count']
        
        if count >= 35:
            severity = 'high'
            impact = 0.85
            risk = 'high_risk'
        elif count >= 25:
            severity = 'medium'
            impact = 0.6
            risk = 'moderate_risk'
        elif count >= 10:
            severity = 'low'
            impact = 0.3
            risk = 'low_risk'
        else:
            return None
        
        return {
            'type': 'polyq_expansion',
            'position': region['start'],
            'glutamine_count': count,
            'risk_category': risk,
            'effect': {
                'description': f'PolyQ tract of {count} glutamines - potential expansion disorder risk',
                'severity': severity
            },
            'impact_score': impact,
            'severity': severity,
            'probability': 0.3,
            'clinical_significance': 'uncertain'
        }

    def _find_potential_splice_sites(self, sequence: str) -> List[Dict]:
        sites = []
        
        for i in range(len(sequence) - 8):
            window = sequence[i:i+8]
            if window[:2] == 'GT':
                sites.append({'position': i, 'type': 'donor', 'sequence': window})
            if window[6:] == 'AG':
                sites.append({'position': i + 6, 'type': 'acceptor', 'sequence': window})
        
        return sites

    def _predict_splice_site_effect(self, sequence: str, site: Dict) -> Optional[Dict]:
        return {
            'type': 'splice_site_variant',
            'position': site['position'],
            'splice_type': site['type'],
            'context_sequence': site['sequence'],
            'effect': self.mutation_effects['splice_site'].copy(),
            'impact_score': 0.75,
            'severity': 'high',
            'probability': 0.2,
            'clinical_significance': 'likely_pathogenic'
        }

    def _identify_coding_regions(self, sequence: str) -> List[Dict]:
        regions = []
        
        for frame in range(3):
            i = frame
            while i < len(sequence) - 2:
                codon = sequence[i:i+3]
                if codon == 'ATG':
                    start = i
                    j = i
                    while j < len(sequence) - 2:
                        c = sequence[j:j+3]
                        if c in ['TAA', 'TAG', 'TGA']:
                            if j - start >= 30:
                                regions.append({
                                    'start': start,
                                    'end': j + 3,
                                    'frame': frame
                                })
                            break
                        j += 3
                    i = j
                i += 3
        
        return regions

    def _predict_coding_region_effects(self, sequence: str, region: Dict) -> List[Dict]:
        effects = []
        start = region['start']
        end = region['end']
        coding_seq = sequence[start:end]
        protein = self.translate(coding_seq)
        
        if len(protein) < 10:
            return effects
        
        if protein[0] != 'M':
            effects.append({
                'type': 'start_codon_variant',
                'position': start,
                'effect': {
                    'description': 'Alternative start codon detected',
                    'severity': 'medium'
                },
                'impact_score': 0.5,
                'severity': 'medium',
                'probability': 0.3,
                'clinical_significance': 'uncertain'
            })
        
        if protein[-1] != '*':
            effects.append({
                'type': 'stop_codon_missing',
                'position': end - 3,
                'effect': {
                    'description': 'No stop codon at end of predicted ORF',
                    'severity': 'medium'
                },
                'impact_score': 0.4,
                'severity': 'medium',
                'probability': 0.2,
                'clinical_significance': 'uncertain'
            })
        
        gc = (coding_seq.count('G') + coding_seq.count('C')) / len(coding_seq) * 100
        if gc < 35 or gc > 65:
            effects.append({
                'type': 'gc_content_extreme',
                'position': start,
                'gc_content': round(gc, 2),
                'effect': {
                    'description': f'Extreme GC content ({gc:.1f}%) - potential expression issue',
                    'severity': 'low'
                },
                'impact_score': 0.2,
                'severity': 'low',
                'probability': 0.25,
                'clinical_significance': 'benign'
            })
        
        return effects

    def _generate_recommendations(self, result: Dict) -> List[str]:
        recommendations = []
        summary = result['summary']
        
        if summary['overall_risk'] == 'high':
            recommendations.append('High risk variants detected. Consider consulting a genetic counselor.')
        
        high_count = summary['by_severity'].get('high', 0)
        if high_count > 0:
            recommendations.append(f'{high_count} high severity variants require further investigation.')
        
        frame_variants = [v for v in result['variants'] if v.get('type') in ['frameshift', 'nonsense']]
        if frame_variants:
            recommendations.append('Frameshift or nonsense mutations detected. These may cause truncated proteins.')
        
        cpg_variants = [v for v in result['variants'] if v.get('type') == 'cpg_methylation']
        if cpg_variants:
            recommendations.append('CpG methylation sites identified. Consider methylation analysis.')
        
        polyq = [v for v in result['variants'] if v.get('type') == 'polyq_expansion']
        if polyq:
            recommendations.append('PolyQ tract detected. May be associated with repeat expansion disorders.')
        
        if summary['by_type'].get('missense', 0) > 5:
            recommendations.append('Multiple missense variants. Consider functional validation.')
        
        if not recommendations:
            recommendations.append('No high-risk variants detected. Routine monitoring recommended.')
        
        return recommendations

    def analyze_sequence_stability(self, sequence: str) -> Dict:
        gc = (sequence.count('G') + sequence.count('C')) / len(sequence) * 100
        melting_temp = 4 * (sequence.count('G') + sequence.count('C')) + 2 * (sequence.count('A') + sequence.count('T'))
        
        repeats = self._find_repeat_stretches(sequence)
        
        return {
            'gc_content': round(gc, 2),
            'melting_temperature': melting_temp,
            'secondary_structure_risk': self._predict_secondary_structure_risk(sequence),
            'repeat_regions': repeats[:10],
            'stability_score': self._calculate_stability_score(gc, len(repeats), len(sequence))
        }

    def _find_repeat_stretches(self, sequence: str) -> List[Dict]:
        repeats = []
        for unit_len in range(1, 5):
            for i in range(len(sequence) - unit_len * 4 + 1):
                unit = sequence[i:i + unit_len]
                count = 1
                j = i + unit_len
                while j + unit_len <= len(sequence) and sequence[j:j + unit_len] == unit:
                    count += 1
                    j += unit_len
                
                if count >= 4:
                    repeats.append({
                        'unit': unit,
                        'start': i,
                        'end': j,
                        'count': count
                    })
        
        repeats.sort(key=lambda x: -x['count'])
        return repeats

    def _predict_secondary_structure_risk(self, sequence: str) -> str:
        gc = (sequence.count('G') + sequence.count('C')) / len(sequence) * 100
        
        if gc > 70:
            return 'high_risk'
        elif gc > 60:
            return 'medium_risk'
        else:
            return 'low_risk'

    def _calculate_stability_score(self, gc: float, repeat_count: int, length: int) -> float:
        score = 5.0
        
        if 40 <= gc <= 60:
            score += 2
        elif 35 <= gc <= 65:
            score += 1
        
        if repeat_count == 0:
            score += 2
        elif repeat_count < 3:
            score += 1
        else:
            score -= repeat_count * 0.5
        
        if 100 <= length <= 3000:
            score += 1
        
        return max(0, min(10, score))
