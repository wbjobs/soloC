import pandas as pd
from typing import Dict, List, Tuple
import re

class GFF3Parser:
    def __init__(self):
        self.genes = []
        self.chromosomes = {}
    
    def parse(self, file_content: str) -> Dict:
        lines = file_content.strip().split('\n')
        genes = []
        
        for line in lines:
            if line.startswith('#'):
                continue
            
            parts = line.split('\t')
            if len(parts) < 9:
                continue
            
            seqid = parts[0]
            source = parts[1]
            feature_type = parts[2]
            start = int(parts[3])
            end = int(parts[4])
            score = parts[5]
            strand = parts[6]
            phase = parts[7]
            attributes = parts[8]
            
            if feature_type.lower() == 'gene':
                gene_id = self._extract_attribute(attributes, 'ID')
                gene_name = self._extract_attribute(attributes, 'Name') or self._extract_attribute(attributes, 'gene')
                
                genes.append({
                    'seqid': seqid,
                    'source': source,
                    'start': start,
                    'end': end,
                    'strand': strand,
                    'gene_id': gene_id,
                    'gene_name': gene_name,
                    'length': end - start + 1,
                    'midpoint': (start + end) / 2
                })
                
                if seqid not in self.chromosomes:
                    self.chromosomes[seqid] = {'start': float('inf'), 'end': 0}
                self.chromosomes[seqid]['start'] = min(self.chromosomes[seqid]['start'], start)
                self.chromosomes[seqid]['end'] = max(self.chromosomes[seqid]['end'], end)
        
        self.genes = pd.DataFrame(genes)
        
        if not self.genes.empty:
            self.genes = self.genes.sort_values(['seqid', 'start']).reset_index(drop=True)
            self.genes['gene_index'] = self.genes.groupby('seqid').cumcount()
        
        return {
            'genes': self.genes.to_dict('records') if not self.genes.empty else [],
            'chromosomes': {k: {'length': v['end'] - v['start'] + 1, 
                               'gene_count': len(self.genes[self.genes['seqid'] == k])}
                          for k, v in self.chromosomes.items()},
            'total_genes': len(self.genes)
        }
    
    def _extract_attribute(self, attributes: str, key: str) -> str:
        pattern = rf'{key}=([^;]+)'
        match = re.search(pattern, attributes)
        if match:
            return match.group(1).strip()
        return None
    
    def get_gene_positions(self) -> pd.DataFrame:
        return self.genes
    
    def get_chromosome_lengths(self) -> Dict[str, int]:
        return {k: v['end'] - v['start'] + 1 for k, v in self.chromosomes.items()}
