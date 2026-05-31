import io
import json
import base64
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, Color
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)


def create_spectrogram_image(
    spectrums: List[Dict],
    output_path: Optional[Path] = None,
    max_freq_bins: int = 128,
    downsample: int = 10
) -> Optional[bytes]:
    if not spectrums:
        return None
    
    try:
        magnitudes_list = []
        for i, spec in enumerate(spectrums):
            if i % downsample == 0:
                mags = spec.get('magnitudes', [])[:max_freq_bins]
                while len(mags) < max_freq_bins:
                    mags.append(-100)
                magnitudes_list.append(mags)
        
        if not magnitudes_list:
            return None
        
        spectrogram = np.array(magnitudes_list).T
        
        fig, ax = plt.subplots(figsize=(14, 6), dpi=100)
        
        norm = mcolors.Normalize(vmin=-80, vmax=0)
        cmap = plt.cm.get_cmap('viridis')
        
        im = ax.imshow(
            spectrogram,
            aspect='auto',
            origin='lower',
            cmap=cmap,
            norm=norm,
            extent=[0, len(spectrums), 0, max_freq_bins]
        )
        
        ax.set_xlabel('时间帧', fontsize=11)
        ax.set_ylabel('频率区间', fontsize=11)
        ax.set_title('频谱热力图 (Spectrogram)', fontsize=13, fontweight='bold')
        
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('能量 (dB)', fontsize=10)
        
        ax.grid(True, alpha=0.3, linestyle='--')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        
        buf.seek(0)
        img_data = buf.getvalue()
        
        if output_path:
            with open(output_path, 'wb') as f:
                f.write(img_data)
        
        return img_data
        
    except Exception as e:
        print(f"[PDF] 生成热力图失败: {e}")
        plt.close('all')
        return None


