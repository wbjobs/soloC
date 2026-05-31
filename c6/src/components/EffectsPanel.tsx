import React, { useState, useEffect } from "react";
import { RoutingConfig } from "../types";

interface EffectsPanelProps {
  routing: RoutingConfig;
  onGainChange: (gain: number) => void;
  onLowpassChange: (cutoff: number) => void;
  disabled: boolean;
}

const EffectsPanel: React.FC<EffectsPanelProps> = ({
  routing,
  onGainChange,
  onLowpassChange,
  disabled,
}) => {
  const [gain, setGain] = useState(routing.gain);
  const [lowpass, setLowpass] = useState(routing.lowpass_cutoff);

  useEffect(() => {
    setGain(routing.gain);
    setLowpass(routing.lowpass_cutoff);
  }, [routing.gain, routing.lowpass_cutoff]);

  const handleGainChange = (value: number) => {
    setGain(value);
    onGainChange(value);
  };

  const handleLowpassChange = (value: number) => {
    setLowpass(value);
    onLowpassChange(value);
  };

  const gainDb = 20 * Math.log10(Math.max(gain, 0.0001));

  return (
    <div className="effects-panel">
      <div className="effect-item">
        <span className="effect-name">增益</span>
        <input
          type="range"
          className="effect-slider"
          min="0"
          max="2"
          step="0.01"
          value={gain}
          onChange={(e) => handleGainChange(Number(e.target.value))}
          disabled={disabled}
        />
        <span className="effect-value">
          {gain.toFixed(2)}x ({gainDb.toFixed(1)} dB)
        </span>
      </div>

      <div className="effect-item">
        <span className="effect-name">低通滤波</span>
        <input
          type="range"
          className="effect-slider"
          min="20"
          max="20000"
          step="10"
          value={lowpass}
          onChange={(e) => handleLowpassChange(Number(e.target.value))}
          disabled={disabled}
        />
        <span className="effect-value">
          {lowpass >= 20000 ? "关闭" : `${lowpass} Hz`}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.5rem",
          marginTop: "0.5rem",
        }}
      >
        <button
          className="button button-secondary"
          onClick={() => handleGainChange(0.5)}
          disabled={disabled}
        >
          -6dB
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleGainChange(1.0)}
          disabled={disabled}
        >
          0dB
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleGainChange(1.414)}
          disabled={disabled}
        >
          +3dB
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleGainChange(2.0)}
          disabled={disabled}
        >
          +6dB
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.5rem",
        }}
      >
        <button
          className="button button-secondary"
          onClick={() => handleLowpassChange(1000)}
          disabled={disabled}
        >
          1kHz
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleLowpassChange(4000)}
          disabled={disabled}
        >
          4kHz
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleLowpassChange(8000)}
          disabled={disabled}
        >
          8kHz
        </button>
        <button
          className="button button-secondary"
          onClick={() => handleLowpassChange(20000)}
          disabled={disabled}
        >
          全通
        </button>
      </div>
    </div>
  );
};

export default EffectsPanel;
