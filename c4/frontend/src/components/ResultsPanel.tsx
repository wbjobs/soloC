import { ProteinData, SimulationResult } from '../types';
import { getAllResidues } from '../utils/pdbParser';
import { scoreToHex } from '../utils/colorMapping';

interface ResultsPanelProps {
  proteinData: ProteinData | null;
  stabilityScores: number[];
  simulationResult: SimulationResult | null;
  usingModel: boolean;
}

export default function ResultsPanel({
  proteinData,
  stabilityScores,
  simulationResult,
  usingModel
}: ResultsPanelProps) {
  if (!proteinData) return null;

  const residues = getAllResidues(proteinData);
  const avgScore = stabilityScores.length > 0
    ? stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length
    : 0;

  const minScore = stabilityScores.length > 0 ? Math.min(...stabilityScores) : 0;
  const maxScore = stabilityScores.length > 0 ? Math.max(...stabilityScores) : 0;

  const unstableResidues = residues.filter((_, i) => stabilityScores[i] < 0.4);
  const stableResidues = residues.filter((_, i) => stabilityScores[i] >= 0.7);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxHeight: '500px',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px'
        }}
      >
        <div
          style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
            Residues
          </div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {proteinData.numResidues}
          </div>
        </div>
        <div
          style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
            Atoms
          </div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {proteinData.numAtoms}
          </div>
        </div>
        <div
          style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
            Chains
          </div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {proteinData.numChains}
          </div>
        </div>
        <div
          style={{
            padding: '12px',
            background: `linear-gradient(135deg, ${scoreToHex(minScore)}20, ${scoreToHex(maxScore)}20)`,
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
            Avg Stability
          </div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {avgScore.toFixed(3)}
          </div>
        </div>
      </div>

      {!usingModel && (
        <div
          style={{
            padding: '10px',
            background: 'rgba(255, 170, 0, 0.1)',
            border: '1px solid rgba(255, 170, 0, 0.3)',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#ffaa00'
          }}
        >
          ⚠️ Model file not found. Using heuristic scoring for demonstration.
          Place model.onnx in public folder for real inference.
        </div>
      )}

      <div
        style={{
          padding: '12px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
          Stability Distribution
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#ff4444', marginBottom: '2px' }}>
              Unstable ({'<'}{' '}0.4)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {unstableResidues.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#ffaa00', marginBottom: '2px' }}>
              Moderate
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {residues.length - unstableResidues.length - stableResidues.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#4488ff', marginBottom: '2px' }}>
              Stable (≥ 0.7)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              {stableResidues.length}
            </div>
          </div>
        </div>
      </div>

      {simulationResult && (
        <div
          style={{
            padding: '12px',
            background: simulationResult.success
              ? 'rgba(68, 136, 255, 0.1)'
              : 'rgba(255, 68, 68, 0.1)',
            borderRadius: '8px',
            border: `1px solid ${simulationResult.success ? 'rgba(68, 136, 255, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
            Molecular Dynamics Simulation
          </div>
          {simulationResult.success ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>RMSD (Å)</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>
                  {simulationResult.rmsd.toFixed(3)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>ΔE (kcal/mol)</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>
                  {(simulationResult.final_energy - simulationResult.initial_energy).toFixed(1)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {simulationResult.message}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          padding: '12px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          maxHeight: '200px',
          overflowY: 'auto'
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
          Residue Details
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          {residues.slice(0, 30).map((residue, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.03)'
              }}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: scoreToHex(stabilityScores[index] || 0.5)
                }}
              />
              <span style={{ fontSize: '12px', flex: 1 }}>
                {residue.resName} {residue.resSeq}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>
                {(stabilityScores[index] || 0).toFixed(3)}
              </span>
            </div>
          ))}
          {residues.length > 30 && (
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', paddingTop: '4px' }}>
              ... and {residues.length - 30} more residues
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
