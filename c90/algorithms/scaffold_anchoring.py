import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Set
from collections import defaultdict, Counter
import logging
from sklearn.cluster import SpectralClustering, AgglomerativeClustering
from sklearn.preprocessing import normalize
import networkx as nx

logger = logging.getLogger(__name__)

class ScaffoldAnchoring:
    def __init__(self, 
                 min_shared_genes: int = 3,
                 clustering_method: str = 'agglomerative',
                 n_clusters: str = 'auto'):
        self.min_shared_genes = min_shared_genes
        self.clustering_method = clustering_method
        self.n_clusters = n_clusters
        
    def anchor(self, 
                genes1: pd.DataFrame, 
                genes2: pd.DataFrame, 
                blast_hits: pd.DataFrame) -> Dict:
        logger.info("Starting scaffold anchoring analysis...")
        
        gene_map1 = {row['gene_id']: row['seqid'] for _, row in genes1.iterrows()}
        gene_map2 = {row['gene_id']: row['seqid'] for _, row in genes2.iterrows()}
        
        scaffold_gene_counts1 = genes1.groupby('seqid').size().to_dict()
        scaffold_gene_counts2 = genes2.groupby('seqid').size().to_dict()
        
        logger.info(f"Species 1: {len(scaffold_gene_counts1)} scaffolds")
        logger.info(f"Species 2: {len(scaffold_gene_counts2)} scaffolds")
        
        shared_gene_matrix = self._build_shared_gene_matrix(
            blast_hits, gene_map1, gene_map2
        )
        
        if len(shared_gene_matrix) == 0:
            logger.warning("No shared genes found between scaffolds")
            return {
                'scaffold_mapping': [],
                'anchored_scaffolds_sp1': 0,
                'anchored_scaffolds_sp2': 0,
                'chromosome_groups': {}
            }
        
        similarity_matrix, scaffold_index_sp1, scaffold_index_sp2 = \
            self._build_similarity_matrix(shared_gene_matrix, scaffold_gene_counts1, scaffold_gene_counts2)
        
        chromosome_groups = self._cluster_scaffolds(
            similarity_matrix, scaffold_index_sp1, scaffold_index_sp2
        )
        
        mapping_table = self._generate_mapping_table(
            chromosome_groups, shared_gene_matrix, scaffold_gene_counts1, scaffold_gene_counts2
        )
        
        anchored_sp1 = len(set(m['scaffold_sp1'] for m in mapping_table if m['scaffold_sp1'] != 'Unanchored'))
        anchored_sp2 = len(set(m['scaffold_sp2'] for m in mapping_table if m['scaffold_sp2'] != 'Unanchored'))
        
        logger.info(f"Anchored scaffolds - Species 1: {anchored_sp1}, Species 2: {anchored_sp2}")
        logger.info(f"Generated {len(chromosome_groups)} chromosome groups")
        
        return {
            'scaffold_mapping': mapping_table,
            'anchored_scaffolds_sp1': anchored_sp1,
            'anchored_scaffolds_sp2': anchored_sp2,
            'chromosome_groups': chromosome_groups,
            'total_scaffolds_sp1': len(scaffold_gene_counts1),
            'total_scaffolds_sp2': len(scaffold_gene_counts2)
        }
    
    def _build_shared_gene_matrix(self, 
                                    blast_hits: pd.DataFrame, 
                                    gene_map1: Dict[str, str], 
                                    gene_map2: Dict[str, str]) -> Dict[Tuple[str, str], int]:
        shared_genes = defaultdict(set)
        
        for _, hit in blast_hits.iterrows():
            qid = hit['query_id']
            sid = hit['subject_id']
            
            if qid in gene_map1 and sid in gene_map2:
                scaffold1 = gene_map1[qid]
                scaffold2 = gene_map2[sid]
                shared_genes[(scaffold1, scaffold2)].add(qid)
        
        filtered_matrix = {}
        for (scaffold1, scaffold2), genes in shared_genes.items():
            if len(genes) >= self.min_shared_genes:
                filtered_matrix[(scaffold1, scaffold2)] = len(genes)
        
        logger.info(f"Found {len(filtered_matrix)} scaffold pairs with >= {self.min_shared_genes} shared genes")
        return filtered_matrix
    
    def _build_similarity_matrix(self, 
                                  shared_gene_matrix: Dict[Tuple[str, str], int],
                                  gene_counts1: Dict[str, int],
                                  gene_counts2: Dict[str, int]) -> Tuple[np.ndarray, Dict[str, int], Dict[str, int]]:
        scaffolds_sp1 = sorted(set(pair[0] for pair in shared_gene_matrix.keys()))
        scaffolds_sp2 = sorted(set(pair[1] for pair in shared_gene_matrix.keys()))
        
        all_scaffolds = scaffolds_sp1 + [f"SP2_{s}" for s in scaffolds_sp2]
        
        n = len(all_scaffolds)
        similarity_matrix = np.zeros((n, n))
        
        scaffold_index_sp1 = {s: i for i, s in enumerate(scaffolds_sp1)}
        scaffold_index_sp2 = {s: i + len(scaffolds_sp1) for i, s in enumerate(scaffolds_sp2)}
        
        for (scaffold1, scaffold2), count in shared_gene_matrix.items():
            if scaffold1 in scaffold_index_sp1 and scaffold2 in scaffold_index_sp2:
                i = scaffold_index_sp1[scaffold1]
                j = scaffold_index_sp2[scaffold2]
                
                max_possible = min(gene_counts1.get(scaffold1, 0), gene_counts2.get(scaffold2, 0))
                if max_possible > 0:
                    similarity = count / max_possible
                    similarity_matrix[i, j] = similarity
                    similarity_matrix[j, i] = similarity
        
        for i in range(n):
            for j in range(i + 1, n):
                if similarity_matrix[i, j] > 0:
                    for k in range(n):
                        if similarity_matrix[j, k] > 0 and similarity_matrix[i, k] == 0:
                            similarity_matrix[i, k] = min(similarity_matrix[i, j], similarity_matrix[j, k]) * 0.5
                            similarity_matrix[k, i] = similarity_matrix[i, k]
        
        np.fill_diagonal(similarity_matrix, 1.0)
        
        return similarity_matrix, scaffold_index_sp1, scaffold_index_sp2
    
    def _cluster_scaffolds(self, 
                            similarity_matrix: np.ndarray,
                            scaffold_index_sp1: Dict[str, int],
                            scaffold_index_sp2: Dict[str, int]) -> Dict[str, Dict]:
        n = similarity_matrix.shape[0]
        
        if n < 2:
            return {'Group_1': {
                'scaffolds_sp1': list(scaffold_index_sp1.keys()),
                'scaffolds_sp2': list(scaffold_index_sp2.keys()),
                'size': n
            }}
        
        if self.n_clusters == 'auto':
            n_clusters = self._estimate_n_clusters(similarity_matrix)
        else:
            n_clusters = int(self.n_clusters)
        
        n_clusters = max(1, min(n_clusters, n))
        
        logger.info(f"Clustering {n} scaffolds into {n_clusters} groups using {self.clustering_method}")
        
        if self.clustering_method == 'agglomerative':
            distance_matrix = 1 - similarity_matrix
            clustering = AgglomerativeClustering(
                n_clusters=n_clusters,
                affinity='precomputed',
                linkage='average'
            )
            labels = clustering.fit_predict(distance_matrix)
        elif self.clustering_method == 'spectral':
            clustering = SpectralClustering(
                n_clusters=n_clusters,
                affinity='precomputed',
                random_state=42
            )
            labels = clustering.fit_predict(similarity_matrix)
        elif self.clustering_method == 'graph':
            labels = self._graph_based_clustering(similarity_matrix, n_clusters)
        else:
            labels = np.zeros(n, dtype=int)
        
        groups = defaultdict(lambda: {'scaffolds_sp1': [], 'scaffolds_sp2': []})
        
        index_to_scaffold_sp1 = {v: k for k, v in scaffold_index_sp1.items()}
        index_to_scaffold_sp2 = {v: k for k, v in scaffold_index_sp2.items()}
        
        for i, label in enumerate(labels):
            group_name = f"Chromosome_Group_{label + 1}"
            if i in index_to_scaffold_sp1:
                groups[group_name]['scaffolds_sp1'].append(index_to_scaffold_sp1[i])
            else:
                sp2_index = i - len(scaffold_index_sp1)
                if sp2_index in index_to_scaffold_sp2:
                    groups[group_name]['scaffolds_sp2'].append(index_to_scaffold_sp2[sp2_index])
        
        for group in groups.values():
            group['size'] = len(group['scaffolds_sp1']) + len(group['scaffolds_sp2'])
        
        return dict(groups)
    
    def _estimate_n_clusters(self, similarity_matrix: np.ndarray) -> int:
        n = similarity_matrix.shape[0]
        
        G = nx.Graph()
        for i in range(n):
            for j in range(i + 1, n):
                if similarity_matrix[i, j] > 0.1:
                    G.add_edge(i, j, weight=similarity_matrix[i, j])
        
        n_components = nx.number_connected_components(G)
        
        if n_components > 1:
            return n_components
        
        eigenvalues = np.linalg.eigvalsh(similarity_matrix)
        eigenvalues = sorted(eigenvalues, reverse=True)
        
        gaps = np.diff(eigenvalues[:min(n, 20)])
        if len(gaps) > 0:
            max_gap_idx = np.argmax(gaps)
            return max(1, max_gap_idx + 1)
        
        return max(1, n // 5)
    
    def _graph_based_clustering(self, similarity_matrix: np.ndarray, n_clusters: int) -> np.ndarray:
        n = similarity_matrix.shape[0]
        G = nx.Graph()
        
        for i in range(n):
            for j in range(i + 1, n):
                if similarity_matrix[i, j] > 0:
                    G.add_edge(i, j, weight=similarity_matrix[i, j])
        
        if nx.number_connected_components(G) == n_clusters:
            components = list(nx.connected_components(G))
            labels = np.zeros(n, dtype=int)
            for label, comp in enumerate(components):
                for node in comp:
                    labels[node] = label
            return labels
        
        from networkx.algorithms.community import greedy_modularity_communities
        communities = greedy_modularity_communities(G, weight='weight')
        
        labels = np.zeros(n, dtype=int)
        for label, community in enumerate(communities):
            for node in community:
                labels[node] = label
        
        return labels
    
    def _generate_mapping_table(self,
                                  chromosome_groups: Dict,
                                  shared_gene_matrix: Dict[Tuple[str, str], int],
                                  gene_counts1: Dict[str, int],
                                  gene_counts2: Dict[str, int]) -> List[Dict]:
        mapping_table = []
        
        for group_name, group_data in chromosome_groups.items():
            scaffolds_sp1 = group_data['scaffolds_sp1']
            scaffolds_sp2 = group_data['scaffolds_sp2']
            
            if not scaffolds_sp1 or not scaffolds_sp2:
                continue
            
            pair_scores = {}
            for scaf1 in scaffolds_sp1:
                for scaf2 in scaffolds_sp2:
                    count = shared_gene_matrix.get((scaf1, scaf2), 0)
                    if count > 0:
                        total_genes = gene_counts1.get(scaf1, 0) + gene_counts2.get(scaf2, 0)
                        score = count / max(1, total_genes)
                        pair_scores[(scaf1, scaf2)] = score
            
            if not pair_scores:
                continue
            
            sorted_pairs = sorted(pair_scores.items(), key=lambda x: -x[1])
            
            used_sp1 = set()
            used_sp2 = set()
            
            for (scaf1, scaf2), score in sorted_pairs:
                if scaf1 not in used_sp1 and scaf2 not in used_sp2:
                    used_sp1.add(scaf1)
                    used_sp2.add(scaf2)
                    
                    shared_count = shared_gene_matrix.get((scaf1, scaf2), 0)
                    
                    mapping_table.append({
                        'chromosome_group': group_name,
                        'scaffold_sp1': scaf1,
                        'scaffold_sp2': scaf2,
                        'shared_genes': shared_count,
                        'genes_sp1': gene_counts1.get(scaf1, 0),
                        'genes_sp2': gene_counts2.get(scaf2, 0),
                        'mapping_score': round(score, 4),
                        'coverage_sp1': round(shared_count / max(1, gene_counts1.get(scaf1, 1)), 4),
                        'coverage_sp2': round(shared_count / max(1, gene_counts2.get(scaf2, 1)), 4)
                    })
            
            for scaf1 in scaffolds_sp1:
                if scaf1 not in used_sp1:
                    mapping_table.append({
                        'chromosome_group': group_name,
                        'scaffold_sp1': scaf1,
                        'scaffold_sp2': 'Unanchored',
                        'shared_genes': 0,
                        'genes_sp1': gene_counts1.get(scaf1, 0),
                        'genes_sp2': 0,
                        'mapping_score': 0,
                        'coverage_sp1': 0,
                        'coverage_sp2': 0
                    })
            
            for scaf2 in scaffolds_sp2:
                if scaf2 not in used_sp2:
                    mapping_table.append({
                        'chromosome_group': group_name,
                        'scaffold_sp1': 'Unanchored',
                        'scaffold_sp2': scaf2,
                        'shared_genes': 0,
                        'genes_sp1': 0,
                        'genes_sp2': gene_counts2.get(scaf2, 0),
                        'mapping_score': 0,
                        'coverage_sp1': 0,
                        'coverage_sp2': 0
                    })
        
        return sorted(mapping_table, key=lambda x: (x['chromosome_group'], -x['mapping_score']))
