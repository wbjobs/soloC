#!/usr/bin/env python3
import random
import os

def generate_scaffold_gff(filename, num_scaffolds=20, genes_per_scaffold=15):
    """Generate GFF with many scaffolds for testing"""
    with open(filename, 'w') as f:
        f.write("##gff-version 3\n")
        
        gene_id = 1
        for scaffold_id in range(1, num_scaffolds + 1):
            scaffold_name = f"Scaffold_{scaffold_id:03d}"
            pos = 1000
            
            for i in range(genes_per_scaffold):
                length = random.randint(500, 2000)
                start = pos
                end = pos + length
                strand = '+' if random.random() > 0.5 else '-'
                
                f.write(f"{scaffold_name}\t.\tgene\t{start}\t{end}\t.\t{strand}\t.\tID=gene{gene_id};Name=GENE{gene_id}\n")
                
                pos = end + random.randint(100, 1000)
                gene_id += 1

def generate_chromosome_gff(filename, num_chromosomes=5, genes_per_chromosome=60):
    """Generate GFF with proper chromosomes"""
    with open(filename, 'w') as f:
        f.write("##gff-version 3\n")
        
        gene_id = 1
        for chr_id in range(1, num_chromosomes + 1):
            chr_name = f"chr{chr_id}"
            pos = 1000
            
            for i in range(genes_per_chromosome):
                length = random.randint(500, 2000)
                start = pos
                end = pos + length
                strand = '+' if random.random() > 0.5 else '-'
                
                f.write(f"{chr_name}\t.\tgene\t{start}\t{end}\t.\t{strand}\t.\tID=gene{gene_id};Name=GENE{gene_id}\n")
                
                pos = end + random.randint(100, 1000)
                gene_id += 1

def generate_syntenic_blast(filename, num_pairs=500):
    """Generate BLAST with syntenic relationships"""
    pairs = []
    
    for i in range(num_pairs):
        chr1 = random.randint(1, 5)
        chr2 = random.randint(1, 5)
        
        gene1_start = (chr1 - 1) * 60 + 1
        gene2_start = (chr2 - 1) * 60 + 1
        
        offset = random.randint(0, 50)
        gene1 = gene1_start + offset
        gene2 = gene2_start + offset
        
        if random.random() < 0.8:
            gene2 = gene2 + random.randint(-5, 5)
        
        if 1 <= gene1 <= 300 and 1 <= gene2 <= 300:
            pairs.append((gene1, gene2))
    
    with open(filename, 'w') as f:
        for (query, subject) in pairs:
            identity = random.uniform(60, 95)
            align_len = random.randint(100, 500)
            evalue = 10 ** random.uniform(-20, -5)
            bit_score = random.uniform(100, 500)
            
            f.write(f"gene{query}\tgene{subject}\t{identity:.1f}\t{align_len}\t{random.randint(0, 50)}\t")
            f.write(f"{random.randint(0, 10)}\t{random.randint(1, 100)}\t{random.randint(100, 500)}\t")
            f.write(f"{random.randint(1, 100)}\t{random.randint(100, 500)}\t{evalue:.2e}\t{bit_score:.1f}\n")

if __name__ == "__main__":
    os.makedirs('test_data', exist_ok=True)
    
    generate_scaffold_gff('test_data/scaffold_species.gff3', num_scaffolds=25, genes_per_scaffold=12)
    print("Generated scaffold-based GFF: test_data/scaffold_species.gff3")
    
    generate_chromosome_gff('test_data/chromosome_species.gff3', num_chromosomes=5, genes_per_chromosome=60)
    print("Generated chromosome-based GFF: test_data/chromosome_species.gff3")
    
    generate_syntenic_blast('test_data/scaffold_blast.txt', num_pairs=600)
    print("Generated BLAST results: test_data/scaffold_blast.txt")
    
    print("\nTest data ready for scaffold anchoring!")
