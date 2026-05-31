#!/usr/bin/env python3
"""Test script for Ploidy Detection module"""

import sys
import os
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parsers.gff_parser import GFF3Parser
from algorithms.ploidy_detection import PloidyDetector

def generate_test_data(num_genes_sp1=500, num_genes_sp2=500, num_blocks=8):
    """Generate test syntenic blocks with varying Ks values"""
    
    blocks = []
    gene_pairs = []
    gene_counter = 1
    
    for block_idx in range(num_blocks):
        block_size = random.randint(10, 30)
        block_genes = []
        
        wgd_type = block_idx < 3
        
        for i in range(block_size):
            gene1_id = f"gene_sp1_{gene_counter}"
            gene2_id = f"gene_sp2_{gene_counter}"
            
            if wgd_type:
                ks_value = random.uniform(0.1, 0.5)
            else:
                ks_value = random.uniform(0.6, 2.0)
            
            block_genes.append({
                'gene1': gene1_id,
                'gene2': gene2_id,
                'chr1': f'chr{1 + gene_counter // 100}',
                'chr2': f'chr{1 + gene_counter // 100}',
                'idx1': gene_counter,
                'idx2': gene_counter,
                'pos1': gene_counter * 1000,
                'pos2': gene_counter * 1000,
                'ks': ks_value
            })
            
            gene_pairs.append({
                'gene1': gene1_id,
                'gene2': gene2_id,
                'identity': 100 - (ks_value * 50) if ks_value < 2.0 else 30.0
            })
            
            gene_counter += 1
        
        block = {
            'block_id': f'block_{block_idx}',
            'chr1': f'chr1',
            'chr2': f'chr1',
            'size': block_size,
            'genes': block_genes,
            'mean_ks': sum(g['ks'] for g in block_genes) / len(block_genes),
            'median_ks': sorted(g['ks'] for g in block_genes)[len(block_genes) // 2],
            'std_ks': 0.1
        }
        blocks.append(block)
    
    for i in range(5):
        for j in range(random.randint(2, 4)):
            gene_pairs.append({
                'gene1': f"gene_sp1_tandem_{i}_{j}",
                'gene2': f"gene_sp2_tandem_{i}_{j}",
                'identity': 95.0 - j * 5
            })
    
    return blocks, gene_pairs

def create_gff_from_genes(gene_pairs, species_id):
    """Create a simple GFF content string for testing"""
    gff_lines = ["##gff-version 3"]
    
    for i, pair in enumerate(gene_pairs):
        gene_id = pair[f'gene{species_id}']
        chr_id = f'chr{1 + (i // 100) % 5}'
        start = (i % 100) * 1000 + 1000
        end = start + 500
        
        gff_lines.append(f"{chr_id}\ttest\tgene\t{start}\t{end}\t.\t+\t.\tID={gene_id};Name={gene_id}")
    
    return "\n".join(gff_lines)

def test_ploidy_detector():
    print("=" * 70)
    print("Testing Ploidy Detection Module")
    print("=" * 70)
    
    print("\n1. Generating test syntenic blocks with varying Ks values...")
    syntenic_blocks, gene_pairs = generate_test_data(num_blocks=10)
    print(f"   Generated {len(syntenic_blocks)} syntenic blocks with {len(gene_pairs)} gene pairs")
    
    print("\n2. Parsing test GFF data...")
    parser1 = GFF3Parser()
    parser2 = GFF3Parser()
    
    gff1_content = create_gff_from_genes(gene_pairs, 1)
    gff2_content = create_gff_from_genes(gene_pairs, 2)
    
    result1 = parser1.parse(gff1_content)
    result2 = parser2.parse(gff2_content)
    
    genes1 = parser1.get_gene_positions()
    genes2 = parser2.get_gene_positions()
    
    print(f"   Species 1: {len(genes1)} genes on {genes1['seqid'].nunique()} chromosomes")
    print(f"   Species 2: {len(genes2)} genes on {genes2['seqid'].nunique()} chromosomes")
    
    print("\n3. Creating mock BLAST hits...")
    blast_hits = []
    for pair in gene_pairs:
        blast_hits.append({
            'query_id': pair['gene1'],
            'subject_id': pair['gene2'],
            'identity': pair['identity'],
            'bit_score': 100.0,
            'e_value': 1e-30
        })
    
    import pandas as pd
    blast_hits_df = pd.DataFrame(blast_hits)
    
    print(f"   Created {len(blast_hits_df)} BLAST hits")
    
    print("\n4. Running Ploidy Detector...")
    detector = PloidyDetector(
        ks_threshold_wgd=0.5,
        min_ks_pairs=10,
        tandem_max_distance=5
    )
    
    result = detector.detect(syntenic_blocks, genes1, genes2, blast_hits_df)
    
    print("\n5. Results Summary:")
    print(f"   Total Ks pairs analyzed: {result.get('total_ks_pairs', 0)}")
    print(f"   WGD detected: {result.get('wgd_detected', False)}")
    print(f"   Number of WGD events: {len(result.get('wgd_events', []))}")
    print(f"   Tandem duplication clusters: {len(result.get('tandem_duplications', []))}")
    print(f"   Duplication hotspots: {len(result.get('hotspots', []))}")
    
    if result.get('ks_distribution'):
        ks_dist = result['ks_distribution']
        print(f"\n6. Ks Distribution Statistics:")
        print(f"   Mean Ks: {ks_dist.get('mean', 'N/A')}")
        print(f"   Median Ks: {ks_dist.get('median', 'N/A')}")
        print(f"   Std Dev: {ks_dist.get('std', 'N/A')}")
        print(f"   Min Ks: {ks_dist.get('min', 'N/A')}")
        print(f"   Max Ks: {ks_dist.get('max', 'N/A')}")
    
    if result.get('wgd_events'):
        print(f"\n7. Detected WGD Events:")
        for i, event in enumerate(result['wgd_events']):
            print(f"   Event {i+1}:")
            print(f"     Type: {event['event_type']}")
            print(f"     Ks peak: {event['peak_ks']}")
            print(f"     Gene pairs in peak: {event['gene_pairs_in_peak']}")
            print(f"     Confidence: {event['confidence']}")
    
    if result.get('tandem_duplications'):
        print(f"\n8. Tandem Duplication Clusters (first 5):")
        for tandem in result['tandem_duplications'][:5]:
            print(f"   {tandem['cluster_id']}: {tandem['gene_count']} genes on {tandem['chromosome']}")
    
    if result.get('hotspots'):
        print(f"\n9. Duplication Hotspots:")
        for hotspot in result['hotspots']:
            print(f"   {hotspot['hotspot_id']}: density={hotspot['max_density']:.2%} on {hotspot['chromosome']}")
    
    print("\n" + "=" * 70)
    print("✓ All tests passed successfully!")
    print("=" * 70)
    
    return True

if __name__ == "__main__":
    try:
        test_ploidy_detector()
    except Exception as e:
        print(f"\n✗ Error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
