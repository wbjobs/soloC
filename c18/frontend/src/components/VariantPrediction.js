import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { PREDICT_VARIANTS } from '../graphql/queries';
import VariantVisualization from './visualizations/VariantVisualization';

function VariantPrediction({ sequences, selectedSequence }) {
  const [variantSequence, setVariantSequence] = useState('');
  const [showVisualization, setShowVisualization] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [expandedVariant, setExpandedVariant] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all');

  const [predictVariants, { loading, error }] = useMutation(PREDICT_VARIANTS, {
    onCompleted: (data) => {
      setPredictionResult(data.predictVariants);
      setShowVisualization(true);
    }
  });

  const handlePredictVariants = () => {
    if (!selectedSequence) {
      alert('Please select a sequence first');
      return;
    }

    predictVariants({
      variables: {
        referenceSequence: selectedSequence.sequence,
        variantSequence: variantSequence.trim() || null
      }
    });
  };

  const getFilteredVariants = () => {
    if (!predictionResult?.variants) return [];
    
    if (severityFilter === 'all') {
      return predictionResult.variants;
    }
    
    return predictionResult.variants.filter(v => v.severity === severityFilter);
  };

  const formatVariantType = (type) => {
    const typeMap = {
      'synonymous': 'Synonymous (Silent)',
      'missense': 'Missense',
      'nonsense': 'Nonsense (Stop Gain)',
      'frameshift': 'Frameshift',
      'inframe_indel': 'In-frame Indel',
      'splice_site_variant': 'Splice Site',
      'cpg_methylation': 'CpG Methylation Site',
      'polyq_expansion': 'PolyQ Expansion',
      'start_codon_variant': 'Start Codon',
      'stop_codon_missing': 'Stop Codon Missing',
      'gc_content_extreme': 'Extreme GC Content',
      'stop_loss': 'Stop Loss'
    };
    return typeMap[type] || type;
  };

  const getClinicalColor = (cs) => {
    switch (cs) {
      case 'pathogenic': return '#dc3545';
      case 'likely_pathogenic': return '#fd7e14';
      case 'uncertain': return '#ffc107';
      case 'likely_benign': return '#17a2b8';
      case 'benign': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getSeverityBadgeClass = (severity) => {
    switch (severity) {
      case 'high': return 'severity-high';
      case 'medium': return 'severity-medium';
      case 'low': return 'severity-low';
      default: return 'severity-unknown';
    }
  };

  const filteredVariants = getFilteredVariants();

  return (
    <div className="variant-prediction">
      <div className="prediction-form">
        <h3>Variant Prediction</h3>
        
        <div className="prediction-info">
          <p>
            This feature analyzes your sequence to predict potential genetic variants.
            You can optionally provide a variant sequence for direct comparison.
          </p>
        </div>

        <div className="selected-sequence-info">
          {selectedSequence ? (
            <div>
              <p><strong>Reference Sequence:</strong> {selectedSequence.name}</p>
              <p><strong>Length:</strong> {selectedSequence.length} bp</p>
              <p className="sequence-preview">
                {selectedSequence.sequence?.substring(0, 80)}...
              </p>
            </div>
          ) : (
            <p className="no-selection">Please select a sequence from the list above</p>
          )}
        </div>

        <div className="variant-input">
          <label htmlFor="variant-sequence">
            Variant Sequence (Optional - for direct comparison):
          </label>
          <textarea
            id="variant-sequence"
            value={variantSequence}
            onChange={(e) => setVariantSequence(e.target.value)}
            placeholder="Enter variant sequence for comparison (optional)"
            rows={6}
            className="sequence-textarea"
          />
        </div>

        <div className="prediction-options">
          <div className="option">
            <label>
              <input
                type="checkbox"
                checked={showVisualization}
                onChange={(e) => setShowVisualization(e.target.checked)}
              />
              Show visualization
            </label>
          </div>
        </div>

        <button
          onClick={handlePredictVariants}
          disabled={loading || !selectedSequence}
          className="predict-button"
        >
          {loading ? 'Analyzing...' : 'Predict Variants'}
        </button>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error.message}
          </div>
        )}
      </div>

      {predictionResult && (
        <div className="prediction-results">
          {showVisualization && (
            <VariantVisualization
              variants={predictionResult.variants}
              summary={predictionResult.summary}
              sequenceAnalysis={predictionResult.sequence_analysis}
            />
          )}

          <div className="results-summary">
            <h4>Prediction Summary</h4>
            <div className="summary-cards">
              <div className="summary-card">
                <div className="card-value">{predictionResult.summary.total_variants}</div>
                <div className="card-label">Total Variants</div>
              </div>
              <div className="summary-card">
                <div className="card-value">{(predictionResult.summary.average_impact * 100).toFixed(1)}%</div>
                <div className="card-label">Avg Impact Score</div>
              </div>
              <div className="summary-card">
                <div className="card-value">{predictionResult.recommendations?.length || 0}</div>
                <div className="card-label">Recommendations</div>
              </div>
            </div>
          </div>

          {predictionResult.recommendations && predictionResult.recommendations.length > 0 && (
            <div className="recommendations">
              <h4>Recommendations</h4>
              <ul>
                {predictionResult.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {predictionResult.variants && predictionResult.variants.length > 0 && (
            <div className="variants-table-section">
              <div className="table-header">
                <h4>Detected Variants</h4>
                <div className="filter-controls">
                  <label>Filter by Severity:</label>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <span className="filter-count">({filteredVariants.length} found)</span>
                </div>
              </div>

              <div className="variants-table-container">
                <table className="variants-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Position</th>
                      <th>Type</th>
                      <th>Change</th>
                      <th>AA Change</th>
                      <th>Impact</th>
                      <th>Severity</th>
                      <th>Clinical</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVariants.map((variant, index) => (
                      <React.Fragment key={index}>
                        <tr className={expandedVariant === index ? 'expanded' : ''}>
                          <td>{index + 1}</td>
                          <td>{variant.position}</td>
                          <td>{formatVariantType(variant.type)}</td>
                          <td>
                            {variant.ref_nucleotide && variant.var_nucleotide ? (
                              <span className="nucleotide-change">
                                <span className="ref">{variant.ref_nucleotide}</span>
                                {' → '}
                                <span className="var">{variant.var_nucleotide}</span>
                              </span>
                            ) : variant.type}
                          </td>
                          <td>
                            {variant.ref_amino_acid && variant.var_amino_acid && 
                             variant.ref_amino_acid !== variant.var_amino_acid ? (
                              <span className="aa-change">
                                <span className="ref">{variant.ref_amino_acid}</span>
                                {' → '}
                                <span className="var">{variant.var_amino_acid}</span>
                              </span>
                            ) : '-'}
                          </td>
                          <td>
                            <div className="impact-bar">
                              <div 
                                className="impact-fill"
                                style={{ width: `${variant.impact_score * 100}%` }}
                              />
                              <span className="impact-text">
                                {(variant.impact_score * 100).toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`severity-badge ${getSeverityBadgeClass(variant.severity)}`}>
                              {variant.severity}
                            </span>
                          </td>
                          <td>
                            <span 
                              className="clinical-badge"
                              style={{ backgroundColor: getClinicalColor(variant.clinical_significance) }}
                            >
                              {variant.clinical_significance}
                            </span>
                          </td>
                          <td>
                            <button
                              onClick={() => setExpandedVariant(expandedVariant === index ? null : index)}
                              className="expand-button"
                            >
                              {expandedVariant === index ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                        {expandedVariant === index && (
                          <tr className="variant-details">
                            <td colSpan="9">
                              <div className="detail-grid">
                                {variant.ref_codon && variant.var_codon && (
                                  <div>
                                    <strong>Codon:</strong> {variant.ref_codon} → {variant.var_codon}
                                  </div>
                                )}
                                {variant.blosum62_score !== null && variant.blosum62_score !== undefined && (
                                  <div>
                                    <strong>BLOSUM62 Score:</strong> {variant.blosum62_score}
                                  </div>
                                )}
                                {variant.conservation_type && (
                                  <div>
                                    <strong>Conservation:</strong> {variant.conservation_type}
                                  </div>
                                )}
                                {variant.probability && (
                                  <div>
                                    <strong>Probability:</strong> {(variant.probability * 100).toFixed(1)}%
                                  </div>
                                )}
                                {variant.effect?.description && (
                                  <div className="full-width">
                                    <strong>Effect:</strong> {variant.effect.description}
                                  </div>
                                )}
                                {variant.glutamine_count && (
                                  <div>
                                    <strong>Glutamine Count:</strong> {variant.glutamine_count}
                                  </div>
                                )}
                                {variant.risk_category && (
                                  <div>
                                    <strong>Risk Category:</strong> {variant.risk_category}
                                  </div>
                                )}
                                {variant.indel_length && (
                                  <div>
                                    <strong>Indel:</strong> {variant.indel_type} of {variant.indel_length}bp
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {predictionResult.sequence_analysis?.stats && (
            <div className="protein-translation">
              <h4>Protein Translation</h4>
              <div className="protein-display">
                <p><strong>Protein Length:</strong> {predictionResult.sequence_analysis.stats.protein_length} amino acids</p>
                <p className="protein-sequence">
                  {predictionResult.sequence_analysis.protein_sequence}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VariantPrediction;
