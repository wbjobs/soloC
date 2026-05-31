import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { RUN_BLAST, GET_CACHED_QUERIES, CLEAR_CACHE } from '../graphql/queries';

function BlastAnalysis({ sequences, selectedSequence, onSelectSequence, uploadedFileInfo }) {
  const [program, setProgram] = useState('blastn');
  const [database, setDatabase] = useState('nt');
  const [evalue, setEvalue] = useState(10.0);
  const [maxHits, setMaxHits] = useState(50);
  const [results, setResults] = useState(null);
  const [expandedHit, setExpandedHit] = useState(null);
  const [minIdentityFilter, setMinIdentityFilter] = useState(0);
  const [maxEvalueFilter, setMaxEvalueFilter] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  const [runBlast, { loading, error }] = useMutation(RUN_BLAST, {
    onCompleted: (data) => {
      if (data.runBlast && data.runBlast.total_hits > 0) {
        setResults(data.runBlast);
        setCurrentPage(0);
      } else {
        setResults(data.runBlast);
      }
    }
  });

  const [clearCache] = useMutation(CLEAR_CACHE);

  const handleRunBlast = () => {
    if (!selectedSequence) {
      alert('Please select a sequence first');
      return;
    }

    if (!selectedSequence.sequence || selectedSequence.sequence.trim().length < 10) {
      alert('Sequence too short. Minimum 10 characters required.');
      return;
    }

    if (selectedSequence.sequence.length > 50000) {
      alert('Sequence too long. Maximum 50,000 characters allowed.');
      return;
    }

    setResults(null);
    runBlast({
      variables: {
        sequenceId: selectedSequence.id || 'query',
        sequence: selectedSequence.sequence,
        program,
        database,
        evalue: parseFloat(evalue),
        maxHits: parseInt(maxHits)
      }
    });
  };

  const getFilteredHits = () => {
    if (!results || !results.hits) return [];
    
    return results.hits.filter(hit => 
      hit.identity >= minIdentityFilter && hit.evalue <= maxEvalueFilter
    );
  };

  const getPaginatedHits = () => {
    const filtered = getFilteredHits();
    const start = currentPage * pageSize;
    return filtered.slice(start, start + pageSize);
  };

  const totalFilteredHits = getFilteredHits().length;
  const totalPages = Math.ceil(totalFilteredHits / pageSize);

  const formatEvalue = (value) => {
    if (value === 0) return '0.0';
    if (value < 0.0001) return value.toExponential(2);
    return value.toFixed(4);
  };

  const getIdentityColor = (identity) => {
    if (identity >= 90) return '#28a745';
    if (identity >= 70) return '#ffc107';
    return '#dc3545';
  };

  const handleClearCache = async (cacheType = 'all') => {
    try {
      await clearCache({ variables: { cacheType } });
      alert(`Cache cleared: ${cacheType}`);
    } catch (err) {
      console.error('Clear cache error:', err);
    }
  };

  const getDatabaseOptions = () => {
    const dbMap = {
      'blastn': [
        { value: 'nt', label: 'nt (Nucleotide collection)' },
        { value: 'nr', label: 'nr (Non-redundant)' },
        { value: 'refseq_rna', label: 'RefSeq RNA' },
        { value: 'refseq_genomic', label: 'RefSeq Genomic' },
        { value: 'est', label: 'EST' },
        { value: 'gss', label: 'GSS' },
        { value: 'wgs', label: 'WGS' }
      ],
      'blastp': [
        { value: 'nr', label: 'nr (Non-redundant)' },
        { value: 'refseq_protein', label: 'RefSeq Protein' },
        { value: 'swissprot', label: 'Swiss-Prot' },
        { value: 'pdb', label: 'PDB' },
        { value: 'pat', label: 'Pat' }
      ],
      'blastx': [
        { value: 'nr', label: 'nr (Non-redundant)' },
        { value: 'refseq_protein', label: 'RefSeq Protein' },
        { value: 'swissprot', label: 'Swiss-Prot' },
        { value: 'pdb', label: 'PDB' },
        { value: 'pat', label: 'Pat' }
      ],
      'tblastn': [
        { value: 'nt', label: 'nt (Nucleotide collection)' },
        { value: 'nr', label: 'nr (Non-redundant)' },
        { value: 'refseq_rna', label: 'RefSeq RNA' },
        { value: 'refseq_genomic', label: 'RefSeq Genomic' },
        { value: 'est', label: 'EST' },
        { value: 'gss', label: 'GSS' },
        { value: 'wgs', label: 'WGS' }
      ],
      'tblastx': [
        { value: 'nt', label: 'nt (Nucleotide collection)' },
        { value: 'nr', label: 'nr (Non-redundant)' },
        { value: 'est', label: 'EST' },
        { value: 'gss', label: 'GSS' },
        { value: 'wgs', label: 'WGS' }
      ]
    };
    return dbMap[program] || dbMap['blastn'];
  };

  const paginatedHits = getPaginatedHits();

  return (
    <div className="blast-section">
      {uploadedFileInfo && (
        <div className="file-summary">
          <h3>Upload Summary</h3>
          <p><strong>Status:</strong> {uploadedFileInfo.message}</p>
          <p><strong>Sequences found:</strong> {uploadedFileInfo.count}</p>
        </div>
      )}

      <div className="sequence-selector">
        <h3>Select Sequence for BLAST</h3>
        {sequences.length === 0 ? (
          <p className="no-sequences">No sequences loaded. Please upload a FASTA file first.</p>
        ) : (
          <div className="sequence-list">
            {sequences.map((seq, index) => (
              <div
                key={seq.id || index}
                className={`sequence-item ${selectedSequence?.id === seq.id ? 'selected' : ''}`}
                onClick={() => onSelectSequence(seq)}
              >
                <div className="sequence-header">
                  <strong>{seq.name}</strong>
                  <span className="sequence-length">{seq.length} bp</span>
                </div>
                <p className="sequence-description">{seq.description}</p>
                {seq.sequence && (
                  <p className="sequence-preview">
                    {seq.sequence.substring(0, 50)}
                    {seq.sequence.length > 50 ? '...' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedSequence && (
        <div className="blast-parameters">
          <h3>BLAST Parameters</h3>
          <div className="parameter-grid">
            <div className="parameter">
              <label htmlFor="program">Program</label>
              <select
                id="program"
                value={program}
                onChange={(e) => {
                  setProgram(e.target.value);
                  setDatabase(e.target.value === 'blastn' ? 'nt' : 'nr');
                }}
              >
                <option value="blastn">blastn (Nucleotide vs Nucleotide)</option>
                <option value="blastp">blastp (Protein vs Protein)</option>
                <option value="blastx">blastx (Translated Nucleotide vs Protein)</option>
                <option value="tblastn">tblastn (Protein vs Translated Nucleotide)</option>
                <option value="tblastx">tblastx (Translated Nucleotide vs Translated Nucleotide)</option>
              </select>
            </div>

            <div className="parameter">
              <label htmlFor="database">Database</label>
              <select
                id="database"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
              >
                {getDatabaseOptions().map(db => (
                  <option key={db.value} value={db.value}>{db.label}</option>
                ))}
              </select>
            </div>

            <div className="parameter">
              <label htmlFor="evalue">E-value Threshold</label>
              <input
                type="number"
                id="evalue"
                value={evalue}
                onChange={(e) => setEvalue(e.target.value)}
                step="0.001"
                min="0"
                max="100"
              />
            </div>

            <div className="parameter">
              <label htmlFor="maxhits">Max Hits</label>
              <input
                type="number"
                id="maxhits"
                value={maxHits}
                onChange={(e) => setMaxHits(Math.min(1000, Math.max(1, parseInt(e.target.value) || 50)))}
                min="1"
                max="1000"
              />
            </div>
          </div>

          <div className="sequence-info">
            <p><strong>Selected:</strong> {selectedSequence.name}</p>
            <p><strong>Length:</strong> {selectedSequence.length} characters</p>
            <p><strong>Preview:</strong> {selectedSequence.sequence?.substring(0, 80)}...</p>
          </div>

          <button
            onClick={handleRunBlast}
            disabled={loading || sequences.length === 0}
            className="blast-button"
          >
            {loading ? 'Running BLAST... (This may take a while)' : 'Run BLAST'}
          </button>

          {error && (
            <div className="error-message">
              <strong>BLAST Error:</strong> {error.message}
              <p className="error-hint">
                Try: 
                <br />• Using a shorter sequence
                <br />• Reducing max_hits
                <br />• Checking your network connection
              </p>
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="blast-results">
          <h3>BLAST Results</h3>
          <div className="results-summary">
            <p><strong>Query:</strong> {results.query_sequence?.name || selectedSequence?.name}</p>
            <p><strong>Total Hits:</strong> {results.total_hits || 0}</p>
            <p><strong>Filtered Hits:</strong> {totalFilteredHits}</p>
            <p><strong>Execution Time:</strong> {results.execution_time} seconds</p>
          </div>

          <div className="results-filters">
            <h4>Filter Results</h4>
            <div className="filter-grid">
              <div className="filter-item">
                <label>Min Identity (%)</label>
                <input
                  type="number"
                  value={minIdentityFilter}
                  onChange={(e) => {
                    setMinIdentityFilter(parseFloat(e.target.value) || 0);
                    setCurrentPage(0);
                  }}
                  min="0"
                  max="100"
                  step="1"
                />
              </div>
              <div className="filter-item">
                <label>Max E-value</label>
                <input
                  type="number"
                  value={maxEvalueFilter}
                  onChange={(e) => {
                    setMaxEvalueFilter(parseFloat(e.target.value) || 10);
                    setCurrentPage(0);
                  }}
                  min="0"
                  step="0.001"
                />
              </div>
            </div>
          </div>

          {paginatedHits.length > 0 ? (
            <>
              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                  >
                    Previous
                  </button>
                  <span>Page {currentPage + 1} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage >= totalPages - 1}
                  >
                    Next
                  </button>
                </div>
              )}

              <div className="hits-table-container">
                <table className="hits-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subject</th>
                      <th>Identity</th>
                      <th>Alignment</th>
                      <th>E-value</th>
                      <th>Score</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHits.map((hit, index) => (
                      <React.Fragment key={index}>
                        <tr className={expandedHit === index ? 'expanded' : ''}>
                          <td>{currentPage * pageSize + index + 1}</td>
                          <td className="subject-cell">
                            <div className="subject-id">{hit.subject_id}</div>
                            <div className="subject-title">{hit.subject_title}</div>
                          </td>
                          <td>
                            <span style={{ color: getIdentityColor(hit.identity) }}>
                              {hit.identity.toFixed(2)}%
                            </span>
                          </td>
                          <td>{hit.alignment_length}</td>
                          <td>{formatEvalue(hit.evalue)}</td>
                          <td>{hit.bit_score}</td>
                          <td>
                            <button
                              onClick={() => setExpandedHit(expandedHit === index ? null : index)}
                              className="expand-button"
                            >
                              {expandedHit === index ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                        {expandedHit === index && (
                          <tr className="hit-details">
                            <td colSpan="7">
                              <div className="detail-grid">
                                <div><strong>Query ID:</strong> {hit.query_id}</div>
                                <div><strong>Mismatches:</strong> {hit.mismatches}</div>
                                <div><strong>Gap Opens:</strong> {hit.gap_opens}</div>
                                <div><strong>Query Range:</strong> {hit.q_start} - {hit.q_end}</div>
                                <div><strong>Subject Range:</strong> {hit.s_start} - {hit.s_end}</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="no-hits">
              {results.total_hits === 0 ? (
                <div>
                  <p>No significant hits found.</p>
                  <p className="suggestions">
                    Suggestions:
                    <br />• Try adjusting the E-value threshold
                    <br />• Use a different database
                    <br />• Verify your sequence format
                  </p>
                </div>
              ) : (
                <p>No hits match the current filters. Try adjusting min identity or max e-value.</p>
              )}
            </div>
          )}

          <div className="cache-management">
            <h4>Cache Management</h4>
            <div className="cache-buttons">
              <button onClick={() => handleClearCache('blast')} className="clear-cache-btn">
                Clear BLAST Cache
              </button>
              <button onClick={() => handleClearCache('fasta')} className="clear-cache-btn">
                Clear FASTA Cache
              </button>
              <button onClick={() => handleClearCache('all')} className="clear-cache-btn warning">
                Clear All Cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BlastAnalysis;
