import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
from typing import Dict, List
import json

class AncestorPlotGenerator:
    def __init__(self):
        pass
    
    def generate(self, ancestral_contigs: List[Dict], rearrangement_events: Dict) -> Dict:
        fig = go.Figure()
        
        y_pos = 0
        y_spacing = 1
        
        colors = px.colors.qualitative.Pastel
        
        for idx, contig in enumerate(ancestral_contigs):
            contig_len = len(contig['genes'])
            color = colors[idx % len(colors)]
            
            fig.add_trace(go.Bar(
                y=[y_pos],
                x=[contig_len],
                orientation='h',
                name=contig['contig_id'],
                marker=dict(color=color),
                text=f"{contig['contig_id']}: {contig_len} genes (support: {contig['support']:.2f})",
                hoverinfo='text',
                width=0.6
            ))
            
            for gene_idx, gene in enumerate(contig['genes']):
                fig.add_annotation(
                    x=gene_idx + 0.5,
                    y=y_pos,
                    text=gene[:8],
                    showarrow=False,
                    font=dict(size=8),
                    textangle=-90
                )
            
            y_pos -= y_spacing
        
        fig.update_layout(
            title='Ancestral Karyotype Reconstruction',
            xaxis_title='Gene Position',
            yaxis_title='Ancestral Contigs',
            width=1000,
            height=400 + len(ancestral_contigs) * 80,
            showlegend=True,
            yaxis=dict(
                tickmode='array',
                tickvals=[-i * y_spacing for i in range(len(ancestral_contigs))],
                ticktext=[c['contig_id'] for c in ancestral_contigs]
            )
        )
        
        stats_html = self._generate_rearrangement_stats(rearrangement_events)
        plot_html = fig.to_html(include_plotlyjs=True, full_html=False)
        
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ancestral Karyotype</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .stats {{ margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; }}
                .stat-item {{ margin: 10px 0; font-size: 16px; }}
            </style>
        </head>
        <body>
            <h1>Ancestral Karyotype Reconstruction</h1>
            {stats_html}
            {plot_html}
        </body>
        </html>
        """
        
        return {
            'html': full_html,
            'figure_json': json.loads(fig.to_json()),
            'contigs': ancestral_contigs
        }
    
    def _generate_rearrangement_stats(self, events: Dict) -> str:
        html = f"""
        <div class="stats">
            <h3>Estimated Rearrangement Events</h3>
            <div class="stat-item"><strong>Breakpoints:</strong> {events['breakpoints']}</div>
            <div class="stat-item"><strong>Fusions:</strong> {events['fusions']}</div>
            <div class="stat-item"><strong>Fissions:</strong> {events['fissions']}</div>
        </div>
        """
        return html
