import random

def generate_gff3(filename, num_genes=100, num_chr=5):
    with open(filename, 'w') as f:
        f.write("##gff-version 3\n")
        
        gene_id = 1
        for chr_id in range(1, num_chr + 1):
            chr_name = f"chr{chr_id}"
            pos = 1000
            
            for i in range(num_genes // num_chr):
                length = random.randint(500, 2000)
                start = pos
                end = pos + length
                strand = '+' if random.random() > 0.5 else '-'
                
                f.write(f"{chr_name}\t.\tgene\t{start}\t{end}\t.\t{strand}\t.\tID=gene{gene_id};Name=GENE{gene_id}\n")
                
                pos = end + random.randint(100, 1000)
                gene_id += 1

def generate_blast(filename, num_pairs=200):
    with open(filename, 'w') as f:
        for i in range(num_pairs):
            query = f"gene{random.randint(1, 100)}"
            subject = f"gene{random.randint(1, 100)}"
            identity = random.uniform(30, 100)
            align_len = random.randint(50, 500)
            evalue = 10 ** random.uniform(-10, -1)
            bit_score = random.uniform(50, 500)
            
            f.write(f"{query}\t{subject}\t{identity:.1f}\t{align_len}\t{random.randint(0, 50)}\t")
            f.write(f"{random.randint(0, 10)}\t{random.randint(1, 100)}\t{random.randint(100, 500)}\t")
            f.write(f"{random.randint(1, 100)}\t{random.randint(100, 500)}\t{evalue:.2e}\t{bit_score:.1f}\n")

if __name__ == "__main__":
    import os
    os.makedirs('test_data', exist_ok=True)
    
    generate_gff3('test_data/species1.gff3', num_genes=80, num_chr=4)
    generate_gff3('test_data/species2.gff3', num_genes=80, num_chr=4)
    generate_blast('test_data/blast_results.txt', num_pairs=300)
    
    print("Test data generated successfully!")