def create_magnitude_chart(
    spectrums: List[Dict],
    output_path: Optional[Path] = None,
    sample_rate: int = 44100,
    fft_size: int = 1024
) -> Optional[bytes]:
    if not spectrums:
        return None
    
    try:
        avg_magnitudes = np.zeros(len(spectrums[0].get('magnitudes', [])))
        
        for spec in spectrums:
            mags = np.array(spec.get('magnitudes', []))
            if len(mags) == len(avg_magnitudes):
                avg_magnitudes += mags
        
        avg_magnitudes /= len(spectrums)
        
        half_size = fft_size // 2
        frequencies = np.linspace(0, sample_rate / 2, len(avg_magnitudes))
        
        display_count = min(100, len(frequencies))
        step = max(1, len(frequencies) // display_count)
        
        fig, ax = plt.subplots(figsize=(14, 5), dpi=100)
        
        ax.plot(
            frequencies[::step][:display_count],
            avg_magnitudes[::step][:display_count],
            color='#4a90d9',
            linewidth=2,
            alpha=0.8
        )
        
        ax.fill_between(
            frequencies[::step][:display_count],
            avg_magnitudes[::step][:display_count],
            alpha=0.3,
            color='#4a90d9'
        )
        
        ax.set_xlabel('频率 (Hz)', fontsize=11)
        ax.set_ylabel('能量 (dB)', fontsize=11)
        ax.set_title('平均频谱图', fontsize=13, fontweight='bold')
        ax.grid(True, alpha=0.3, linestyle='--')
        ax.set_facecolor('#f8f9fa')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        
        buf.seek(0)
        img_data = buf.getvalue()
        
        if output_path:
            with open(output_path, 'wb') as f:
                f.write(img_data)
        
        return img_data
        
    except Exception as e:
        print(f"[PDF] 生成频谱图失败: {e}")
        plt.close('all')
        return None


def calculate_statistics(
    spectrums: List[Dict],
    sample_rate: int = 44100
) -> Dict:
    if not spectrums:
        return {}
    
    try:
        all_magnitudes = []
        timestamps = []
        
        for spec in spectrums:
            mags = spec.get('magnitudes', [])
            if mags:
                all_magnitudes.append(mags)
                timestamps.append(spec.get('timestamp', 0))
        
        if not all_magnitudes:
            return {}
        
        mags_array = np.array(all_magnitudes)
        
        avg_magnitudes = np.mean(mags_array, axis=0)
        max_magnitudes = np.max(mags_array, axis=0)
        min_magnitudes = np.min(mags_array, axis=0)
        
        peak_freq_idx = np.argmax(avg_magnitudes)
        half_size = len(avg_magnitudes)
        frequencies = np.linspace(0, sample_rate / 2, half_size)
        peak_frequency = frequencies[peak_freq_idx]
        
        total_energy = np.sum(10 ** (mags_array / 10))
        avg_energy = np.mean(total_energy)
        
        spectral_centroid = np.sum(frequencies[:half_size] * np.abs(avg_magnitudes)) / np.sum(np.abs(avg_magnitudes))
        
        return {
            'num_frames': len(spectrums),
            'duration': timestamps[-1] if timestamps else 0,
            'peak_frequency': float(peak_frequency),
            'peak_magnitude': float(avg_magnitudes[peak_freq_idx]),
            'avg_energy': float(avg_energy),
            'spectral_centroid': float(spectral_centroid) if not np.isnan(spectral_centroid) else 0,
            'max_magnitude': float(np.max(max_magnitudes)),
            'min_magnitude': float(np.min(min_magnitudes)),
            'mean_magnitude': float(np.mean(avg_magnitudes))
        }
        
    except Exception as e:
        print(f"[PDF] 统计计算失败: {e}")
        return {}


def generate_pdf_report(
    session_id: str,
    filename: str,
    spectrums: List[Dict],
    sample_rate: int = 44100,
    fft_size: int = 1024,
    hop_size: int = 512
) -> Optional[Path]:
    if not spectrums:
        return None
    
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"{session_id}_{timestamp}_report.pdf"
        output_path = REPORTS_DIR / output_filename
        
        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=22,
            textColor=HexColor('#1a3a5a'),
            alignment=TA_CENTER,
            spaceAfter=20
        )
        
        h1_style = ParagraphStyle(
            'CustomH1',
            parent=styles['Heading1'],
            fontSize=16,
            textColor=HexColor('#2a4a6a'),
            spaceAfter=12,
            spaceBefore=15
        )
        
        h2_style = ParagraphStyle(
            'CustomH2',
            parent=styles['Heading2'],
            fontSize=13,
            textColor=HexColor('#4a90d9'),
            spaceAfter=8,
            spaceBefore=10
        )
        
        body_style = ParagraphStyle(
            'CustomBody',
            parent=styles['BodyText'],
            fontSize=10,
            textColor=HexColor('#333333'),
            leading=14,
            spaceAfter=6
        )
        
        story = []
        
        story.append(Paragraph("音频频谱分析报告", title_style))
        story.append(Spacer(1, 10))
        
        story.append(Paragraph("一、项目信息", h1_style))
        
        gen_time = datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')
        
        info_data = [
            ['项目', '内容'],
            ['音频文件名', filename],
            ['会话ID', session_id[:12] + '...'],
            ['生成时间', gen_time],
            ['采样率', f'{sample_rate} Hz'],
            ['FFT大小', f'{fft_size} 点'],
            ['Hop大小', f'{hop_size} 点'],
            ['分析帧数', f'{len(spectrums)} 帧']
        ]
        
        info_table = Table(info_data, colWidths=[4*cm, 10*cm])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#4a90d9')),
            ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#ffffff')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8f9fa')),
            ('GRID', (0, 0), (-1, -1), 1, HexColor('#dddddd')),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 15))
        
        story.append(Paragraph("二、频谱热力图", h1_style))
        story.append(Paragraph(
            "下图展示了音频在不同时间点的频率分布，颜色表示能量强度（蓝色为低，黄色为高）。",
            body_style
        ))
        story.append(Spacer(1, 8))
        
        spectrogram_img = create_spectrogram_image(spectrums)
        if spectrogram_img:
            img = Image(io.BytesIO(spectrogram_img), width=17*cm, height=7*cm)
            story.append(img)
        story.append(Spacer(1, 10))
        
        story.append(PageBreak())
        
        story.append(Paragraph("三、平均频谱图", h1_style))
        story.append(Paragraph(
            "下图展示了整个音频的平均频率响应曲线。",
            body_style
        ))
        story.append(Spacer(1, 8))
        
        magnitude_img = create_magnitude_chart(spectrums, sample_rate=sample_rate, fft_size=fft_size)
        if magnitude_img:
            img = Image(io.BytesIO(magnitude_img), width=17*cm, height=6*cm)
            story.append(img)
        story.append(Spacer(1, 15))
        
        stats = calculate_statistics(spectrums, sample_rate=sample_rate)
        
        if stats:
            story.append(Paragraph("四、统计分析", h1_style))
            story.append(Spacer(1, 5))
            
            stats_data = [
                ['统计指标', '数值'],
                ['总帧数', f"{stats.get('num_frames', 0)}"],
                ['音频时长', f"{stats.get('duration', 0):.2f} 秒"],
                ['峰值频率', f"{stats.get('peak_frequency', 0):.2f} Hz"],
                ['峰值能量', f"{stats.get('peak_magnitude', 0):.2f} dB"],
                ['平均能量', f"{stats.get('avg_energy', 0):.2e}"],
                ['频谱质心', f"{stats.get('spectral_centroid', 0):.2f} Hz"],
                ['最大能量', f"{stats.get('max_magnitude', 0):.2f} dB"],
                ['最小能量', f"{stats.get('min_magnitude', 0):.2f} dB"]
            ]
            
            stats_table = Table(stats_data, colWidths=[5*cm, 9*cm])
            stats_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), HexColor('#90d94a')),
                ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#ffffff')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f0fff0')),
                ('GRID', (0, 0), (-1, -1), 1, HexColor('#ccddcc')),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(stats_table)
        
        story.append(Spacer(1, 20))
        
        footer = Paragraph(
            "<para align=center><font color='#888888' size=8>"
            "本报告由实时音频频谱分析系统自动生成 | "
            "技术栈: Rust + WASM + Python FastAPI + React + Three.js"
            "</font></para>",
            body_style
        )
        story.append(footer)
        
        doc.build(story)
        
        return output_path
        
    except Exception as e:
        print(f"[PDF] 生成报告失败: {e}")
        import traceback
        traceback.print_exc()
        return None


def load_spectrums_from_json(session_id: str) -> Optional[List[Dict]]:
    json_file = Path("spectrums") / f"{session_id}.json"
    
    if not json_file.exists():
        return None
    
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('spectrums', [])
    except Exception as e:
        print(f"[PDF] 加载频谱数据失败: {e}")
        return None
