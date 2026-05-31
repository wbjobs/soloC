import { useState, useCallback, useRef } from 'react';
import Visualizer from './components/Visualizer';
import ResultsPanel from './components/ResultsPanel';
import MutationPanel from './components/MutationPanel';
import ColorBar from './components/ColorBar';
import { ProteinData, SimulationResult, ProcessingState, MutationResult } from './types';
import { parsePDB } from './utils/pdbParser';
import { predictStability, runSimulation } from './utils/modelInference';
import { formatMutation } from './utils/mutationTools';

const SAMPLE_PDB = `REMARK   Generated sample protein structure
ATOM      1  N   MET A   1       0.000   0.000   0.000  1.00 20.00           N
ATOM      2  CA  MET A   1       1.460   0.000   0.000  1.00 20.00           C
ATOM      3  C   MET A   1       2.000   1.420   0.000  1.00 20.00           C
ATOM      4  O   MET A   1       1.320   2.470   0.000  1.00 20.00           O
ATOM      5  CB  MET A   1       2.000  -0.710  -1.290  1.00 20.00           C
ATOM      6  N   LEU A   2       3.300   1.570   0.000  1.00 20.00           N
ATOM      7  CA  LEU A   2       3.920   2.900   0.000  1.00 20.00           C
ATOM      8  C   LEU A   2       5.410   2.900   0.000  1.00 20.00           C
ATOM      9  O   LEU A   2       6.140   1.960   0.000  1.00 20.00           O
ATOM     10  CB  LEU A   2       3.400   3.710  -1.220  1.00 20.00           C
ATOM     11  N   LYS A   3       5.890   4.100   0.000  1.00 20.00           N
ATOM     12  CA  LYS A   3       7.290   4.280   0.000  1.00 20.00           C
ATOM     13  C   LYS A   3       7.870   4.970   1.280  1.00 20.00           C
ATOM     14  O   LYS A   3       7.240   5.910   1.760  1.00 20.00           O
ATOM     15  CB  LYS A   3       7.970   4.860  -1.250  1.00 20.00           C
ATOM     16  N   GLY A   4       9.010   4.480   1.910  1.00 20.00           N
ATOM     17  CA  GLY A   4       9.670   5.100   3.090  1.00 20.00           C
ATOM     18  C   GLY A   4      11.140   5.320   2.850  1.00 20.00           C
ATOM     19  O   GLY A   4      11.840   5.930   3.630  1.00 20.00           O
ATOM     20  N   ARG A   5      11.620   4.900   1.680  1.00 20.00           N
ATOM     21  CA  ARG A   5      12.980   5.060   1.160  1.00 20.00           C
ATOM     22  C   ARG A   5      13.390   6.480   0.730  1.00 20.00           C
ATOM     23  O   ARG A   5      12.770   7.380   1.120  1.00 20.00           O
ATOM     24  CB  ARG A   5      13.860   4.210   0.160  1.00 20.00           C
ATOM     25  N   GLU A   6      14.680   6.660  -0.090  1.00 20.00           N
ATOM     26  CA  GLU A   6      15.150   8.000  -0.560  1.00 20.00           C
ATOM     27  C   GLU A   6      16.600   8.150  -0.310  1.00 20.00           C
ATOM     28  O   GLU A   6      17.400   7.330  -0.610  1.00 20.00           O
ATOM     29  CB  GLU A   6      14.640   8.800  -1.770  1.00 20.00           C
ATOM     30  N   TYR A   7      16.890   9.350   0.250  1.00 20.00           N
ATOM     31  CA  TYR A   7      18.230   9.570   0.710  1.00 20.00           C
ATOM     32  C   TYR A   7      18.860  10.870   0.210  1.00 20.00           C
ATOM     33  O   TYR A   7      18.350  11.910   0.670  1.00 20.00           O
ATOM     34  CB  TYR A   7      18.140   9.620   2.260  1.00 20.00           C
ATOM     35  N   SER A   8      20.130  10.880  -0.640  1.00 20.00           N
ATOM     36  CA  SER A   8      20.860  12.090  -1.090  1.00 20.00           C
ATOM     37  C   SER A   8      22.300  11.990  -0.680  1.00 20.00           C
ATOM     38  O   SER A   8      23.050  11.010  -0.940  1.00 20.00           O
ATOM     39  CB  SER A   8      20.670  12.250  -2.610  1.00 20.00           C
ATOM     40  N   VAL A   9      22.630  12.990   0.150  1.00 20.00           N
ATOM     41  CA  VAL A   9      23.950  13.060   0.670  1.00 20.00           C
ATOM     42  C   VAL A   9      24.650  14.380   0.230  1.00 20.00           C
ATOM     43  O   VAL A   9      24.170  15.310   0.830  1.00 20.00           O
ATOM     44  CB  VAL A   9      23.990  13.000   2.230  1.00 20.00           C
ATOM     45  N   PHE A  10      25.860  14.450  -0.670  1.00 20.00           N
ATOM     46  CA  PHE A  10      26.620  15.640  -1.120  1.00 20.00           C
ATOM     47  C   PHE A  10      28.000  15.540  -0.510  1.00 20.00           C
ATOM     48  O   PHE A  10      28.740  14.550  -0.630  1.00 20.00           O
ATOM     49  CB  PHE A  10      26.590  15.700  -2.680  1.00 20.00           C
TER
END
`;

