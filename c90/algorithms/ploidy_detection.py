import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from collections import defaultdict, Counter
from scipy import stats
from scipy.signal import find_peaks
import logging

logger = logging.getLogger(__name__)

class PloidyDetector:
    def __init__(self, 
                 ks_threshold_wgd: float = 0.5,
                 ks_window_size: int = 10,
                 min_ks_pairs: int = 20,
                 tandem_max_distance: int = 5):
        self.ks_threshold_wgd = ks_threshold_wgd
        self.ks_window_size = ks_window_size
        self.min_ks_pairs = min_ks_pairs
        self.tandem_max_distance = tandem_max_distance
        
    def detect(self, 
               syntenic_blocks: List[Dict], 
               genes1: pd.DataFrame,
               genes2: pd.DataFrame,
               blast_hits: pd.DataFrame) -> Dict:
        logger.info("Starting ploidy event detection...")
        
        ks_data = self._calculate_ks_values(syntenic_blocks, blast_hits, genes1, genes2)
        
        if len(ks_data) < self.min_ks_pairs:
            logger.warning(f"Not enough Ks pairs: {len(ks_data)} < {self.min_ks_pairs}")
            return {
                'wgd_events': [],
                'tandem_duplications': [],
                'ks_distribution': [],
                'hotspots': [],
                'wgd_detected': False
            }
        
        wgd_events = self._detect_wgd_events(ks_data)
        
        tandem_duplications = self._detect_tandem_duplications(genes1, genes2, blast_hits)
        
        hotspots = self._identify_duplication_hotspots(
            ks_data, genes1, genes2, wgd_events, tandem_duplications
        )
        
        ks_distribution = self._summarize_ks_distribution(ks_data)
        
        logger.info(f"Detected {len(wgd_events)} WGD events and {len(tandem_duplications)} tandem duplication clusters")
        
        return {
            'wgd_events': wgd_events,
            'tandem_duplications': tandem_duplications,
            'ks_distribution': ks_distribution,
            'hotspots': hotspots,
            'wgd_detected': len(wgd_events) > 0,
            'total_ks_pairs': len(ks_data)
        }
    
    def _calculate_ks_values(self, 
                             syntenic_blocks: List[Dict],
                             blast_hits: pd.DataFrame,
                             genes1: pd.DataFrame,
                             genes2: pd.DataFrame) -> List[Dict]:
        ks_data = []
        
        gene_pos_map1 = {row['gene_id']: (row['seqid'], row['start'], row['gene_index']) 
                        for _, row in genes1.iterrows()}
        gene_pos_map2 = {row['gene_id']: (row['seqid'], row['start'], row['gene_index']) 
                        for _, row in genes2.iterrows()}
        
        blast_lookup = {}
        for _, hit in blast_hits.iterrows():
            key = (hit['query_id'], hit['subject_id'])
            blast_lookup[key] = {
                'identity': hit['identity'],
                'bit_score': hit['bit_score'],
                'e_value': hit['e_value']
            }
        
        for block in syntenic_blocks:
            block_id = block.get('block_id', 'unknown')
            block_chr1 = block.get('chr1', 'unknown')
            block_chr2 = block.get('chr2', 'unknown')
            
            genes_in_block = block.get('genes', [])
            
            block_ks_values = []
            for gene_pair in genes_in_block:
                gene1_id = gene_pair.get('gene1')
                gene2_id = gene_pair.get('gene2')
                
                if not gene1_id or not gene2_id:
                    continue
                
                ks_value = self._estimate_ks_from_identity(
                    blast_lookup.get((gene1_id, gene2_id), {}).get('identity', 0)
                )
                
                pos1_info = gene_pos_map1.get(gene1_id, (block_chr1, 0, 0))
                pos2_info = gene_pos_map2.get(gene2_id, (block_chr2, 0, 0))
                
                ks_entry = {
                    'gene1': gene1_id,
                    'gene2': gene2_id,
                    'chr1': pos1_info[0],
                    'chr2': pos2_info[0],
                    'pos1': pos1_info[1],
                    'pos2': pos2_info[1],
                    'idx1': pos1_info[2],
                    'idx2': pos2_info[2],
                    'ks': ks_value,
                    'block_id': block_id,
                    'identity': blast_lookup.get((gene1_id, gene2_id), {}).get('identity', 0)
                }
                ks_data.append(ks_entry)
                block_ks_values.append(ks_value)
            
            if block_ks_values:
                block['mean_ks'] = np.mean(block_ks_values)
                block['median_ks'] = np.median(block_ks_values)
                block['std_ks'] = np.std(block_ks_values)
        
        return ks_data
    
    def _estimate_ks_from_identity(self, identity_percent: float) -> float:
        if identity_percent <= 0:
            return float('inf')
        
        p = identity_percent / 100.0
        
        if p >= 1.0:
            return 0.0
        
        ks = -np.log(p) * 1.5
        
        return max(0.0, min(5.0, ks))
    
    def _detect_wgd_events(self, ks_data: List[Dict]) -> List[Dict]:
        ks_values = np.array([k['ks'] for k in ks_data if k['ks'] < 5.0 and k['ks'] > 0])
        
        if len(ks_values) < self.min_ks_pairs:
            return []
        
        events = []
        
        hist, bin_edges = np.histogram(ks_values, bins=50, range=(0, 3))
        
        peaks, properties = find_peaks(hist, height=max(5, len(ks_values) // 20), distance=5)
        
        for peak_idx in peaks:
            peak_ks = (bin_edges[peak_idx] + bin_edges[peak_idx + 1]) / 2
            peak_height = properties['peak_heights'][peak_idx - peaks[0]]
            
            if peak_ks < 0.1:
                event_type = 'recent_small_scale'
                confidence = 'low'
            elif peak_ks < self.ks_threshold_wgd:
                event_type = 'segmental_duplication'
                confidence = 'medium'
            else:
                event_type = 'whole_genome_duplication'
                confidence = 'high'
            
            half_max = peak_height / 2
            left_idx = peak_idx
            while left_idx > 0 and hist[left_idx] > half_max:
                left_idx -= 1
            right_idx = peak_idx
            while right_idx < len(hist) - 1 and hist[right_idx] > half_max:
                right_idx += 1
            
            peak_width = bin_edges[right_idx] - bin_edges[left_idx]
            
            peak_genes = [k for k in ks_data 
                        if bin_edges[left_idx] <= k['ks'] <= bin_edges[right_idx]]
            
            events.append({
                'event_type': event_type,
                'peak_ks': round(peak_ks, 3),
                'peak_height': int(peak_height),
                'width_ks': round(peak_width, 3),
                'confidence': confidence,
                'gene_pairs_in_peak': len(peak_genes),
                'ks_range': [round(bin_edges[left_idx], 3), round(bin_edges[right_idx], 3)]
            })
        
        events.sort(key=lambda x: -x['peak_height'])
        
        return events
    
    def _detect_tandem_duplications(self, 
                                     genes1: pd.DataFrame,
                                     genes2: pd.DataFrame,
                                     blast_hits: pd.DataFrame) -> List[Dict]:
        tandem_clusters = []
        
        for species, genes in [('species1', genes1), ('species2', genes2)]:
            gene_list = genes.sort_values(['seqid', 'start']).reset_index(drop=True)
            
            for seqid, chr_genes in gene_list.groupby('seqid'):
                chr_gene_ids = chr_genes['gene_id'].tolist()
                gene_index_map = {g: i for i, g in enumerate(chr_gene_ids)}
                
                related_genes = defaultdict(set)
                
                for _, hit in blast_hits.iterrows():
                    qid, sid = hit['query_id'], hit['subject_id']
                    
                    if species == 'species1':
                        if qid in gene_index_map and sid in gene_index_map:
                            idx1 = gene_index_map[qid]
                            idx2 = gene_index_map[sid]
                            if abs(idx1 - idx2) <= self.tandem_max_distance and idx1 != idx2:
                                related_genes[qid].add(sid)
                                related_genes[sid].add(qid)
                    else:
                        if qid in gene_index_map and sid in gene_index_map:
                            idx1 = gene_index_map[qid]
                            idx2 = gene_index_map[sid]
                            if abs(idx1 - idx2) <= self.tandem_max_distance and idx1 != idx2:
                                related_genes[qid].add(sid)
                                related_genes[sid].add(qid)
                
                clusters = self._find_connected_components(related_genes)
                
                for i, cluster in enumerate(clusters):
                    if len(cluster) >= 2:
                        cluster_genes = chr_genes[chr_genes['gene_id'].isin(cluster)]
                        min_pos = cluster_genes['start'].min()
                        max_pos = cluster_genes['start'].max()
                        length = max_pos - min_pos
                        
                        tandem_clusters.append({
                            'cluster_id': f"tandem_{species}_{i}",
                            'species': species,
                            'chromosome': seqid,
                            'gene_count': len(cluster),
                            'genes': cluster,
                            'start': int(min_pos),
                            'end': int(max_pos),
                            'length_bp': int(length),
                            'density': len(cluster) / max(1, length) * 1000000
                        })
        
        tandem_clusters.sort(key=lambda x: -x['gene_count'])
        
        return tandem_clusters
    
    def _find_connected_components(self, graph: Dict[str, set]) -> List[List[str]]:
        visited = set()
        components = []
        
        def dfs(node, component):
            visited.add(node)
            component.append(node)
            for neighbor in graph.get(node, set()):
                if neighbor not in visited:
                    dfs(neighbor, component)
        
        for node in graph:
            if node not in visited:
                component = []
                dfs(node, component)
                components.append(component)
        
        return components
    
    def _identify_duplication_hotspots(self,
                                        ks_data: List[Dict],
                                        genes1: pd.DataFrame,
                                        genes2: pd.DataFrame,
                                        wgd_events: List[Dict],
                                        tandem_duplications: List[Dict]) -> List[Dict]:
        hotspots = []
        
        if len(ks_data) == 0:
            return hotspots
        
        for species, genes in [('species1', genes1), ('species2', genes2)]:
            chr_key = 'chr1' if species == 'species1' else 'chr2'
            pos_key = 'pos1' if species == 'species1' else 'pos2'
            
            for seqid in genes['seqid'].unique():
                chr_ks_data = [k for k in ks_data if k[chr_key] == seqid and 0 < k['ks'] < 3]
                
                if len(chr_ks_data) < 5:
                    continue
                
                positions = np.array([k[pos_key] for k in chr_ks_data])
                ks_values = np.array([k['ks'] for k in chr_ks_data])
                
                if len(positions) == 0:
                    continue
                
                pos_sorted_idx = np.argsort(positions)
                positions = positions[pos_sorted_idx]
                ks_values = ks_values[pos_sorted_idx]
                
                window_size = min(self.ks_window_size, len(positions) // 3)
                
                if window_size < 3:
                    continue
                
                low_ks_density = []
                for i in range(len(positions) - window_size + 1):
                    window_ks = ks_values[i:i + window_size]
                    low_ks_count = np.sum(window_ks < self.ks_threshold_wgd)
                    density = low_ks_count / window_size
                    
                    if density > 0.5:
                        low_ks_density.append({
                            'position': int(positions[i + window_size // 2]),
                            'density': density,
                            'window_size': window_size,
                            'low_ks_count': int(low_ks_count)
                        })
                
                if low_ks_density:
                    max_density = max(h['density'] for h in low_ks_density)
                    avg_position = np.mean([h['position'] for h in low_ks_density])
                    
                    hotspots.append({
                        'hotspot_id': f"hotspot_{species}_{seqid}",
                        'species': species,
                        'chromosome': seqid,
                        'peak_position': int(np.mean([h['position'] for h in low_ks_density])),
                        'max_density': round(max_density, 3),
                        'region_start': int(min(positions)),
                        'region_end': int(max(positions)),
                        'window_count': len(low_ks_density),
                        'associated_events': []
                    })
        
        for tandem in tandem_duplications:
            for hotspot in hotspots:
                if (hotspot['species'] == tandem['species'] and
                    hotspot['chromosome'] == tandem['chromosome'] and
                    hotspot['region_start'] <= tandem['end'] and
                    hotspot['region_end'] >= tandem['start']):
                    hotspot['associated_events'].append(tandem['cluster_id'])
        
        hotspots.sort(key=lambda x: -x['max_density'])
        
        return hotspots
    
    def _summarize_ks_distribution(self, ks_data: List[Dict]) -> Dict:
        ks_values = np.array([k['ks'] for k in ks_data if 0 < k['ks'] < 5])
        
        if len(ks_values) == 0:
            return {}
        
        return {
            'mean': round(float(np.mean(ks_values)), 3),
            'median': round(float(np.median(ks_values)), 3),
            'std': round(float(np.std(ks_values)), 3),
            'min': round(float(np.min(ks_values)), 3),
            'max': round(float(np.max(ks_values)), 3),
            'count': len(ks_values),
            'percentiles': {
                '25': round(float(np.percentile(ks_values, 25)), 3),
                '50': round(float(np.percentile(ks_values, 50)), 3),
                '75': round(float(np.percentile(ks_values, 75)), 3),
                '90': round(float(np.percentile(ks_values, 90)), 3)
            }
        }
