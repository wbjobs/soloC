import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MCScan:
    def __init__(self, 
                 match_score: int = 50,
                 gap_penalty: int = -1,
                 max_gaps: int = 25,
                 min_block_size: int = 5,
                 e_value_cutoff: float = 1e-10,
                 enable_scaffold_anchoring: bool = True,
                 min_shared_genes_for_anchoring: int = 3):
        self.match_score = match_score
        self.gap_penalty = gap_penalty
        self.max_gaps = max_gaps
        self.min_block_size = min_block_size
        self.e_value_cutoff = e_value_cutoff
        self.enable_scaffold_anchoring = enable_scaffold_anchoring
        self.min_shared_genes_for_anchoring = min_shared_genes_for_anchoring
        
    def run(self, 
            genes1: pd.DataFrame, 
            genes2: pd.DataFrame, 
            blast_hits: pd.DataFrame) -> Dict:
        
        logger.info("Starting MCScan analysis...")
        
        gene_pos1 = self._index_genes(genes1)
        gene_pos2 = self._index_genes(genes2)
        
        filtered_hits = blast_hits[blast_hits['e_value'] <= self.e_value_cutoff].copy()
        
        logger.info(f"Processing {len(filtered_hits)} filtered BLAST hits")
        
        anchor_pairs = self._get_anchor_pairs(filtered_hits, gene_pos1, gene_pos2)
        
        if len(anchor_pairs) == 0:
            logger.warning("No anchor pairs found!")
            return {
                'syntenic_blocks': [], 
                'total_pairs': 0,
                'gene_pairs': [],
                'scaffold_mapping': [],
                'anchoring_stats': {}
            }
        
        scaff_anchoring = None
        mapping_table = []
        anchoring_stats = {}
        
        if self.enable_scaffold_anchoring:
            try:
                from .scaffold_anchoring import ScaffoldAnchoring
                scaff_anchoring = ScaffoldAnchoring(
                    min_shared_genes=self.min_shared_genes_for_anchoring
                )
                anchoring_result = scaff_anchoring.anchor(genes1, genes2, filtered_hits)
                mapping_table = anchoring_result['scaffold_mapping']
                anchoring_stats = {
                    'anchored_scaffolds_sp1': anchoring_result['anchored_scaffolds_sp1'],
                    'anchored_scaffolds_sp2': anchoring_result['anchored_scaffolds_sp2'],
                    'total_scaffolds_sp1': anchoring_result['total_scaffolds_sp1'],
                    'total_scaffolds_sp2': anchoring_result['total_scaffolds_sp2'],
                    'chromosome_groups': len(anchoring_result['chromosome_groups'])
                }
                
                anchor_pairs = self._remap_scaffolds_to_groups(
                    anchor_pairs, anchoring_result['chromosome_groups']
                )
                logger.info(f"Scaffold anchoring completed: {len(mapping_table)} mappings")
                
            except Exception as e:
                logger.warning(f"Scaffold anchoring failed: {e}, proceeding without anchoring")
                import traceback
                logger.debug(traceback.format_exc())
        
        syntenic_blocks = self._find_syntenic_blocks_robust(anchor_pairs, genes1, genes2)
        
        logger.info(f"Found {len(syntenic_blocks)} syntenic blocks")
        
        return {
            'syntenic_blocks': syntenic_blocks,
            'total_pairs': len(anchor_pairs),
            'gene_pairs': anchor_pairs.to_dict('records'),
            'scaffold_mapping': mapping_table,
            'anchoring_stats': anchoring_stats
        }
    
    def _remap_scaffolds_to_groups(self, 
                                     anchor_pairs: pd.DataFrame, 
                                     chromosome_groups: Dict) -> pd.DataFrame:
        if not chromosome_groups:
            return anchor_pairs
        
        scaffold_to_group_sp1 = {}
        scaffold_to_group_sp2 = {}
        
        for group_name, group_data in chromosome_groups.items():
            for scaf in group_data['scaffolds_sp1']:
                scaffold_to_group_sp1[scaf] = group_name
            for scaf in group_data['scaffolds_sp2']:
                scaffold_to_group_sp2[scaf] = group_name
        
        if scaffold_to_group_sp1 and scaffold_to_group_sp2:
            anchor_pairs = anchor_pairs.copy()
            anchor_pairs['original_chr1'] = anchor_pairs['chr1']
            anchor_pairs['original_chr2'] = anchor_pairs['chr2']
            anchor_pairs['chr1'] = anchor_pairs['chr1'].map(
                lambda x: scaffold_to_group_sp1.get(x, x)
            )
            anchor_pairs['chr2'] = anchor_pairs['chr2'].map(
                lambda x: scaffold_to_group_sp2.get(x, x)
            )
            
            logger.info(f"Remapped scaffolds to {len(chromosome_groups)} chromosome groups")
        
        return anchor_pairs
    
    def _index_genes(self, genes: pd.DataFrame) -> Dict[str, Dict]:
        gene_index = {}
        for _, row in genes.iterrows():
            gene_index[row['gene_id']] = {
                'seqid': row['seqid'],
                'index': row['gene_index'],
                'start': row['start'],
                'end': row['end'],
                'strand': row['strand']
            }
        return gene_index
    
    def _get_anchor_pairs(self, 
                          blast_hits: pd.DataFrame, 
                          gene_pos1: Dict, 
                          gene_pos2: Dict) -> pd.DataFrame:
        
        pairs = []
        seen = set()
        
        for _, hit in blast_hits.iterrows():
            qid = hit['query_id']
            sid = hit['subject_id']
            
            if qid in gene_pos1 and sid in gene_pos2:
                pair_key = tuple(sorted([qid, sid]))
                if pair_key not in seen:
                    seen.add(pair_key)
                    g1 = gene_pos1[qid]
                    g2 = gene_pos2[sid]
                    
                    pairs.append({
                        'gene1': qid,
                        'gene2': sid,
                        'chr1': g1['seqid'],
                        'chr2': g2['seqid'],
                        'idx1': g1['index'],
                        'idx2': g2['index'],
                        'pos1': g1['start'],
                        'pos2': g2['start'],
                        'strand1': g1['strand'],
                        'strand2': g2['strand'],
                        'identity': hit['identity'],
                        'e_value': hit['e_value']
                    })
        
        return pd.DataFrame(pairs)
    
    def _find_syntenic_blocks_robust(self, 
                                       pairs: pd.DataFrame, 
                                       genes1: pd.DataFrame, 
                                       genes2: pd.DataFrame) -> List[Dict]:
        blocks = []
        block_id = 0
        
        try:
            chr_pairs = list(pairs.groupby(['chr1', 'chr2']))
        except Exception as e:
            logger.warning(f"Grouping by chromosome pairs failed: {e}. Falling back to global analysis.")
            chr_pairs = [(('global', 'global'), pairs)]
        
        for (chr1, chr2), group in chr_pairs:
            try:
                logger.info(f"Processing chromosome pair: {chr1} - {chr2} ({len(group)} pairs)")
                
                sorted_pairs = group.sort_values(['idx1', 'idx2']).reset_index(drop=True)
                
                if len(sorted_pairs) < self.min_block_size:
                    logger.debug(f"Not enough pairs for {chr1}-{chr2}: {len(sorted_pairs)} < {self.min_block_size}")
                    continue
                
                chr_blocks = self._dynamic_programming_chaining_robust(sorted_pairs, chr1, chr2)
                
                for block in chr_blocks:
                    if len(block['genes']) >= self.min_block_size:
                        block['block_id'] = f"block_{block_id}"
                        block['chr1'] = chr1
                        block['chr2'] = chr2
                        
                        try:
                            start_idx1 = min(g['idx1'] for g in block['genes'])
                            end_idx1 = max(g['idx1'] for g in block['genes'])
                            start_idx2 = min(g['idx2'] for g in block['genes'])
                            end_idx2 = max(g['idx2'] for g in block['genes'])
                            
                            block['size'] = len(block['genes'])
                            block['start_idx1'] = int(start_idx1)
                            block['end_idx1'] = int(end_idx1)
                            block['start_idx2'] = int(start_idx2)
                            block['end_idx2'] = int(end_idx2)
                            
                            if 'original_chr1' in sorted_pairs.columns:
                                orig_chr1 = sorted_pairs.iloc[0]['original_chr1']
                                orig_chr2 = sorted_pairs.iloc[0]['original_chr2']
                                block['original_chr1'] = str(orig_chr1)
                                block['original_chr2'] = str(orig_chr2)
                        except Exception as e:
                            logger.warning(f"Error calculating block indices: {e}")
                            continue
                        
                        blocks.append(block)
                        block_id += 1
                        
            except Exception as e:
                logger.error(f"Error processing chromosome pair {chr1}-{chr2}: {e}")
                import traceback
                logger.debug(traceback.format_exc())
                continue
        
        if len(blocks) == 0 and len(pairs) >= self.min_block_size:
            logger.warning("No blocks found per-chromosome, trying global analysis...")
            try:
                global_blocks = self._dynamic_programming_chaining_robust(pairs, 'global', 'global')
                for block in global_blocks:
                    if len(block['genes']) >= self.min_block_size:
                        block['block_id'] = f"block_{block_id}"
                        block['chr1'] = 'global'
                        block['chr2'] = 'global'
                        block['size'] = len(block['genes'])
                        blocks.append(block)
                        block_id += 1
            except Exception as e:
                logger.error(f"Global analysis also failed: {e}")
        
        return blocks
    
    def _find_syntenic_blocks(self, 
                              pairs: pd.DataFrame, 
                              genes1: pd.DataFrame, 
                              genes2: pd.DataFrame) -> List[Dict]:
        return self._find_syntenic_blocks_robust(pairs, genes1, genes2)
    
    def _dynamic_programming_chaining_robust(self, 
                                               pairs: pd.DataFrame, 
                                               chr1: str, 
                                               chr2: str) -> List[Dict]:
        n = len(pairs)
        if n == 0:
            return []
        
        try:
            dp = np.ones(n, dtype=int)
            prev = -np.ones(n, dtype=int)
            
            pairs_np = pairs[['idx1', 'idx2']].values.astype(float)
            
            for i in range(n):
                for j in range(i):
                    try:
                        if np.isfinite(pairs_np[i, 0]) and np.isfinite(pairs_np[j, 0]) and \
                           np.isfinite(pairs_np[i, 1]) and np.isfinite(pairs_np[j, 1]):
                            
                            if (pairs_np[i, 0] > pairs_np[j, 0] and 
                                pairs_np[i, 1] > pairs_np[j, 1]):
                                
                                gap1 = pairs_np[i, 0] - pairs_np[j, 0]
                                gap2 = pairs_np[i, 1] - pairs_np[j, 1]
                                
                                if gap1 <= self.max_gaps and gap2 <= self.max_gaps:
                                    if dp[j] + 1 > dp[i]:
                                        dp[i] = dp[j] + 1
                                        prev[i] = j
                    except Exception:
                        continue
            
            blocks = []
            used = np.zeros(n, dtype=bool)
            
            max_iterations = n
            iteration = 0
            
            while iteration < max_iterations:
                try:
                    scores = dp * (~used)
                    max_idx = np.argmax(scores)
                    
                    if dp[max_idx] < self.min_block_size or used[max_idx]:
                        break
                    
                    chain = []
                    current = max_idx
                    chain_length = 0
                    
                    while current != -1 and not used[current] and chain_length < n:
                        used[current] = True
                        try:
                            row = pairs.iloc[current]
                            chain.append({
                                'gene1': str(row.get('gene1', f'gene_{current}')),
                                'gene2': str(row.get('gene2', f'gene_{current}')),
                                'idx1': int(row.get('idx1', current)),
                                'idx2': int(row.get('idx2', current)),
                                'pos1': int(row.get('pos1', current * 1000)),
                                'pos2': int(row.get('pos2', current * 1000))
                            })
                        except Exception:
                            chain.append({
                                'gene1': f'gene_{current}',
                                'gene2': f'gene_{current}',
                                'idx1': current,
                                'idx2': current,
                                'pos1': current * 1000,
                                'pos2': current * 1000
                            })
                        current = prev[current]
                        chain_length += 1
                    
                    if chain:
                        chain.reverse()
                        blocks.append({'genes': chain, 'score': int(dp[max_idx])})
                
                except Exception as e:
                    logger.debug(f"Error in block extraction: {e}")
                    break
                
                iteration += 1
            
            return blocks
            
        except Exception as e:
            logger.error(f"Dynamic programming chaining failed: {e}")
            logger.debug("Falling back to simple greedy approach...")
            return self._greedy_chaining(pairs)
    
    def _greedy_chaining(self, pairs: pd.DataFrame) -> List[Dict]:
        if len(pairs) < self.min_block_size:
            return []
        
        try:
            sorted_pairs = pairs.sort_values(['idx1', 'idx2']).reset_index(drop=True)
            blocks = []
            current_chain = []
            
            for i in range(len(sorted_pairs)):
                if not current_chain:
                    current_chain.append({
                        'gene1': str(sorted_pairs.iloc[i]['gene1']),
                        'gene2': str(sorted_pairs.iloc[i]['gene2']),
                        'idx1': int(sorted_pairs.iloc[i]['idx1']),
                        'idx2': int(sorted_pairs.iloc[i]['idx2']),
                        'pos1': int(sorted_pairs.iloc[i]['pos1']),
                        'pos2': int(sorted_pairs.iloc[i]['pos2'])
                    })
                else:
                    last = current_chain[-1]
                    gap1 = sorted_pairs.iloc[i]['idx1'] - last['idx1']
                    gap2 = sorted_pairs.iloc[i]['idx2'] - last['idx2']
                    
                    if 0 < gap1 <= self.max_gaps and 0 < gap2 <= self.max_gaps:
                        current_chain.append({
                            'gene1': str(sorted_pairs.iloc[i]['gene1']),
                            'gene2': str(sorted_pairs.iloc[i]['gene2']),
                            'idx1': int(sorted_pairs.iloc[i]['idx1']),
                            'idx2': int(sorted_pairs.iloc[i]['idx2']),
                            'pos1': int(sorted_pairs.iloc[i]['pos1']),
                            'pos2': int(sorted_pairs.iloc[i]['pos2'])
                        })
                    else:
                        if len(current_chain) >= self.min_block_size:
                            blocks.append({'genes': current_chain, 'score': len(current_chain)})
                        current_chain = [{
                            'gene1': str(sorted_pairs.iloc[i]['gene1']),
                            'gene2': str(sorted_pairs.iloc[i]['gene2']),
                            'idx1': int(sorted_pairs.iloc[i]['idx1']),
                            'idx2': int(sorted_pairs.iloc[i]['idx2']),
                            'pos1': int(sorted_pairs.iloc[i]['pos1']),
                            'pos2': int(sorted_pairs.iloc[i]['pos2'])
                        }]
            
            if len(current_chain) >= self.min_block_size:
                blocks.append({'genes': current_chain, 'score': len(current_chain)})
            
            return blocks
            
        except Exception as e:
            logger.error(f"Greedy chaining also failed: {e}")
            return []
    
    def _dynamic_programming_chaining(self, 
                                       pairs: pd.DataFrame, 
                                       chr1: str, 
                                       chr2: str) -> List[Dict]:
        return self._dynamic_programming_chaining_robust(pairs, chr1, chr2)
