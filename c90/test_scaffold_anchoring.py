#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parsers import GFF3Parser, BlastParser
from algorithms import MCScan, ScaffoldAnchoring, AncestorKaryotypeReconstructor

def test_scaffold_anchoring():
    print("=" * 60)
    print("Testing Scaffold Anchoring Pipeline")
    print("=" * 60)
    
    test_data_dir = 'test_data'
    if not os.path.exists(test_data_dir):
        print(f"Creating test data directory...")
        os.makedirs(test_data_dir)
    
    print("\n1. Generating test data with scaffolds...")
    from test_data.generate_scaffold_test_data import (
        generate_scaffold_gff,
        generate_chromosome_gff,
        generate_syntenic_blast
    )
    
    generate_scaffold_gff('test_data/scaffold_species.gff3', num_scaffolds=20, genes_per_scaffold=15)
    generate_chromosome_gff('test_data/chromosome_species.gff3', num_chromosomes=5, genes_per_chromosome=60)
    generate_syntenic_blast('test_data/scaffold_blast.txt', num_pairs=500)
    print("   ✓ Test data generated")
    
    print("\n2. Parsing GFF files...")
    gff_parser1 = GFF3Parser()
    gff_parser2 = GFF3Parser()
    
    with open('test_data/scaffold_species.gff3', 'r') as f:
        result1 = gff_parser1.parse(f.read())
    
    with open('test_data/chromosome_species.gff3', 'r') as f:
        result2 = gff_parser2.parse(f.read())
    
    genes1 = gff_parser1.get_gene_positions()
    genes2 = gff_parser2.get_gene_positions()
    
    print(f"   Species 1 (scaffolds): {len(genes1)} genes, {genes1['seqid'].nunique()} scaffolds")
    print(f"   Species 2 (chromosomes): {len(genes2)} genes, {genes2['seqid'].nunique()} chromosomes")
    
    print("\n3. Parsing BLAST results...")
    blast_parser = BlastParser()
    with open('test_data/scaffold_blast.txt', 'r') as f:
        blast_result = blast_parser.parse(f.read())
    blast_hits = blast_parser.hits
    print(f"   Parsed {len(blast_hits)} BLAST hits")
    
    print("\n4. Running Scaffold Anchoring...")
    anchor = ScaffoldAnchoring(min_shared_genes=3)
    anchoring_result = anchor.anchor(genes1, genes2, blast_hits)
    
    print(f"\n   Anchoring Results:")
    print(f"   - Total scaffolds Sp1: {anchoring_result['total_scaffolds_sp1']}")
    print(f"   - Total scaffolds Sp2: {anchoring_result['total_scaffolds_sp2']}")
    print(f"   - Anchored scaffolds Sp1: {anchoring_result['anchored_scaffolds_sp1']}")
    print(f"   - Anchored scaffolds Sp2: {anchoring_result['anchored_scaffolds_sp2']}")
    print(f"   - Chromosome groups: {anchoring_result['chromosome_groups']}")
    
    print(f"\n5. Scaffold Mapping (first 10):")
    for mapping in anchoring_result['scaffold_mapping'][:10]:
        print(f"   {mapping['chromosome_group']}: {mapping['scaffold_sp1']} <-> {mapping['scaffold_sp2']} "
              f"({mapping['shared_genes']} shared genes, score: {mapping['mapping_score']:.3f})")
    
    print("\n6. Running MCScan with scaffold anchoring...")
    mcscan = MCScan(
        min_block_size=3,
        e_value_cutoff=1e-5,
        enable_scaffold_anchoring=True
    )
    synteny_result = mcscan.run(genes1, genes2, blast_hits)
    
    print(f"   - Found {len(synteny_result['syntenic_blocks'])} syntenic blocks")
    print(f"   - {synteny_result['total_pairs']} syntenic gene pairs")
    
    if 'scaffold_mapping' in synteny_result:
        print(f"   - Scaffold mapping available ({len(synteny_result['scaffold_mapping'])} entries)")
    
    print("\n7. Ancestral Karyotype Reconstruction...")
    ancestor = AncestorKaryotypeReconstructor()
    ancestor_result = ancestor.reconstruct(
        synteny_result['syntenic_blocks'],
        genes1, genes2
    )
    
    print(f"   - {ancestor_result['num_contigs']} ancestral contigs")
    print(f"   - {ancestor_result['estimated_breakpoints']} estimated breakpoints")
    
    print("\n" + "=" * 60)
    print("✓ All tests passed successfully!")
    print("=" * 60)
    
    return True

if __name__ == "__main__":
    try:
        test_scaffold_anchoring()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
