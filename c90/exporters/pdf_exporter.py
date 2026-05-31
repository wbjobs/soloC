from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.units import inch
import io
import matplotlib.pyplot as plt
import base64

class PDFExporter:
    def __init__(self):
        pass
    
    def export(self, results: Dict) -> bytes:
        buffer = io.BytesIO()
        
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=50, rightMargin=50, 
                               topMargin=50, bottomMargin=50)
        
        styles = getSampleStyleSheet()
        story = []
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=1
        )
        story.append(Paragraph("Synteny Analysis Report", title_style))
        
        story.append(Spacer(1, 20))
        
        story.append(self._create_summary_table(results, styles))
        
        story.append(Spacer(1, 20))
        
        story.append(Paragraph("Syntenic Blocks", styles['Heading2']))
        
        story.append(Spacer(1, 10))
        
        story.append(self._create_blocks_table(results, styles))
        
        story.append(Spacer(1, 20))
        
        story.append(Paragraph("Ancestral Karyotype Reconstruction", styles['Heading2']))
        
        story.append(Spacer(1, 10))
        
        story.append(self._create_ancestor_table(results, styles))
        
        doc.build(story)
        
        pdf_content = buffer.getvalue()
        buffer.close()
        
        return pdf_content
    
    def _create_summary_table(self, results: Dict, styles) -> Table:
        synteny_result = results.get('synteny_result', {})
        ancestor_result = results.get('ancestor_result', {})
        
        data = [
            ['Metric', 'Value'],
            ['Total Syntenic Gene Pairs', str(synteny_result.get('total_pairs', 0))],
            ['Number of Syntenic Blocks', str(len(synteny_result.get('syntenic_blocks', [])))],
            ['Ancestral Contigs', str(ancestor_result.get('num_contigs', 0))],
            ['Estimated Breakpoints', str(ancestor_result.get('estimated_breakpoints', 0))],
            ['Estimated Fusions', str(ancestor_result.get('estimated_fusions', 0))]
        ]
        
        table = Table(data, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        return table
    
    def _create_blocks_table(self, results: Dict, styles) -> Table:
        blocks = results.get('synteny_result', {}).get('syntenic_blocks', [])
        
        data = [['Block ID', 'Species 1 Chr', 'Species 2 Chr', 'Number of Genes']]
        
        for block in blocks[:10]:
            data.append([
                block.get('block_id', ''),
                block.get('chr1', ''),
                block.get('chr2', ''),
                str(block.get('size', 0))
            ])
        
        if len(blocks) > 10:
            data.append(['...', '...', '...', '...'])
        
        table = Table(data, colWidths=[1.5*inch, 1.5*inch, 1.5*inch, 1.5*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.lightblue),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        return table
    
    def _create_ancestor_table(self, results: Dict, styles) -> Table:
        contigs = results.get('ancestor_result', {}).get('ancestral_contigs', [])
        
        data = [['Contig ID', 'Number of Genes', 'Support']]
        
        for contig in contigs[:10]:
            data.append([
                contig.get('contig_id', ''),
                str(contig.get('size', 0)),
                f"{contig.get('support', 0):.2f}"
            ])
        
        if len(contigs) > 10:
            data.append(['...', '...', '...'])
        
        table = Table(data, colWidths=[2*inch, 2*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.lightgreen),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        return table
