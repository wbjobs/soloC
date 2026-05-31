import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale
} from 'chart.js';
import { Bar, Pie, Radar, Scatter } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale
);

function BlastVisualization({ hits, totalHits }) {
  if (!hits || hits.length === 0) {
    return (
      <div className="visualization-empty">
        <p>No data available for visualization</p>
      </div>
    );
  }

  const identityData = {
    labels: hits.slice(0, 10).map((hit, i) => `${hit.subject_id.substring(0, 8)}`),
    datasets: [
      {
        label: 'Identity (%)',
        data: hits.slice(0, 10).map(hit => hit.identity),
        backgroundColor: hits.slice(0, 10).map(hit => {
          if (hit.identity >= 90) return 'rgba(40, 167, 69, 0.8)';
          if (hit.identity >= 70) return 'rgba(255, 193, 7, 0.8)';
          return 'rgba(220, 53, 69, 0.8)';
        }),
        borderColor: hits.slice(0, 10).map(hit => {
          if (hit.identity >= 90) return 'rgba(40, 167, 69, 1)';
          if (hit.identity >= 70) return 'rgba(255, 193, 7, 1)';
          return 'rgba(220, 53, 69, 1)';
        }),
        borderWidth: 1
      }
    ]
  };

  const identityOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Top 10 Hits - Sequence Identity (%)' }
    },
    scales: {
      y: { beginAtZero: true, max: 100 }
    }
  };

  const evalueData = {
    labels: hits.slice(0, 10).map((hit, i) => `${hit.subject_id.substring(0, 8)}`),
    datasets: [
      {
        label: 'E-value (-log10)',
        data: hits.slice(0, 10).map(hit => {
          const evalue = hit.evalue;
          return evalue === 0 ? 300 : -Math.log10(Math.max(evalue, 1e-300));
        }),
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 1
      }
    ]
  };

  const evalueOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'E-value Significance (-log10, higher is better)' }
    }
  };

  const identityDistribution = hits.reduce((acc, hit) => {
    if (hit.identity >= 90) acc.high++;
    else if (hit.identity >= 70) acc.medium++;
    else acc.low++;
    return acc;
  }, { high: 0, medium: 0, low: 0 });

  const pieData = {
    labels: ['High (≥90%)', 'Medium (70-89%)', 'Low (<70%)'],
    datasets: [
      {
        data: [identityDistribution.high, identityDistribution.medium, identityDistribution.low],
        backgroundColor: [
          'rgba(40, 167, 69, 0.8)',
          'rgba(255, 193, 7, 0.8)',
          'rgba(220, 53, 69, 0.8)'
        ],
        borderColor: [
          'rgba(40, 167, 69, 1)',
          'rgba(255, 193, 7, 1)',
          'rgba(220, 53, 69, 1)'
        ],
        borderWidth: 1
      }
    ]
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'right' },
      title: { display: true, text: 'Identity Distribution' }
    }
  };

  const scatterData = {
    datasets: [
      {
        label: 'Hits',
        data: hits.slice(0, 50).map(hit => ({
          x: hit.identity,
          y: hit.bit_score,
          r: Math.max(3, Math.min(10, hit.alignment_length / 100))
        })),
        backgroundColor: 'rgba(102, 126, 234, 0.6)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 1
      }
    ]
  };

  const scatterOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Identity vs Bit Score (size = alignment length)' },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `Identity: ${context.parsed.x.toFixed(1)}%, Bit Score: ${context.parsed.y.toFixed(1)}`;
          }
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Identity (%)' }, min: 0, max: 100 },
      y: { title: { display: true, text: 'Bit Score' } }
    }
  };

  const alignmentLengths = hits.slice(0, 10).map(hit => ({
    subject: hit.subject_id.substring(0, 10),
    length: hit.alignment_length,
    mismatches: hit.mismatches,
    gaps: hit.gap_opens
  }));

  const stackedBarData = {
    labels: alignmentLengths.map(a => a.subject),
    datasets: [
      {
        label: 'Matches',
        data: alignmentLengths.map(a => a.length - a.mismatches - a.gaps),
        backgroundColor: 'rgba(40, 167, 69, 0.8)'
      },
      {
        label: 'Mismatches',
        data: alignmentLengths.map(a => a.mismatches),
        backgroundColor: 'rgba(255, 193, 7, 0.8)'
      },
      {
        label: 'Gaps',
        data: alignmentLengths.map(a => a.gaps),
        backgroundColor: 'rgba(220, 53, 69, 0.8)'
      }
    ]
  };

  const stackedBarOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Alignment Composition' }
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true }
    }
  };

  return (
    <div className="blast-visualization">
      <h3>BLAST Results Visualization</h3>
      <p className="visualization-info">Total hits analyzed: {totalHits}</p>
      
      <div className="chart-grid">
        <div className="chart-container">
          <Bar data={identityData} options={identityOptions} />
        </div>
        
        <div className="chart-container">
          <Bar data={evalueData} options={evalueOptions} />
        </div>
        
        <div className="chart-container">
          <Pie data={pieData} options={pieOptions} />
        </div>
        
        <div className="chart-container">
          <Scatter data={scatterData} options={scatterOptions} />
        </div>
        
        <div className="chart-container wide">
          <Bar data={stackedBarData} options={stackedBarOptions} />
        </div>
      </div>
      
      <div className="visualization-summary">
        <div className="summary-item">
          <span className="label">Average Identity:</span>
          <span className="value">
            {(hits.reduce((sum, h) => sum + h.identity, 0) / hits.length).toFixed(1)}%
          </span>
        </div>
        <div className="summary-item">
          <span className="label">Average Bit Score:</span>
          <span className="value">
            {(hits.reduce((sum, h) => sum + h.bit_score, 0) / hits.length).toFixed(1)}
          </span>
        </div>
        <div className="summary-item">
          <span className="label">Max Identity:</span>
          <span className="value">
            {Math.max(...hits.map(h => h.identity)).toFixed(1)}%
          </span>
        </div>
        <div className="summary-item">
          <span className="label">High Identity Hits:</span>
          <span className="value">{identityDistribution.high}</span>
        </div>
      </div>
    </div>
  );
}

export default BlastVisualization;
