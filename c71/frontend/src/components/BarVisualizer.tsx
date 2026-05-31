import React, { useMemo } from 'react';
import { Note, Chord } from '../types';

interface BarVisualizerProps {
  notes: Note[];
  selectedBars: [number, number];
  onSelectBars: (start: number, end: number) => void;
  appliedChords?: { [bar: number]: Chord };
}

const BarVisualizer: React.FC<BarVisualizerProps> = ({
  notes,
  selectedBars,
  onSelectBars,
  appliedChords = {}
}) => {
  const notesPerBar = 4;
  const totalBars = Math.max(1, Math.ceil(notes.length / notesPerBar));

  const bars = useMemo(() => {
    const result = [];
    for (let i = 0; i < totalBars; i++) {
      const startIdx = i * notesPerBar;
      const endIdx = startIdx + notesPerBar;
      const barNotes = notes.slice(startIdx, endIdx);
      result.push({
        barIndex: i,
        notes: barNotes,
        hasChord: !!appliedChords[i],
        chord: appliedChords[i]
      });
    }
    return result;
  }, [notes, appliedChords, totalBars]);

  const [isSelecting, setIsSelecting] = React.useState(false);
  const [selectionStart, setSelectionStart] = React.useState(-1);

  const handleBarMouseDown = (barIndex: number) => {
    setIsSelecting(true);
    setSelectionStart(barIndex);
    onSelectBars(barIndex, barIndex);
  };

  const handleBarMouseEnter = (barIndex: number) => {
    if (isSelecting && selectionStart >= 0) {
      const start = Math.min(selectionStart, barIndex);
      const end = Math.max(selectionStart, barIndex);
      onSelectBars(start, end);
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(-1);
  };

  React.useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const isBarSelected = (barIndex: number): boolean => {
    return barIndex >= selectedBars[0] && barIndex <= selectedBars[1];
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
      <h3 className="text-xl font-semibold mb-4 text-white">🎹 小节视图</h3>
      <p className="text-sm text-gray-400 mb-4">点击并拖动选择多个小节，然后在下方应用和弦</p>

      <div className="flex flex-wrap gap-2">
        {bars.map((bar) => (
          <div
            key={bar.barIndex}
            onMouseDown={() => handleBarMouseDown(bar.barIndex)}
            onMouseEnter={() => handleBarMouseEnter(bar.barIndex)}
            className={`
              relative w-24 p-3 rounded-lg cursor-pointer transition-all border-2
              ${isBarSelected(bar.barIndex)
                ? 'border-indigo-500 bg-indigo-500/30'
                : bar.hasChord
                  ? 'border-green-500 bg-green-500/20'
                  : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
              }
            `}
          >
            <div className="text-xs text-gray-400 mb-2">
              第 {bar.barIndex + 1} 小节
            </div>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {bar.notes.length > 0 ? (
                bar.notes.slice(0, 4).map((note, idx) => (
                  <span
                    key={idx}
                    className="px-1 py-0.5 bg-gray-600 rounded text-xs text-white"
                  >
                    {note.pitch}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500">空</span>
              )}
            </div>

            {bar.chord && (
              <div className="mt-2 pt-2 border-t border-gray-600">
                <span className="px-2 py-1 bg-green-600 rounded text-xs text-white font-semibold">
                  {bar.chord.name}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedBars[0] === selectedBars[1] ? (
        <p className="mt-4 text-sm text-indigo-400">
          已选择：第 {selectedBars[0] + 1} 小节
        </p>
      ) : (
        <p className="mt-4 text-sm text-indigo-400">
          已选择：第 {selectedBars[0] + 1} - {selectedBars[1] + 1} 小节
        </p>
      )}
    </div>
  );
};

export default BarVisualizer;
