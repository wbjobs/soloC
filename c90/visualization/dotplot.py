import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
from typing import Dict, List
import numpy as np
import json

class DotPlotGenerator:
    def __init__(self):
        pass
    
    def generate(self, 
                 syntenic_blocks: List[Dict], 
                 gene_pairs: List[Dict],
                 genes1: pd.DataFrame,
                 genes2: pd.DataFrame) -> Dict:
        
        fig = go.Figure()
        
        chr_list1 = sorted(genes1['seqid'].unique())
        chr_list2 = sorted(genes2['seqid'].unique())
        
        chr_offsets1 = self._calculate_chromosome_offsets(genes1, chr_list1)
        chr_offsets2 = self._calculate_chromosome_offsets(genes2, chr_list2)
        
        colors = px.colors.qualitative.Set3
        
        for i, pair in enumerate(gene_pairs):
            g1_pos = chr_offsets1[pair['chr1']] + pair['idx1']
            g2_pos = chr_offsets2[pair['chr2']] + pair['idx2']
            
            color = colors[hash(pair['chr1'] + pair['chr2']) % len(colors)]
            
            fig.add_trace(go.Scatter(
                x=[g1_pos],
                y=[g2_pos],
                mode='markers',
                marker=dict(size=4, color=color, opacity=0.7),
                name=f"{pair['chr1']}-{pair['chr2']}",
                text=f"{pair['gene1']} - {pair['gene2']}<br>Identity: {pair['identity']:.1f}%",
                hoverinfo='text',
                showlegend=False
            ))
        
        for block_idx, block in enumerate(syntenic_blocks):
            block_genes = block['genes']
            
            x_coords = [chr_offsets1[block['chr1']] + g['idx1'] for g in block_genes]
            y_coords = [chr_offsets2[block['chr2']] + g['idx2'] for g in block_genes]
            
            fig.add_trace(go.Scatter(
                x=x_coords,
                y=y_coords,
                mode='lines',
                line=dict(color='red', width=2),
                name=f"Block {block['block_id']} ({block['size']} genes)",
                hoverinfo='name'
            ))
        
        self._add_chromosome_boundaries(fig, chr_offsets1, chr_offsets2, chr_list1, chr_list2)
        
        fig.update_layout(
            title='Synteny Dot Plot',
            xaxis_title='Species 1',
            yaxis_title='Species 2',
            width=900,
            height=800,
            hovermode='closest'
        )
        
        html_content = fig.to_html(include_plotlyjs=True, full_html=True)
        
        return {
            'html': html_content,
            'figure_json': json.loads(fig.to_json()),
            'chromosomes1': chr_list1,
            'chromosomes2': chr_list2
        }
    
    def _calculate_chromosome_offsets(self, genes: pd.DataFrame, chr_list: List[str]) -> Dict[str, int]:
        offsets = {}
        current = 0
        
        for chr_id in chr_list:
            offsets[chr_id] = current
            chr_genes = genes[genes['seqid'] == chr_id]
            current += len(chr_genes) + 50
        
        return offsets
    
    def _add_chromosome_boundaries(self, fig, offsets1, offsets2, chr_list1, chr_list2):
        for chr_id in chr_list1:
            fig.add_vline(
                x=offsets1[chr_id],
                line_dash="dash",
                line_color="gray",
                opacity=0.5
            )
        
        for chr_id in chr_list2:
            fig.add_hline(
                y=offsets2[chr_id],
                line_dash="dash",
                line_color="gray",
                opacity=0.5
            )
        
        x_ticks = []
        x_labels = []
        for chr_id in chr_list1:
            x_ticks.append(offsets1[chr_id])
            x_labels.append(chr_id)
        
        y_ticks = []
        y_labels = []
        for chr_id in chr_list2:
            y_ticks.append(offsets2[chr_id])
            y_labels.append(chr_id)
        
        fig.update_xaxes(tickmode='array', tickvals=x_ticks, ticktext=x_labels, tickangle=45)
        fig.update_yaxes(tickmode='array', tickvals=y_ticks, ticktext=y_labels)
