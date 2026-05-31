import React, { useState } from 'react';
import BlochSphere from './BlochSphere';

const VisualizationPanel = ({ result, history, isLoading, error }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const allProbabilities = () => {
    if (!result || !result.probabilities) return {};
    if (history && history.length > 0 && currentStep < history.length) {
      return history[currentStep].probabilities;
    }
    return result.probabilities;
  };

  const allBlochVectors = () => {
    if (!result || !result.bloch_vectors) return [];
    if (history && history.length > 0 && currentStep < history.length) {
      return history[currentStep].bloch_vectors;
    }
    return result.bloch_vectors;
  };

  const handlePlay = () => {
    if (!history || history.length <= 1) return;
    
    setIsPlaying(true);
    setCurrentStep(0);
    
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= history.length) {
        clearInterval(interval);
        setIsPlaying(false);
        return;
      }
      setCurrentStep(step);
    }, 1000);
  };

  const handleStepForward = () => {
    if (history && currentStep < history.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepBackward = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
  };

  const probabilities = allProbabilities();
  const blochVectors = allBlochVectors();

  if (isLoading) {
    return (
      <div className="visualization-panel">
        <h3>量子态可视化</h3>
        <div className="loading">正在模拟量子计算...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="visualization-panel">
        <h3>量子态可视化</h3>
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="visualization-panel">
      <h3>量子态可视化</h3>
      
      {blochVectors.map((vector, index) => (
        <BlochSphere
          key={index}
          x={vector.x}
          y={vector.y}
          z={vector.z}
          qubitIndex={vector.qubit}
        />
      ))}

      <div className="state-info">
        <h4>量子态概率分布</h4>
        <div className="state-probabilities">
          {Object.entries(probabilities).map(([state, prob]) => (
            <div key={state} className="probability-item">
              <span className="probability-label">{state}</span>
              <div className="probability-bar">
                <div 
                  className="probability-fill"
                  style={{ width: `${prob * 100}%}
                />
              </div>
              <span className="probability-value">
                {(prob * 100).toFixed(1)}%
              </span>
            </div>
          ))}
          {Object.keys(probabilities).length === 0 && (
            <div className="probability-item">
              <span style={{ color: '#aaa' }}>
                |00>: 100%
              </span>
            </div>
          )}
        </div>
      </div>

      {history && history.length > 1 && (
        <div className="evolution-controls">
          <h4>量子态演化控制</h4>
          <div className="step-info">
            步骤 {currentStep + 1} / {history.length}
          </div>
          <div className="step-buttons">
            <button 
              className="btn btn-secondary" 
              onClick={handleReset}
              disabled={isPlaying || currentStep === 0}
            >
              重置
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleStepBackward}
              disabled={isPlaying || currentStep === 0}
            >
              上一步
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handlePlay}
              disabled={isPlaying}
            >
              {isPlaying ? '播放中...' : '播放'}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleStepForward}
              disabled={isPlaying || currentStep >= history.length - 1}
            >
              下一步
            </button>
          </div>
        </div>
      )}

      {blochVectors.length === 0 && (
        <div className="loading">
          点击"运行模拟"来查看量子态
        </div>
      )}
    </div>
  );
};

export default VisualizationPanel;
