import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Set
from collections import defaultdict, Counter
import networkx as nx
import logging

logger = logging.getLogger(__name__)

class AncestorKaryotypeReconstructor:
    def __init__(self):
        pass
    
    def reconstruct(self, syntenic_blocks: List[Dict], 
                    genes1: pd.DataFrame, 
                    genes2: pd.DataFrame) -> Dict:
        
        logger.info("Starting ancestral karyotype reconstruction...")
        
        adjacencies = self._extract_adjacencies(syntenic_blocks, genes1, genes2)
        
        logger.info(f"Extracted {len(adjacencies)} gene adjacencies")
        
        ancestral_contigs = self._build_ancestral_contigs(adjacencies, genes1, genes2)
        
        logger.info(f"Built {len(ancestral_contigs)} ancestral contigs")
        
        rearrangement_events = self._count_rearrangements(ancestral_contigs, genes1, genes2)
        
        return {
            'ancestral_contigs': ancestral_contigs,
            'num_contigs': len(ancestral_contigs),
            'estimated_breakpoints': rearrangement_events['breakpoints'],
            'estimated_fusions': rearrangement_events['fusions'],
            'estimated_fissions': rearrangement_events['fissions'],
            'gene_order': self._get_gene_order(ancestral_contigs)
        }
    
    def _extract_adjacencies(self, 
                             syntenic_blocks: List[Dict], 
                             genes1: pd.DataFrame, 
                             genes2: pd.DataFrame) -> List[Tuple]:
        
        gene_map1 = {row['gene_id']: idx for idx, row in genes1.iterrows()}
        gene_map2 = {row['gene_id']: idx for idx, row in genes2.iterrows()}
        
        adjacencies = []
        
        for block in syntenic_blocks:
            genes = block['genes']
            
            for i in range(len(genes) - 1):
                g1_current = genes[i]['gene1']
                g1_next = genes[i + 1]['gene1']
                
                g2_current = genes[i]['gene2']
                g2_next = genes[i + 1]['gene2']
                
                if g1_current in gene_map1 and g1_next in gene_map1:
                    adj1 = (g1_current, g1_next)
                    adjacencies.append((adj1, 'species1'))
                
                if g2_current in gene_map2 and g2_next in gene_map2:
                    adj2 = (g2_current, g2_next)
                    adjacencies.append((adj2, 'species2'))
        
        return adjacencies
    
    def _build_ancestral_contigs(self, 
                                  adjacencies: List[Tuple], 
                                  genes1: pd.DataFrame, 
                                  genes2: pd.DataFrame) -> List[Dict]:
        
        shared_adjacencies = defaultdict(int)
        for adj, species in adjacencies:
            shared_adjacencies[adj] += 1
        
        G = nx.Graph()
        
        all_genes = set(genes1['gene_id']) | set(genes2['gene_id'])
        G.add_nodes_from(all_genes)
        
        for adj, count in shared_adjacencies.items():
            if count >= 1:
                G.add_edge(adj[0], adj[1], weight=count)
        
        contigs = []
        contig_id = 0
        
        for component in nx.connected_components(G):
            if len(component) >= 3:
                subgraph = G.subgraph(component)
                
                try:
                    order = self._find_path(subgraph)
                except:
                    order = list(component)
                
                contigs.append({
                    'contig_id': f"ancestral_contig_{contig_id}",
                    'genes': order,
                    'size': len(order),
                    'support': self._calculate_contig_support(order, shared_adjacencies)
                })
                contig_id += 1
        
        return sorted(contigs, key=lambda x: -x['size'])
    
    def _find_path(self, graph: nx.Graph) -> List[str]:
        if len(graph) == 0:
            return []
        
        degrees = dict(graph.degree())
        start_nodes = [n for n, d in degrees.items() if d == 1]
        
        if len(start_nodes) == 0:
            start_nodes = list(graph.nodes())[:1]
        
        start = start_nodes[0]
        path = [start]
        visited = {start}
        
        current = start
        while True:
            neighbors = list(graph.neighbors(current))
            next_nodes = [n for n in neighbors if n not in visited]
            
            if not next_nodes:
                break
            
            next_node = max(next_nodes, key=lambda x: graph[current][x]['weight'])
            path.append(next_node)
            visited.add(next_node)
            current = next_node
        
        return path
    
    def _calculate_contig_support(self, 
                                   gene_order: List[str], 
                                   adjacencies: Dict) -> float:
        if len(gene_order) < 2:
            return 0.0
        
        supported = 0
        for i in range(len(gene_order) - 1):
            adj = (gene_order[i], gene_order[i + 1])
            adj_rev = (gene_order[i + 1], gene_order[i])
            
            if adj in adjacencies or adj_rev in adjacencies:
                supported += 1
        
        return supported / (len(gene_order) - 1)
    
    def _count_rearrangements(self, 
                               ancestral_contigs: List[Dict], 
                               genes1: pd.DataFrame, 
                               genes2: pd.DataFrame) -> Dict:
        
        ancestral_genes = set()
        for contig in ancestral_contigs:
            ancestral_genes.update(contig['genes'])
        
        breakpoints = 0
        fusions = max(0, len(ancestral_contigs) - 1)
        fissions = 0
        
        for species_genes, name in [(genes1, 'species1'), (genes2, 'species2')]:
            for chr_id, chr_genes in species_genes.groupby('seqid'):
                chr_gene_list = chr_genes['gene_id'].tolist()
                
                for i in range(len(chr_gene_list) - 1):
                    g1, g2 = chr_gene_list[i], chr_gene_list[i + 1]
                    
                    if g1 in ancestral_genes and g2 in ancestral_genes:
                        if not self._are_adjacent_in_ancestor(g1, g2, ancestral_contigs):
                            breakpoints += 1
        
        return {
            'breakpoints': breakpoints // 2,
            'fusions': fusions,
            'fissions': fissions
        }
    
    def _are_adjacent_in_ancestor(self, 
                                    g1: str, 
                                    g2: str, 
                                    contigs: List[Dict]) -> bool:
        for contig in contigs:
            genes = contig['genes']
            for i in range(len(genes) - 1):
                if (genes[i] == g1 and genes[i + 1] == g2) or \
                   (genes[i] == g2 and genes[i + 1] == g1):
                    return True
        return False
    
    def _get_gene_order(self, contigs: List[Dict]) -> Dict:
        order = {}
        for contig in contigs:
            for idx, gene in enumerate(contig['genes']):
                order[gene] = {
                    'contig': contig['contig_id'],
                    'position': idx
                }
        return order
