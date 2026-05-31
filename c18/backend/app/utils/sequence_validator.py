import re
from typing import Tuple

NUCLEOTIDE_BASES = set('ATCGatcgNnUu')
PROTEIN_AMINO_ACIDS = set('ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwyXx*')

def is_nucleotide_sequence(sequence: str) -> bool:
    if not sequence or len(sequence.strip()) == 0:
        return False
    
    seq = sequence.strip().upper()
    
    nucleotide_content = sum(1 for char in seq if char in NUCLEOTIDE_BASES)
    nucleotide_percentage = nucleotide_content / len(seq)
    
    if nucleotide_percentage < 0.8:
        return False
    
    gc_content = (seq.count('G') + seq.count('C')) / len(seq)
    if gc_content < 0.2 or gc_content > 0.8:
        return True
    
    return nucleotide_percentage > 0.9

def is_protein_sequence(sequence: str) -> bool:
    if not sequence or len(sequence.strip()) == 0:
        return False
    
    seq = sequence.strip().upper()
    
    for char in seq:
        if char not in PROTEIN_AMINO_ACIDS and char not in ' -':
            return False
    
    protein_content = sum(1 for char in seq if char in 'ACDEFGHIKLMNPQRSTVWY')
    return protein_content / len(seq) > 0.5

def validate_sequence(sequence: str, program: str) -> Tuple[bool, str]:
    if not sequence or len(sequence.strip()) == 0:
        return False, "Sequence is empty"
    
    seq = sequence.strip()
    
    if len(seq) < 10:
        return False, f"Sequence too short. Minimum 10 characters required, got {len(seq)}"
    
    if len(seq) > 100000:
        return False, f"Sequence too long. Maximum 100,000 characters allowed"
    
    nucleotide_programs = {'blastn', 'tblastx'}
    protein_programs = {'blastp'}
    translated_programs = {'blastx', 'tblastn'}
    
    if program in nucleotide_programs:
        if not is_nucleotide_sequence(seq):
            return False, f"Program '{program}' requires nucleotide sequence"
    
    elif program in protein_programs:
        if not is_protein_sequence(seq):
            return False, f"Program '{program}' requires protein sequence"
    
    elif program in translated_programs:
        if not is_nucleotide_sequence(seq) and not is_protein_sequence(seq):
            return False, f"Program '{program}' requires valid nucleotide or protein sequence"
    
    return True, "Valid"

def sanitize_sequence(sequence: str) -> str:
    if not sequence:
        return ""
    
    seq = sequence.strip().upper()
    
    seq = re.sub(r'[^A-Za-z]', '', seq)
    
    return seq

def get_sequence_type(sequence: str) -> str:
    if is_nucleotide_sequence(sequence):
        return 'nucleotide'
    elif is_protein_sequence(sequence):
        return 'protein'
    else:
        return 'unknown'

def calculate_gc_content(sequence: str) -> float:
    seq = sequence.upper()
    gc = seq.count('G') + seq.count('C')
    total = len(seq)
    
    if total == 0:
        return 0.0
    
    return gc / total * 100

def detect_program_from_sequence(sequence: str) -> str:
    seq_type = get_sequence_type(sequence)
    
    if seq_type == 'nucleotide':
        return 'blastn'
    elif seq_type == 'protein':
        return 'blastp'
    else:
        return 'blastn'
