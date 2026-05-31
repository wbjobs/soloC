import pandas as pd
from typing import Dict, List
import io

class BlastParser:
    def __init__(self):
        self.hits = None
    
    def parse(self, file_content: str, format_type: str = 'blastp') -> Dict:
        lines = file_content.strip().split('\n')
        hits = []
        
        for line in lines:
            if line.startswith('#'):
                continue
            
            parts = line.split('\t')
            if len(parts) >= 12:
                hits.append({
                    'query_id': parts[0],
                    'subject_id': parts[1],
                    'identity': float(parts[2]),
                    'alignment_length': int(parts[3]),
                    'mismatches': int(parts[4]),
                    'gap_opens': int(parts[5]),
                    'q_start': int(parts[6]),
                    'q_end': int(parts[7]),
                    's_start': int(parts[8]),
                    's_end': int(parts[9]),
                    'e_value': float(parts[10]),
                    'bit_score': float(parts[11])
                })
        
        self.hits = pd.DataFrame(hits)
        
        return {
            'total_hits': len(self.hits),
            'unique_queries': self.hits['query_id'].nunique() if not self.hits.empty else 0,
            'unique_subjects': self.hits['subject_id'].nunique() if not self.hits.empty else 0,
            'hits': self.hits.to_dict('records') if not self.hits.empty else []
        }
    
    def get_reciprocal_best_hits(self) -> pd.DataFrame:
        if self.hits is None or self.hits.empty:
            return pd.DataFrame()
        
        best_hits = self.hits.loc[self.hits.groupby('query_id')['bit_score'].idxmax()]
        reciprocal_best = best_hits.loc[best_hits.groupby('subject_id')['bit_score'].idxmax()]
        
        return reciprocal_best.reset_index(drop=True)
    
    def filter_hits(self, min_identity: float = 30.0, max_evalue: float = 1e-5) -> pd.DataFrame:
        if self.hits is None or self.hits.empty:
            return pd.DataFrame()
        
        filtered = self.hits[
            (self.hits['identity'] >= min_identity) & 
            (self.hits['e_value'] <= max_evalue)
        ]
        
        return filtered.reset_index(drop=True)
