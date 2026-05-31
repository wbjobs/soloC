from pycirclize import Circos
from pycirclize.parser import Gff
import pandas as pd
from typing import Dict, List, Optional
import numpy as np
import io
import base64
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

class CircosPlotGenerator:
    def __init__(self):
        self.hotspot_colors = {
            'high': '#FF0000',
            'medium': '#FFA500',
            'low': '#FFFF00',
            'tandem': '#FF69B4'
        }
    
    def generate(self, 
                 syntenic_blocks: List[Dict],
                 genes1: pd.DataFrame,
                 genes2: pd.DataFrame,
                 chr_lengths1: Dict[str, int],
                 chr_lengths2: Dict[str, int],
                 ploidy_result: Optional[Dict] = None) -> Dict:
        
        sectors = {}
        
        for chr_id, length in chr_lengths1.items():
            sectors[f"{chr_id}_sp1"] = length
        
        for chr_id, length in chr_lengths2.items():
            sectors[f"{chr_id}_sp2"] = length
        
        circos = Circos(sectors, space=5)
        
        for sector in circos.sectors:
            sector.axis(lw=1)
            sector.text(sector.name, size=8)
            
            track = sector.add_track((95, 100))
            track.axis(fc="#EEEEEE", ec="none")
        
        if ploidy_result:
            self._add_duplication_hotspots(circos, ploidy_result, chr_lengths1, chr_lengths2)
        
        self._add_ks_density_track(circos, syntenic_blocks, ploidy_result, chr_lengths1, chr_lengths2)
        
        self._add_synteny_links(circos, syntenic_blocks, genes1, genes2, chr_lengths1, chr_lengths2, ploidy_result)
        
        self._add_legend(circos)
        
        fig = circos.plotfig(figsize=(12, 12))
        
        img_buffer = io.BytesIO()
        fig.savefig(img_buffer, format='svg', bbox_inches='tight')
        svg_content = img_buffer.getvalue().decode('utf-8')
        
        html_content = self._generate_html(svg_content, syntenic_blocks, ploidy_result)
        
        return {
            'svg': svg_content,
            'html': html_content
        }
    
    def _add_ks_density_track(self, circos, syntenic_blocks, ploidy_result, chr_lengths1, chr_lengths2):
        if not ploidy_result or 'ks_distribution' not in ploidy_result:
            return
        
        hotspots = ploidy_result.get('hotspots', [])
        
        for sector in circos.sectors:
            sector_name = sector.name
            species = 'species1' if sector_name.endswith('_sp1') else 'species2'
            chr_name = sector_name.rsplit('_', 1)[0]
            
            track = sector.add_track((85, 95))
            
            sector_hotspots = [h for h in hotspots if h['species'] == species and h['chromosome'] == chr_name]
            
            if sector_hotspots:
                for hotspot in sector_hotspots:
                    start = hotspot['region_start']
                    end = hotspot['region_end']
                    density = hotspot['max_density']
                    
                    color = self._get_density_color(density)
                    
                    try:
                        track.rect(start, end, color=color, alpha=0.7)
                    except:
                        pass
    
    def _add_duplication_hotspots(self, circos, ploidy_result, chr_lengths1, chr_lengths2):
        hotspots = ploidy_result.get('hotspots', [])
        tandem_duplications = ploidy_result.get('tandem_duplications', [])
        
        for sector in circos.sectors:
            sector_name = sector.name
            species = 'species1' if sector_name.endswith('_sp1') else 'species2'
            chr_name = sector_name.rsplit('_', 1)[0]
            
            hotspot_track = sector.add_track((75, 85))
            
            sector_tandems = [t for t in tandem_duplications if t['species'] == species and t['chromosome'] == chr_name]
            
            for tandem in sector_tandems:
                try:
                    color = self.hotspot_colors['tandem']
                    hotspot_track.rect(tandem['start'], tandem['end'], color=color, alpha=0.8, lw=1, ec="black")
                except:
                    pass
            
            sector_hotspots = [h for h in hotspots if h['species'] == species and h['chromosome'] == chr_name]
            
            for hotspot in sector_hotspots:
                try:
                    density = hotspot['max_density']
                    color = self._get_density_color(density)
                    hotspot_track.rect(
                        hotspot['region_start'], 
                        hotspot['region_end'], 
                        color=color, 
                        alpha=0.5,
                        hatch='///'
                    )
                except:
                    pass
    
    def _get_density_color(self, density: float) -> str:
        if density >= 0.8:
            return self.hotspot_colors['high']
        elif density >= 0.6:
            return self.hotspot_colors['medium']
        else:
            return self.hotspot_colors['low']
    
    def _add_synteny_links(self, circos, syntenic_blocks, genes1, genes2, chr_lengths1, chr_lengths2, ploidy_result):
        gene_pos1 = {row['gene_id']: (row['seqid'], row['start'], row['end']) 
                     for _, row in genes1.iterrows()}
        gene_pos2 = {row['gene_id']: (row['seqid'], row['start'], row['end']) 
                     for _, row in genes2.iterrows()}
        
        wgd_blocks = []
        normal_blocks = []
        
        for block in syntenic_blocks:
            mean_ks = block.get('mean_ks', 1.0)
            if mean_ks <= 0.5:
                wgd_blocks.append(block)
            else:
                normal_blocks.append(block)
        
        wgd_colors = ['#FF4444', '#FF6666', '#FF8888']
        
        for idx, block in enumerate(wgd_blocks):
            block_genes = block['genes']
            
            if len(block_genes) < 2:
                continue
            
            first_gene = block_genes[0]
            last_gene = block_genes[-1]
            
            chr1_sp1, start1_sp1, end1_sp1 = gene_pos1.get(first_gene['gene1'], (None, 0, 0))
            _, _, end1_last_sp1 = gene_pos1.get(last_gene['gene1'], (None, 0, 0))
            
            chr1_sp2, start1_sp2, end1_sp2 = gene_pos2.get(first_gene['gene2'], (None, 0, 0))
            _, _, end1_last_sp2 = gene_pos2.get(last_gene['gene2'], (None, 0, 0))
            
            if chr1_sp1 and chr1_sp2:
                color = wgd_colors[idx % len(wgd_colors)]
                
                start_sp1 = min(start1_sp1, end1_last_sp1)
                end_sp1 = max(end1_sp1, end1_last_sp1)
                
                start_sp2 = min(start1_sp2, end1_last_sp2)
                end_sp2 = max(end1_sp2, end1_last_sp2)
                
                circos.link(
                    (f"{chr1_sp1}_sp1", start_sp1, end_sp1),
                    (f"{chr1_sp2}_sp2", start_sp2, end_sp2),
                    color=color,
                    alpha=0.8,
                    lw=2
                )
        
        normal_colors = ['#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
                  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']
        
        for idx, block in enumerate(normal_blocks):
            block_genes = block['genes']
            
            if len(block_genes) < 2:
                continue
            
            first_gene = block_genes[0]
            last_gene = block_genes[-1]
            
            chr1_sp1, start1_sp1, end1_sp1 = gene_pos1.get(first_gene['gene1'], (None, 0, 0))
            _, _, end1_last_sp1 = gene_pos1.get(last_gene['gene1'], (None, 0, 0))
            
            chr1_sp2, start1_sp2, end1_sp2 = gene_pos2.get(first_gene['gene2'], (None, 0, 0))
            _, _, end1_last_sp2 = gene_pos2.get(last_gene['gene2'], (None, 0, 0))
            
            if chr1_sp1 and chr1_sp2:
                color = normal_colors[idx % len(normal_colors)]
                
                start_sp1 = min(start1_sp1, end1_last_sp1)
                end_sp1 = max(end1_sp1, end1_last_sp1)
                
                start_sp2 = min(start1_sp2, end1_last_sp2)
                end_sp2 = max(end1_sp2, end1_last_sp2)
                
                circos.link(
                    (f"{chr1_sp1}_sp1", start_sp1, end_sp1),
                    (f"{chr1_sp2}_sp2", start_sp2, end_sp2),
                    color=color,
                    alpha=0.5
                )
    
    def _add_legend(self, circos):
        pass
    
    def _generate_html(self, svg_content: str, syntenic_blocks: List[Dict], ploidy_result: Optional[Dict] = None) -> str:
        block_info = "<h3>Syntenic Blocks</h3><ul>"
        for block in syntenic_blocks:
            ks_info = f", mean Ks={block.get('mean_ks', 'N/A'):.2f}" if 'mean_ks' in block else ""
            block_info += f"<li>{block['block_id']}: {block['chr1']} - {block['chr2']}, {block['size']} genes{ks_info}</li>"
        block_info += "</ul>"
        
        ploidy_info = ""
        if ploidy_result:
            ploidy_info = "<h3>Ploidy Detection Results</h3>"
            
            wgd_events = ploidy_result.get('wgd_events', [])
            if wgd_events:
                ploidy_info += "<h4>WGD Events Detected:</h4><ul>"
                for event in wgd_events:
                    ploidy_info += f"<li><strong>{event['event_type']}</strong>: Ks peak at {event['peak_ks']:.3f}, "
                    ploidy_info += f"{event['gene_pairs_in_peak']} gene pairs, confidence: {event['confidence']}</li>"
                ploidy_info += "</ul>"
            
            tandem_count = len(ploidy_result.get('tandem_duplications', []))
            hotspot_count = len(ploidy_result.get('hotspots', []))
            
            ploidy_info += f"<p><strong>Tandem Duplication Clusters:</strong> {tandem_count}</p>"
            ploidy_info += f"<p><strong>Duplication Hotspots:</strong> {hotspot_count}</p>"
            
            ks_dist = ploidy_result.get('ks_distribution', {})
            if ks_dist:
                ploidy_info += f"<p><strong>Ks Distribution:</strong> mean={ks_dist.get('mean', 'N/A')}, "
                ploidy_info += f"median={ks_dist.get('median', 'N/A')}</p>"
        
        legend_info = """
        <h4>Legend</h4>
        <ul>
            <li><span style="color: #FF4444;">■</span> WGD-related syntenic blocks (Ks ≤ 0.5)</li>
            <li><span style="color: #4ECDC4;">■</span> Normal syntenic blocks (Ks > 0.5)</li>
            <li><span style="color: #FF0000;">■</span> High density duplication hotspots</li>
            <li><span style="color: #FFA500;">■</span> Medium density duplication hotspots</li>
            <li><span style="color: #FFFF00;">■</span> Low density duplication hotspots</li>
            <li><span style="color: #FF69B4;">■</span> Tandem duplication clusters</li>
        </ul>
        """
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Circos Synteny Plot with Duplication Hotspots</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .container {{ display: flex; flex-direction: column; align-items: center; }}
                .svg-container {{ max-width: 900px; }}
                .info {{ margin-top: 20px; padding: 20px; background: #f5f5f5; border-radius: 8px; }}
                .two-column {{ display: flex; gap: 20px; }}
                .column {{ flex: 1; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Chromosome Synteny Circos Plot</h1>
                <h2 style="color: #666;">with Duplication Hotspot Annotation</h2>
                <div class="svg-container">
                    {svg_content}
                </div>
                <div class="info two-column">
                    <div class="column">
                        {block_info}
                    </div>
                    <div class="column">
                        {ploidy_info}
                        {legend_info}
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html
