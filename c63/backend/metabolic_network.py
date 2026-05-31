import networkx as nx
import cobra
from cobra.test import create_test_model
import json
import gc
import threading
from typing import List, Dict, Tuple, Set, Optional
import signal


class TimeoutException(Exception):
    pass


class MetabolicNetwork:
    def __init__(self):
        self.G = nx.DiGraph()
        self.model = create_test_model("textbook")
        self.metabolites: Dict[str, Dict] = {}
        self.reactions: Dict[str, Dict] = {}
        self.genes: Dict[str, Dict] = {}
        self.flux_distribution: Dict[str, float] = {}
        self._load_network()
        self._ensure_non_negative_weights()
    
    def _load_network(self):
        for met in self.model.metabolites:
            met_id = met.id
            self.metabolites[met_id] = {
                'id': met_id,
                'name': met.name,
                'formula': met.formula,
                'compartment': met.compartment,
                'type': 'metabolite',
            }
            self.G.add_node(met_id, **self.metabolites[met_id])
        
        for rxn in self.model.reactions:
            rxn_id = rxn.id
            self.reactions[rxn_id] = {
                'id': rxn_id,
                'name': rxn.name,
                'reaction': rxn.reaction,
                'lower_bound': rxn.lower_bound,
                'upper_bound': rxn.upper_bound,
                'type': 'reaction',
            }
            self.G.add_node(rxn_id, **self.reactions[rxn_id])
            
            for met, coeff in rxn.metabolites.items():
                met_id = met.id
                weight = abs(float(coeff)) if coeff != 0 else 1.0
                if coeff < 0:
                    self.G.add_edge(met_id, rxn_id, stoichiometry=coeff, type='substrate', weight=weight)
                else:
                    self.G.add_edge(rxn_id, met_id, stoichiometry=coeff, type='product', weight=weight)
        
        for gene in self.model.genes:
            gene_id = gene.id
            self.genes[gene_id] = {
                'id': gene_id,
                'name': gene.name,
                'type': 'gene',
            }
            self.G.add_node(gene_id, **self.genes[gene_id])
            
            for rxn in gene.reactions:
                self.G.add_edge(gene_id, rxn.id, type='catalyzes', weight=1.0)
    
    def _ensure_non_negative_weights(self):
        for u, v, data in self.G.edges(data=True):
            if 'weight' not in data or data['weight'] < 0:
                data['weight'] = 1.0
        
        negative_cycles = []
        try:
            for cycle in nx.simple_cycles(self.G):
                if len(cycle) > 1:
                    cycle_weight = sum(
                        self.G[cycle[i]][cycle[(i+1)%len(cycle)]].get('weight', 1.0)
                        for i in range(len(cycle))
                    )
                    if cycle_weight < 0:
                        negative_cycles.append(cycle)
        except:
            pass
        
        for cycle in negative_cycles:
            for i in range(len(cycle)):
                u, v = cycle[i], cycle[(i+1)%len(cycle)]
                if self.G.has_edge(u, v):
                    self.G[u][v]['weight'] = abs(self.G[u][v].get('weight', 1.0))
    
    def _force_gc_cleanup(self):
        gc.collect()
        gc.collect()
    
    def get_all_nodes(self) -> List[Dict]:
        self._force_gc_cleanup()
        nodes = []
        for node_id, data in self.G.nodes(data=True):
            node_data = dict(data)
            if node_id in self.flux_distribution:
                node_data['flux'] = self.flux_distribution[node_id]
            nodes.append(node_data)
        return nodes
    
    def get_all_edges(self) -> List[Dict]:
        self._force_gc_cleanup()
        edges = []
        for u, v, data in self.G.edges(data=True):
            edges.append({
                'source': u,
                'target': v,
                'type': data.get('type', 'unknown'),
            })
        return edges
    
    def _find_path_with_timeout(self, source: str, target: str, timeout: float = 5.0) -> List[str]:
        result = [None]
        error = [None]
        
        def worker():
            try:
                result[0] = nx.shortest_path(self.G, source=source, target=target, weight='weight', method='dijkstra')
            except nx.NetworkXNoPath:
                error[0] = 'no_path'
            except nx.NetworkXError as e:
                if 'negative' in str(e).lower():
                    error[0] = 'negative_cycle'
                else:
                    error[0] = str(e)
            except Exception as e:
                error[0] = str(e)
        
        thread = threading.Thread(target=worker)
        thread.daemon = True
        thread.start()
        thread.join(timeout=timeout)
        
        if thread.is_alive():
            raise TimeoutException("Path finding timed out")
        
        if error[0] == 'no_path':
            raise nx.NetworkXNoPath("No path found")
        elif error[0] == 'negative_cycle':
            try:
                result[0] = nx.shortest_path(self.G, source=source, target=target, weight=None)
            except:
                raise
        elif error[0] is not None:
            raise Exception(error[0])
        
        return result[0]
    
    def find_shortest_path(self, source: str, target: str) -> Dict:
        try:
            path = self._find_path_with_timeout(source, target, timeout=5.0)
            path_details = []
            
            for i in range(len(path) - 1):
                node1 = path[i]
                node2 = path[i + 1]
                edge_data = self.G.get_edge_data(node1, node2)
                
                node1_data = self.G.nodes[node1]
                node2_data = self.G.nodes[node2]
                
                path_details.append({
                    'from': {
                        'id': node1,
                        'name': node1_data.get('name', node1),
                        'type': node1_data.get('type', 'unknown'),
                    },
                    'to': {
                        'id': node2,
                        'name': node2_data.get('name', node2),
                        'type': node2_data.get('type', 'unknown'),
                    },
                    'edge_type': edge_data.get('type', 'unknown') if edge_data else 'unknown',
                })
            
            reactions_in_path = []
            for node in path:
                if node in self.reactions:
                    reactions_in_path.append({
                        'id': node,
                        'name': self.reactions[node]['name'],
                        'equation': self.reactions[node]['reaction'],
                    })
            
            self._force_gc_cleanup()
            
            return {
                'success': True,
                'path': path,
                'path_details': path_details,
                'reactions': reactions_in_path,
                'path_length': len(path) - 1,
            }
        except nx.NetworkXNoPath:
            self._force_gc_cleanup()
            return {
                'success': False,
                'error': f'No path found between {source} and {target}',
            }
        except TimeoutException as e:
            self._force_gc_cleanup()
            return {
                'success': False,
                'error': f'Path finding timed out: {str(e)}',
            }
        except Exception as e:
            self._force_gc_cleanup()
            return {
                'success': False,
                'error': str(e),
            }
    
    def get_metabolite_list(self) -> List[Dict]:
        self._force_gc_cleanup()
        return [
            {
                'id': met_id,
                'name': data['name'],
                'formula': data['formula'],
            }
            for met_id, data in self.metabolites.items()
        ]
    
    def get_gene_list(self) -> List[Dict]:
        self._force_gc_cleanup()
        return [
            {
                'id': gene_id,
                'name': data['name'],
            }
            for gene_id, data in self.genes.items()
        ]
    
    def get_network_stats(self) -> Dict:
        self._force_gc_cleanup()
        return {
            'num_metabolites': len(self.metabolites),
            'num_reactions': len(self.reactions),
            'num_genes': len(self.genes),
            'num_edges': self.G.number_of_edges(),
            'num_nodes': self.G.number_of_nodes(),
        }
    
    def run_fba(self, knockout_genes: List[str] = None) -> Dict:
        try:
            knockout_genes = knockout_genes or []
            
            with self.model:
                for gene_id in knockout_genes:
                    if gene_id in self.model.genes:
                        gene = self.model.genes.get_by_id(gene_id)
                        gene.knock_out()
                
                solution = self.model.optimize()
                
                if solution.status == 'optimal':
                    flux_dict = {}
                    for rxn_id, flux in solution.fluxes.items():
                        flux_dict[rxn_id] = abs(float(flux))
                    
                    met_flux = {}
                    for rxn_id, rxn in self.model.reactions.items():
                        rxn_flux = abs(float(solution.fluxes[rxn_id]))
                        for met in rxn.metabolites:
                            met_id = met.id
                            if met_id not in met_flux:
                                met_flux[met_id] = 0.0
                            met_flux[met_id] += rxn_flux
                    
                    for met_id, flux in met_flux.items():
                        flux_dict[met_id] = flux
                    
                    self.flux_distribution = flux_dict
                    
                    affected_reactions = []
                    for gene_id in knockout_genes:
                        if gene_id in self.model.genes:
                            gene = self.model.genes.get_by_id(gene_id)
                            for rxn in gene.reactions:
                                affected_reactions.append({
                                    'id': rxn.id,
                                    'name': rxn.name,
                                    'flux': solution.fluxes[rxn.id],
                                })
                    
                    self._force_gc_cleanup()
                    
                    return {
                        'success': True,
                        'status': solution.status,
                        'objective_value': float(solution.objective_value),
                        'flux_distribution': flux_dict,
                        'knocked_out_genes': knockout_genes,
                        'affected_reactions': affected_reactions,
                    }
                else:
                    self._force_gc_cleanup()
                    return {
                        'success': False,
                        'status': solution.status,
                        'error': 'FBA did not find an optimal solution',
                    }
        except Exception as e:
            self._force_gc_cleanup()
            return {
                'success': False,
                'error': str(e),
            }
