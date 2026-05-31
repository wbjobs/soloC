import { useState, useMemo } from 'react';
import { ProteinData, MutationResult } from '../types';
import { getAllResidues } from '../utils/pdbParser';
import {
  threeToOne,
  getAminoAcidName,
  formatMutation,
  getOriginalAndAvailableMutations,
  ALL_AMINO_ACIDS,
  computeMutationDeltaScore,
  runMutationAnalysis
} from '../utils/mutationTools';

interface MutationPanelProps {
  proteinData: ProteinData | null;
  stabilityScores: number[];
  pdbContent: string;
  onMutationComplete: (result: MutationResult) => void;
  onMutatedScores: (scores: number[]) => void;
  processingStage: string;
}

export default function MutationPanel({
  proteinData,
  stabilityScores,
  pdbContent,
  onMutationComplete,
  onMutatedScores,
  processingStage
}: MutationPanelProps) {
  const [selectedResidueIndex, setSelectedResidueIndex] = useState<number>(-1);
  const [selectedTargetAA, setSelectedTargetAA] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string>('');

  const residues = useMemo(() => {
    if (!proteinData) return [];
    return getAllResidues(proteinData);
  }, [proteinData]);

  const selectedResidue = useMemo(() => {
    if (selectedResidueIndex < 0 || selectedResidueIndex >= residues.length) {
      return null;
    }
    return residues[selectedResidueIndex];
  }, [residues, selectedResidueIndex]);

  const availableMutations = useMemo(() => {
    if (!selectedResidue) return null;
    return getOriginalAndAvailableMutations(selectedResidue.resName);
  }, [selectedResidue]);

  const handleResidueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    setSelectedResidueIndex(idx);
    setSelectedTargetAA('');
    setAnalysisError('');
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTargetAA(e.target.value);
    setAnalysisError('');
  };

  const canAnalyze = selectedResidueIndex >= 0 && selectedTargetAA && !isAnalyzing;

  const handleRunMutation = async () => {
    if (!proteinData || !selectedResidue || !selectedTargetAA) return;

    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const deltaResult = await computeMutationDeltaScore(
        proteinData,
        stabilityScores,
        selectedResidueIndex,
        selectedTargetAA
      );

      if (!deltaResult) {
        setAnalysisError('Failed to compute mutation effect');
        return;
      }

      onMutatedScores(deltaResult.mutatedScores);

      const backendResult = await runMutationAnalysis(
        pdbContent,
        selectedResidueIndex,
        selectedResidue.resName,
        selectedTargetAA
      );

      const mutationResult: MutationResult = {
        residueIndex: selectedResidueIndex,
        originalResName: selectedResidue.resName,
        mutatedResName: selectedTargetAA,
        originalScore: stabilityScores[selectedResidueIndex] ?? 0.5,
        mutatedScore: deltaResult.mutatedScore,
        deltaScore: deltaResult.deltaScore,
        energyLandscapeUrl: backendResult.success ? backendResult.energyLandscapeUrl : undefined,
        isStabilizing: deltaResult.deltaScore > 0,
        confidence: deltaResult.usingModel ? 0.9 : 0.5
      };

      onMutationComplete(mutationResult);
    } catch (error) {
      setAnalysisError(`Error: ${(error as Error).message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!proteinData) return null;

  return (
    <div
      style={{
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
        🧬 Mutation Simulation
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
            Select Residue
          </div>
          <select
            value={selectedResidueIndex}
            onChange={handleResidueChange}
            disabled={isAnalyzing}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <option value={-1}>-- Select a residue --</option>
            {residues.map((res, idx) => (
              <option key={idx} value={idx}>
                {threeToOne(res.resName)}{res.resSeq} ({getAminoAcidName(res.resName)})
                {' - '}Score: {(stabilityScores[idx] ?? 0.5).toFixed(3)}
              </option>
            ))}
          </select>
        </div>

        {selectedResidue && (
          <div
            style={{
              padding: '8px',
              background: 'rgba(68, 136, 255, 0.1)',
              borderRadius: '6px',
              fontSize: '11px'
            }}
          >
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Original: </span>
              <span style={{ fontWeight: 600 }}>
                {formatMutation(selectedResidue.resName, selectedResidue.resSeq, selectedResidue.resName)}
                {' '}({getAminoAcidName(selectedResidue.resName)})
              </span>
            </div>
            <div>
              <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Stability Score: </span>
              <span style={{ fontWeight: 600 }}>
                {(stabilityScores[selectedResidueIndex] ?? 0.5).toFixed(4)}
              </span>
            </div>
          </div>
        )}

        {availableMutations && (
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
              Mutate To
            </div>
            <select
              value={selectedTargetAA}
              onChange={handleTargetChange}
              disabled={isAnalyzing}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <option value="">-- Select target amino acid --</option>
              {ALL_AMINO_ACIDS.filter(aa => aa !== selectedResidue?.resName).map(aa => (
                <option key={aa} value={aa}>
                  {threeToOne(aa)} - {getAminoAcidName(aa)}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedResidue && selectedTargetAA && (
          <div
            style={{
              padding: '8px',
              background: 'rgba(136, 68, 255, 0.1)',
              borderRadius: '6px',
              fontSize: '12px',
              textAlign: 'center'
            }}
          >
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Mutation: </span>
            <span style={{ fontWeight: 600, color: '#8844ff' }}>
              {formatMutation(selectedResidue.resName, selectedResidue.resSeq, selectedTargetAA)}
            </span>
          </div>
        )}

        <button
          onClick={handleRunMutation}
          disabled={!canAnalyze || processingStage === 'mutating'}
          style={{
            width: '100%',
            padding: '10px 20px',
            background: (!canAnalyze || processingStage === 'mutating')
              ? 'rgba(255, 255, 255, 0.1)'
              : 'linear-gradient(135deg, #ff44aa 0%, #aa44ff 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '13px',
            fontWeight: 500,
            cursor: (!canAnalyze || processingStage === 'mutating') ? 'not-allowed' : 'pointer',
            opacity: (!canAnalyze || processingStage === 'mutating') ? 0.5 : 1,
            marginTop: '4px'
          }}
        >
          {isAnalyzing || processingStage === 'mutating'
            ? '⏳ Analyzing Mutation...'
            : '🔬 Predict Mutation Effect'
          }
        </button>

        {analysisError && (
          <div
            style={{
              padding: '8px',
              background: 'rgba(255, 68, 68, 0.1)',
              border: '1px solid rgba(255, 68, 68, 0.3)',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#ff4444'
            }}
          >
            ⚠️ {analysisError}
          </div>
        )}
      </div>
    </div>
  );
}
