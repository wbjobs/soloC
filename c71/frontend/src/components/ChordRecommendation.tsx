import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Note, ChordProgression, Style } from '../types';
import { generateChordProgression, playChordProgression, detectKey } from '../utils/musicTheory';

interface ChordRecommendationProps {
  notes: Note[];
  currentStyle: Style;
  onApplyProgression: (progression: ChordProgression) => void;
}

const ChordRecommendation: React.FC<ChordRecommendationProps> = ({
  notes,
  currentStyle,
  onApplyProgression
}) => {
  const [recommendations, setRecommendations] = useState<ChordProgression[]>([]);
  const [selectedProgression, setSelectedProgression] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [detectedKey, setDetectedKey] = useState<string>('C');
  const [startBar, setStartBar] = useState(0);
  const [endBar, setEndBar] = useState(3);
  
  const stopFunctionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (notes.length > 0) {
      const key = detectKey(notes);
      setDetectedKey(key);
      generateRecommendations(key);
    } else {
      generateRecommendations('C');
    }
  }, [notes, currentStyle]);

  const generateRecommendations = useCallback((key: string) => {
    const numChords = Math.max(1, Math.min(4, endBar - startBar + 1));
    const progs = generateChordProgression(key, currentStyle, numChords);
    setRecommendations(progs);
  }, [currentStyle, startBar, endBar]);

  const handlePreview = async (progression: ChordProgression) => {
    if (stopFunctionRef.current) {
      stopFunctionRef.current();
      stopFunctionRef.current = null;
    }

    if (playingId === progression.id) {
      setPlayingId(null);
      return;
    }

    setPlayingId(progression.id);
    const stopFn = await playChordProgression(progression, 120);
    stopFunctionRef.current = stopFn;

    const duration = progression.chords.length * 500 + 500;
    setTimeout(() => {
      setPlayingId(null);
      stopFunctionRef.current = null;
    }, duration);
  };

  const handleApply = (progression: ChordProgression) => {
    setSelectedProgression(progression.id);
    onApplyProgression(progression);
  };

  const stopPreview = () => {
    if (stopFunctionRef.current) {
      stopFunctionRef.current();
      stopFunctionRef.current = null;
    }
    setPlayingId(null);
  };

  useEffect(() => {
    return () => {
      if (stopFunctionRef.current) {
        stopFunctionRef.current();
      }
    };
  }, []);

  const totalBars = Math.max(1, Math.ceil(notes.length / 4));

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
      <h3 className="text-xl font-semibold mb-4 text-white">🎵 智能和弦推荐</h3>
      
      <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-sm text-gray-400">检测到的调：</span>
            <span className="ml-2 text-lg font-bold text-indigo-400">{detectedKey} 大调</span>
          </div>
          <div className="text-sm text-gray-400">
            旋律共 {totalBars} 小节
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-300">
            开始小节：
            <input
              type="number"
              min={0}
              max={Math.max(0, totalBars - 1)}
              value={startBar}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setStartBar(val);
                if (val > endBar) setEndBar(val);
              }}
              className="ml-2 w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white"
            />
          </label>
          <label className="text-sm text-gray-300">
            结束小节：
            <input
              type="number"
              min={startBar}
              max={totalBars - 1}
              value={endBar}
              onChange={(e) => setEndBar(parseInt(e.target.value))}
              className="ml-2 w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white"
            />
          </label>
          <span className="text-sm text-gray-400">
            选择 {startBar + 1} - {endBar + 1} 小节
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-lg font-medium text-gray-200">推荐和弦进行：</h4>
        
        {recommendations.map((progression) => (
          <div
            key={progression.id}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedProgression === progression.id
                ? 'border-indigo-500 bg-indigo-500/20'
                : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h5 className="font-semibold text-white">{progression.name}</h5>
                <p className="text-sm text-gray-400">{progression.description}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePreview(progression)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    playingId === progression.id
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {playingId === progression.id ? '⏹ 停止' : '▶ 试听'}
                </button>
                <button
                  onClick={() => handleApply(progression)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                >
                  ✓ 应用
                </button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {progression.chords.map((chord, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 bg-gray-600 rounded-lg text-center min-w-16"
                >
                  <div className="font-semibold text-white">{chord.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {chord.notes.join(' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {playingId && (
        <div className="mt-4 flex items-center justify-center gap-2 text-green-400">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
          <span>正在播放预览...</span>
          <button
            onClick={stopPreview}
            className="ml-2 text-red-400 hover:text-red-300 underline"
          >
            停止
          </button>
        </div>
      )}
    </div>
  );
};

export default ChordRecommendation;