export default function App() {
  const [proteinData, setProteinData] = useState<ProteinData | null>(null);
  const [pdbContent, setPdbContent] = useState<string>('');
  const [stabilityScores, setStabilityScores] = useState<number[]>([]);
  const [usingModel, setUsingModel] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    stage: 'idle',
    message: '',
    progress: 0
  });
  const [showAtoms, setShowAtoms] = useState<boolean>(true);
  const [showBackbone, setShowBackbone] = useState<boolean>(true);
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [mutationResult, setMutationResult] = useState<MutationResult | null>(null);
  const [mutatedScores, setMutatedScores] = useState<number[]>([]);
  const [displayMutatedScores, setDisplayMutatedScores] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      await processPDB(content);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = async () => {
    await processPDB(SAMPLE_PDB);
  };

  const processPDB = async (content: string) => {
    setPdbContent(content);
    setSimulationResult(null);
    setStabilityScores([]);
    setMutationResult(null);
    setMutatedScores([]);
    setDisplayMutatedScores(false);

    setProcessingState({
      stage: 'parsing',
      message: 'Parsing PDB file...',
      progress: 10
    });

    await new Promise(r => setTimeout(r, 300));

    try {
      const parsed = parsePDB(content);
      setProteinData(parsed);

      if (parsed.numResidues === 0) {
        setProcessingState({
          stage: 'error',
          message: 'No residues found in PDB file',
          progress: 0
        });
        return;
      }

      setProcessingState({
        stage: 'predicting',
        message: 'Running AI stability prediction...',
        progress: 40
      });

      const predictionResult = await predictStability(parsed);
      setStabilityScores(predictionResult.scores);
      setUsingModel(predictionResult.usingModel);

      setProcessingState({
        stage: 'visualizing',
        message: 'Rendering 3D visualization...',
        progress: 70
      });

      await new Promise(r => setTimeout(r, 500));

      setProcessingState({
        stage: 'complete',
        message: 'Ready',
        progress: 100
      });

    } catch (error) {
      setProcessingState({
        stage: 'error',
        message: `Error: ${(error as Error).message}`,
        progress: 0
      });
    }
  };

  const handleRunSimulation = async () => {
    if (!pdbContent || !proteinData) return;

    setProcessingState({
      stage: 'simulating',
      message: 'Running molecular dynamics simulation...',
      progress: 50
    });

    const result = await runSimulation(pdbContent, 100);
    setSimulationResult(result);

    if (result.success) {
      setProcessingState({
        stage: 'complete',
        message: 'Simulation completed',
        progress: 100
      });
    } else {
      setProcessingState({
        stage: 'error',
        message: result.message || 'Simulation failed',
        progress: 0
      });
    }
  };

  const handleWebGPUSupport = useCallback((supported: boolean) => {
    setWebGPUSupported(supported);
  }, []);

  const handleMutationComplete = (result: MutationResult) => {
    setMutationResult(result);
    setDisplayMutatedScores(true);
    setProcessingState({
      stage: 'complete',
      message: 'Mutation analysis complete',
      progress: 100
    });
  };

  const handleMutatedScores = (scores: number[]) => {
    setMutatedScores(scores);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)'
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4488ff 0%, #8844ff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 'bold'
            }}
          >
            🧬
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>
              AI Protein Fold Stability Predictor
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
              GNN-based Stability Analysis with WebGPU Acceleration
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              padding: '6px 12px',
              background: webGPUSupported
                ? 'rgba(68, 255, 136, 0.1)'
                : 'rgba(255, 170, 68, 0.1)',
              border: `1px solid ${webGPUSupported ? 'rgba(68, 255, 136, 0.3)' : 'rgba(255, 170, 68, 0.3)'}`,
              borderRadius: '6px',
              fontSize: '12px',
              color: webGPUSupported ? '#44ff88' : '#ffaa44'
            }}
          >
            {webGPUSupported ? '✓ WebGPU Available' : 'WebGL Mode'}
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          style={{
            width: '320px',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
            background: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
              Upload Protein
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdb"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #4488ff 0%, #8844ff 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'transform 0.2s, opacity 0.2s'
                }}
              >
                📁 Upload PDB File
              </button>
              <button
                onClick={handleLoadSample}
                style={{
                  padding: '10px 20px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                🔬 Load Sample Protein
              </button>
            </div>
          </div>

          {(processingState.stage !== 'idle' && processingState.stage !== 'complete' && processingState.stage !== 'error') && (
            <div
              style={{
                padding: '12px',
                background: 'rgba(68, 136, 255, 0.1)',
                border: '1px solid rgba(68, 136, 255, 0.3)',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                {processingState.message}
              </div>
              <div
                style={{
                  height: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${processingState.progress}%`,
                    background: 'linear-gradient(90deg, #4488ff, #8844ff)',
                    transition: 'width 0.3s'
                  }}
                />
              </div>
            </div>
          )}

          {processingState.stage === 'error' && (
            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 68, 68, 0.1)',
                border: '1px solid rgba(255, 68, 68, 0.3)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#ff4444'
              }}
            >
              ⚠️ {processingState.message}
            </div>
          )}

          {proteinData && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                Display Options
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showAtoms}
                    onChange={(e) => setShowAtoms(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Show Atoms
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showBackbone}
                    onChange={(e) => setShowBackbone(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Show Backbone (Cα Trace)
                </label>
              </div>
            </div>
          )}

          {proteinData && (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                Molecular Dynamics
              </div>
              <button
                onClick={handleRunSimulation}
                disabled={processingState.stage === 'simulating'}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  background: processingState.stage === 'simulating'
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'linear-gradient(135deg, #44ff88 0%, #4488ff 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: processingState.stage === 'simulating' ? 'not-allowed' : 'pointer',
                  opacity: processingState.stage === 'simulating' ? 0.5 : 1
                }}
              >
                {processingState.stage === 'simulating' ? '⏳ Running Simulation...' : '⚡ Run Energy Minimization'}
              </button>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '6px' }}>
                100 steps with OpenMM | Returns RMSD value
              </div>
            </div>
          )}

          {proteinData && (
            <MutationPanel
              proteinData={proteinData}
              stabilityScores={stabilityScores}
              pdbContent={pdbContent}
              onMutationComplete={handleMutationComplete}
              onMutatedScores={handleMutatedScores}
              processingStage={processingState.stage}
            />
          )}

          {proteinData && (
            <ColorBar />
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, padding: '16px', minWidth: 0, minHeight: 0 }}>
            {!proteinData ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '24px',
                  color: 'rgba(255, 255, 255, 0.5)',
                  textAlign: 'center',
                  padding: '40px'
                }}
              >
                <div style={{ fontSize: '80px' }}>🧬</div>
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: 'white' }}>
                    Upload a Protein Structure
                  </div>
                  <div style={{ fontSize: '14px', maxWidth: '400px', lineHeight: 1.6 }}>
                    Upload a .pdb file to analyze protein fold stability using our AI model.
                    The tool will predict stability scores for each residue and visualize the
                    structure with color-coded stability mapping.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    { icon: '🤖', title: 'GNN Model', desc: 'Graph Neural Network via ONNX Runtime' },
                    { icon: '🎨', title: '3D Visualization', desc: 'Interactive WebGPU-accelerated rendering' },
                    { icon: '⚛️', title: 'MD Simulation', desc: 'OpenMM energy minimization & RMSD' }
                  ].map((feature, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '16px 20px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        minWidth: '160px'
                      }}
                    >
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{feature.icon}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>
                        {feature.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
                        {feature.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Visualizer
                proteinData={proteinData}
                stabilityScores={displayMutatedScores && mutatedScores.length > 0 ? mutatedScores : stabilityScores}
                showAtoms={showAtoms}
                showBackbone={showBackbone}
                webGPUSupported={handleWebGPUSupport}
              />
            )}
          </div>

          {proteinData && (
            <div
              style={{
                width: '320px',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '16px',
                overflowY: 'auto',
                background: 'rgba(0, 0, 0, 0.2)'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>
                Analysis Results
              </div>

              {mutationResult && (
                <div
                  style={{
                    padding: '12px',
                    background: mutationResult.isStabilizing
                      ? 'rgba(68, 255, 136, 0.1)'
                      : 'rgba(255, 136, 68, 0.1)',
                    borderRadius: '8px',
                    border: `1px solid ${mutationResult.isStabilizing ? 'rgba(68, 255, 136, 0.3)' : 'rgba(255, 136, 68, 0.3)'}`,
                    marginBottom: '16px'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    🧬 Mutation Analysis Result
                  </div>
                  
                  <div
                    style={{
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '6px',
                      marginBottom: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      textAlign: 'center',
                      color: '#aa44ff'
                    }}
                  >
                    {formatMutation(
                      mutationResult.originalResName,
                      (proteinData.chains.flatMap(c => c.residues)[mutationResult.residueIndex]?.resSeq) || (mutationResult.residueIndex + 1),
                      mutationResult.mutatedResName
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>Original Score</div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>
                        {mutationResult.originalScore.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>Mutated Score</div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>
                        {mutationResult.mutatedScore.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '8px',
                      background: mutationResult.isStabilizing
                        ? 'rgba(68, 255, 136, 0.15)'
                        : 'rgba(255, 136, 68, 0.15)',
                      borderRadius: '6px',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2px' }}>
                      ΔScore (Stability Change)
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: mutationResult.isStabilizing ? '#44ff88' : '#ff8844'
                      }}
                    >
                      {mutationResult.deltaScore >= 0 ? '+' : ''}{mutationResult.deltaScore.toFixed(4)}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '4px' }}>
                      {mutationResult.isStabilizing ? '✅ Stabilizing Mutation' : '⚠️ Destabilizing Mutation'}
                    </div>
                  </div>

                  {mutationResult.energyLandscapeUrl && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '4px' }}>
                        Energy Landscape
                      </div>
                      <img
                        src={mutationResult.energyLandscapeUrl}
                        alt="Energy Landscape"
                        style={{
                          width: '100%',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setDisplayMutatedScores(!displayMutatedScores);
                    }}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '8px 12px',
                      background: displayMutatedScores
                        ? 'rgba(136, 68, 255, 0.3)'
                        : 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(136, 68, 255, 0.3)',
                      borderRadius: '6px',
                      color: displayMutatedScores ? '#ffffff' : '#aa44ff',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    {displayMutatedScores ? '🔄 Show Original Scores' : '🔄 Show Mutated Scores'}
                  </button>
                </div>
              )}

              <ResultsPanel
                proteinData={proteinData}
                stabilityScores={displayMutatedScores && mutatedScores.length > 0 ? mutatedScores : stabilityScores}
                simulationResult={simulationResult}
                usingModel={usingModel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
