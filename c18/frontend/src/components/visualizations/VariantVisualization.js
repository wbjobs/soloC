import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function VariantVisualization({ variants, summary, sequenceAnalysis }) {
  if (!summary || variants.length === 0) {
    return (
      <div className="visualization-empty">
        <p>No variant data available for visualization</p>
      </div>
    );
  }

  const bySeverity = summary.by_severity ? JSON.parse(summary.by_severity) : { high: 0, medium: 0, low: 0 };
  const byType = summary.by_type ? JSON.parse(summary.by_type) : {};

  const severityData = {
    labels: ['High', 'Medium', 'Low'],
    datasets: [
      {
        data: [bySeverity.high || 0, bySeverity.medium || 0, bySeverity.low || 0],
        backgroundColor: [
          'rgba(220, 53, 69, 0.8)',
          'rgba(255, 193, 7, 0.8)',
          'rgba(40, 167, 69, 0.8)'
        ],
        borderColor: [
          'rgba(220, 53, 69, 1)',
          'rgba(255, 193, 7, 1)',
          'rgba(40, 167, 69, 1)'
        ],
        borderWidth: 2
      }
    ]
  };

  const severityOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Variants by Severity' }
    }
  };

  const typeLabels = Object.keys(byType);
  const typeValues = typeLabels.map(k => byType[k]);

  const typeData = {
    labels: typeLabels.length > 0 ? typeLabels : ['No variants'],
    datasets: [
      {
        data: typeValues.length > 0 ? typeValues : [1],
        backgroundColor: typeLabels.length > 0 ? [
          'rgba(102, 126, 234, 0.8)',
          'rgba(118, 75, 162, 0.8)',
          'rgba(40, 167, 69, 0.8)',
          'rgba(255, 193, 7, 0.8)',
          'rgba(220, 53, 69, 0.8)',
          'rgba(23, 162, 184, 0.8)',
          'rgba(108, 117, 125, 0.8)'
        ] : ['rgba(200, 200, 200, 0.8)'],
        borderWidth: 1
      }
    ]
  };

  const typeOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'right' },
      title: { display: true, text: 'Variants by Type' }
    }
  };

  const impactData = {
    labels: variants.slice(0, 15).map((v, i) => 
      `Pos ${v.position}`
    ),
    datasets: [
      {
        label: 'Impact Score',
        data: variants.slice(0, 15).map(v => v.impact_score * 100),
        backgroundColor: variants.slice(0, 15).map(v => {
          if (v.impact_score >= 0.7) return 'rgba(220, 53, 69, 0.8)';
          if (v.impact_score >= 0.3) return 'rgba(255, 193, 7, 0.8)';
          return 'rgba(40, 167, 69, 0.8)';
        }),
        borderColor: variants.slice(0, 15).map(v => {
          if (v.impact_score >= 0.7) return 'rgba(220, 53, 69, 1)';
          if (v.impact_score >= 0.3) return 'rgba(255, 193, 7, 1)';
          return 'rgba(40, 167, 69, 1)';
        }),
        borderWidth: 1
      }
    ]
  };

  const impactOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Top 15 Variants - Impact Score' }
    },
    scales: {
      y: { beginAtZero: true, max: 100, title: { display: true, text: 'Impact Score (%)' } }
    }
  };

  const stats = sequenceAnalysis?.stats;
  
  const nucleotideData = stats ? {
    labels: ['A', 'T', 'G', 'C'],
    datasets: [
      {
        data: [
          stats.a_content || 0,
          stats.t_content || 0,
          stats.g_content || 0,
          stats.c_content || 0
        ],
        backgroundColor: [
          'rgba(76, 175, 80, 0.8)',
          'rgba(244, 67, 54, 0.8)',
          'rgba(33, 150, 243, 0.8)',
          'rgba(255, 193, 7, 0.8)'
        ],
        borderColor: [
          'rgba(76, 175, 80, 1)',
          'rgba(244, 67, 54, 1)',
          'rgba(33, 150, 243, 1)',
          'rgba(255, 193, 7, 1)'
        ],
        borderWidth: 2
      }
    ]
  } : null;

  const nucleotideOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Nucleotide Composition (%)' }
    }
  };

  const clinicalSignificance = variants.reduce((acc, v) => {
    const cs = v.clinical_significance || 'uncertain';
    acc[cs] = (acc[cs] || 0) + 1;
    return acc;
  }, {});

  const clinicalData = {
    labels: Object.keys(clinicalSignificance).length > 0 ? Object.keys(clinicalSignificance) : ['uncertain'],
    datasets: [
      {
        data: Object.keys(clinicalSignificance).length > 0 ? Object.values(clinicalSignificance) : [0],
        backgroundColor: [
          'rgba(220, 53, 69, 0.8)',
          'rgba(255, 152, 0, 0.8)',
          'rgba(108, 117, 125, 0.8)',
          'rgba(40, 167, 69, 0.8)',
          'rgba(23, 162, 184, 0.8)'
        ]
      }
    ]
  };

  const clinicalOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Clinical Significance' }
    }
  };

  const getRiskClass = (risk) => {
    switch (risk) {
      case 'high': return 'risk-high';
      case 'medium': return 'risk-medium';
      case 'low':
      default: return 'risk-low';
    }
  };

  const getRiskText = (risk) => {
    switch (risk) {
      case 'high': return 'High Risk';
      case 'medium': return 'Medium Risk';
      case 'low':
      default: return 'Low Risk';
    }
  };

  return (
    <div className="variant-visualization">
      <h3>Variant Analysis Visualization</h3>
      
      <div className={`risk-banner ${getRiskClass(summary.overall_risk)}`}>
        <div className="risk-icon">⚠️</div>
        <div className="risk-content">
          <h4>Overall Risk Assessment: {getRiskText(summary.overall_risk)}</h4>
          <p>
            {summary.total_variants} variants detected. 
            Average impact score: {(summary.average_impact * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-container">
          <Doughnut data={severityData} options={severityOptions} />
        </div>
        
        <div className="chart-container">
          <Pie data={typeData} options={typeOptions} />
        </div>
        
        <div className="chart-container">
          <Bar data={impactData} options={impactOptions} />
        </div>
        
        <div className="chart-container">
          <Pie data={clinicalData} options={clinicalOptions} />
        </div>
        
        {nucleotideData && (
          <div className="chart-container wide">
            <Doughnut data={nucleotideData} options={nucleotideOptions} />
          </div>
        )}
      </div>

      {stats && (
        <div className="sequence-stats">
          <h4>Sequence Statistics</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Sequence Length:</span>
              <span className="stat-value">{stats.length} bp</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">GC Content:</span>
              <span className="stat-value">{stats.gc_content?.toFixed(1)}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Protein Length:</span>
              <span className="stat-value">{stats.protein_length} aa</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Molecular Weight:</span>
              <span className="stat-value">{stats.molecular_weight?.toFixed(0)} Da</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Isoelectric Point:</span>
              <span className="stat-value">{stats.isoelectric_point?.toFixed(2)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Hydrophobicity:</span>
              <span className="stat-value">{stats.hydrophobicity?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {sequenceAnalysis?.repeat_regions && sequenceAnalysis.repeat_regions.length > 0 && (
        <div className="repeat-regions">
          <h4>Repeat Regions Detected</h4>
          <div className="repeat-list">
            {sequenceAnalysis.repeat_regions.slice(0, 10).map((repeat, i) => (
              <div key={i} className="repeat-item">
                <span className="repeat-unit">{repeat.unit}</span>
                <span className="repeat-count">×{repeat.count}</span>
                <span className="repeat-range">Pos {repeat.start}-{repeat.end}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sequenceAnalysis?.cpg_islands && sequenceAnalysis.cpg_islands.length > 0 && (
        <div className="cpg-islands">
          <h4>CpG Islands</h4>
          <div className="cpg-list">
            {sequenceAnalysis.cpg_islands.slice(0, 5).map((island, i) => (
              <div key={i} className="cpg-item">
                <span className="cpg-range">Pos {island.start}-{island.end}</span>
                <span className="cpg-gc">GC: {island.gc_content}%</span>
                <span className="cpg-ratio">CG Ratio: {island.cg_ratio}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VariantVisualization;
