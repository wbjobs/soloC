from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import io
import base64
from typing import Dict
import logging

from parsers import GFF3Parser, BlastParser
from algorithms import MCScan, AncestorKaryotypeReconstructor
from visualization import DotPlotGenerator, CircosPlotGenerator, AncestorPlotGenerator
from exporters import PDFExporter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Synteny Analysis API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Synteny Analysis API",
        "endpoints": {
            "/analyze": "POST - Upload GFF files and BLAST results for synteny analysis",
            "/docs": "API documentation"
        }
    }

@app.post("/analyze")
async def analyze_synteny(
    gff1: UploadFile = File(...),
    gff2: UploadFile = File(...),
    blast: UploadFile = File(...)
):
    try:
        logger.info("Starting synteny analysis...")
        
        gff1_content = (await gff1.read()).decode('utf-8')
        gff2_content = (await gff2.read()).decode('utf-8')
        blast_content = (await blast.read()).decode('utf-8')
        
        logger.info("Parsing GFF files...")
        gff_parser1 = GFF3Parser()
        gff_parser2 = GFF3Parser()
        
        result1 = gff_parser1.parse(gff1_content)
        result2 = gff_parser2.parse(gff2_content)
        
        genes1 = gff_parser1.get_gene_positions()
        genes2 = gff_parser2.get_gene_positions()
        
        chr_lengths1 = gff_parser1.get_chromosome_lengths()
        chr_lengths2 = gff_parser2.get_chromosome_lengths()
        
        if len(genes1) == 0 or len(genes2) == 0:
            raise HTTPException(status_code=400, detail="No genes found in GFF files")
        
        logger.info(f"Found {len(genes1)} genes in species 1, {len(genes2)} genes in species 2")
        
        logger.info("Parsing BLAST results...")
        blast_parser = BlastParser()
        blast_result = blast_parser.parse(blast_content)
        
        blast_hits = blast_parser.hits
        
        if blast_hits is None or len(blast_hits) == 0:
            raise HTTPException(status_code=400, detail="No valid BLAST hits found")
        
        logger.info(f"Found {len(blast_hits)} BLAST hits")
        
        logger.info("Running MCScan algorithm...")
        mcscan = MCScan(min_block_size=3, e_value_cutoff=1e-5)
        synteny_result = mcscan.run(genes1, genes2, blast_hits)
        
        logger.info(f"Found {len(synteny_result['syntenic_blocks'])} syntenic blocks")
        
        logger.info("Detecting ploidy events (WGD, tandem duplications)...")
        ploidy_detector = PloidyDetector()
        ploidy_result = ploidy_detector.detect(
            synteny_result['syntenic_blocks'],
            genes1,
            genes2,
            blast_hits
        )
        
        logger.info(f"Detected {len(ploidy_result['wgd_events'])} WGD events and {len(ploidy_result['tandem_duplications'])} tandem clusters")
        
        logger.info("Reconstructing ancestral karyotype...")
        ancestor_reconstructor = AncestorKaryotypeReconstructor()
        ancestor_result = ancestor_reconstructor.reconstruct(
            synteny_result['syntenic_blocks'],
            genes1,
            genes2
        )
        
        logger.info("Generating visualizations...")
        
        dotplot_gen = DotPlotGenerator()
        dotplot_result = dotplot_gen.generate(
            synteny_result['syntenic_blocks'],
            synteny_result['gene_pairs'],
            genes1,
            genes2
        )
        
        circos_gen = CircosPlotGenerator()
        try:
            circos_result = circos_gen.generate(
                synteny_result['syntenic_blocks'],
                genes1,
                genes2,
                chr_lengths1,
                chr_lengths2,
                ploidy_result
            )
        except Exception as e:
            logger.warning(f"Circos plot generation failed: {e}")
            circos_result = {'html': '<p>Circos plot generation failed</p>', 'svg': ''}
        
        ancestor_plot_gen = AncestorPlotGenerator()
        ancestor_plot_result = ancestor_plot_gen.generate(
            ancestor_result['ancestral_contigs'],
            {
                'breakpoints': ancestor_result['estimated_breakpoints'],
                'fusions': ancestor_result['estimated_fusions'],
                'fissions': ancestor_result['estimated_fissions']
            }
        )
        
        logger.info("Generating PDF report...")
        pdf_exporter = PDFExporter()
        results = {
            'synteny_result': synteny_result,
            'ancestor_result': ancestor_result
        }
        pdf_content = pdf_exporter.export(results)
        
        response = {
            'summary': {
                'species1_genes': result1['total_genes'],
                'species2_genes': result2['total_genes'],
                'blast_hits': blast_result['total_hits'],
                'syntenic_pairs': synteny_result['total_pairs'],
                'syntenic_blocks': len(synteny_result['syntenic_blocks']),
                'ancestral_contigs': ancestor_result['num_contigs'],
                'breakpoints': ancestor_result['estimated_breakpoints'],
                'wgd_events': len(ploidy_result.get('wgd_events', [])),
                'tandem_duplications': len(ploidy_result.get('tandem_duplications', [])),
                'hotspots': len(ploidy_result.get('hotspots', [])),
                'wgd_detected': ploidy_result.get('wgd_detected', False),
                **synteny_result.get('anchoring_stats', {})
            },
            'syntenic_blocks': synteny_result['syntenic_blocks'],
            'ancestral_contigs': ancestor_result['ancestral_contigs'],
            'rearrangement_events': {
                'breakpoints': ancestor_result['estimated_breakpoints'],
                'fusions': ancestor_result['estimated_fusions'],
                'fissions': ancestor_result['estimated_fissions']
            },
            'scaffold_mapping': synteny_result.get('scaffold_mapping', []),
            'ploidy_detection': {
                'wgd_events': ploidy_result.get('wgd_events', []),
                'tandem_duplications': ploidy_result.get('tandem_duplications', []),
                'hotspots': ploidy_result.get('hotspots', []),
                'ks_distribution': ploidy_result.get('ks_distribution', {}),
                'wgd_detected': ploidy_result.get('wgd_detected', False),
                'total_ks_pairs': ploidy_result.get('total_ks_pairs', 0)
            },
            'visualizations': {
                'dotplot': dotplot_result['html'],
                'circos': circos_result['html'],
                'circos_svg': circos_result.get('svg', ''),
                'ancestor_plot': ancestor_plot_result['html']
            },
            'pdf_report': base64.b64encode(pdf_content).decode('utf-8')
        }
        
        logger.info("Analysis completed successfully!")
        
        return JSONResponse(content=response)
    
    except Exception as e:
        logger.error(f"Error during analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.get("/results/dotplot/{job_id}")
async def get_dotplot(job_id: str):
    return HTMLResponse(content="<p>Job storage not implemented yet</p>")

@app.get("/results/circos/{job_id}")
async def get_circos(job_id: str):
    return HTMLResponse(content="<p>Job storage not implemented yet</p>")

@app.get("/results/pdf/{job_id}")
async def get_pdf(job_id: str):
    return Response(content=b"", media_type="application/pdf")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
