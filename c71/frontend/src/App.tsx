import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Note, Composition, Style, Chord, ChordProgression } from './types';
import WaveformVisualizer from './components/WaveformVisualizer';
import MidiInput from './components/MidiInput';
import StyleSelector from './components/StyleSelector';
import CompositionList from './components/CompositionList';
import BarVisualizer from './components/BarVisualizer';
import ChordRecommendation from './components/ChordRecommendation';
import { generateAccompaniment, getCompositions } from './services/api';

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<Style>('pop');
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [title, setTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [selectedBars, setSelectedBars] = useState<[number, number]>([0, 3]);
  const [appliedChords, setAppliedChords] = useState<{ [bar: number]: Chord }>({});
  const [showChordPanel, setShowChordPanel] = useState(false);
  
  const pendingNotesRef = useRef<Note[]>([]);
  const isFlushingRef = useRef(false);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastNoteTimeRef = useRef<number>(0);
  const lostNotesCountRef = useRef<number>(0);
  const totalNotesCountRef = useRef<number>(0);

  useEffect(() => {
    loadCompositions();
  }, []);

  const loadCompositions = async () => {
    try {
      const data = await getCompositions();
      setCompositions(data);
    } catch (err) {
      setError('加载历史作品失败');
    }
  };

  const handleGenerate = async () => {
    if (notes.length === 0) {
      setError('请先录制一些音符');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const compositionTitle = title || `作品 ${Date.now()}`;
      await generateAccompaniment(notes, selectedStyle, compositionTitle);
      await loadCompositions();
      setNotes([]);
      setTitle('');
    } catch (err) {
      setError('生成伴奏失败，请确保后端服务已启动');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearNotes = () => {
    setNotes([]);
    setAppliedChords({});
    pendingNotesRef.current = [];
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  };

  const handleApplyProgression = useCallback((progression: ChordProgression) => {
    const newAppliedChords = { ...appliedChords };
    let chordIdx = 0;
    
    for (let bar = selectedBars[0]; bar <= selectedBars[1]; bar++) {
      if (chordIdx < progression.chords.length) {
        newAppliedChords[bar] = progression.chords[chordIdx];
        chordIdx++;
      }
    }
    
    setAppliedChords(newAppliedChords);
  }, [selectedBars, appliedChords]);

  const flushPendingNotes = useCallback(() => {
    if (pendingNotesRef.current.length === 0) {
      isFlushingRef.current = false;
      animationFrameIdRef.current = null;
      return;
    }
    
    const newNotes = pendingNotesRef.current.splice(0, pendingNotesRef.current.length);
    setNotes(prevNotes => [...prevNotes, ...newNotes]);
    
    isFlushingRef.current = false;
    animationFrameIdRef.current = null;
  }, []);

  const handleAddNote = useCallback((newNotes: Note[]) => {
    if (newNotes.length === 0) return;
    
    const now = performance.now();
    totalNotesCountRef.current += newNotes.length;
    
    if (lastNoteTimeRef.current > 0 && now - lastNoteTimeRef.current > 500) {
      if (pendingNotesRef.current.length > 0) {
        lostNotesCountRef.current += pendingNotesRef.current.length;
        console.warn(`可能丢失了 ${pendingNotesRef.current.length} 个音符`);
      }
    }
    lastNoteTimeRef.current = now;
    
    pendingNotesRef.current.push(...newNotes);
    
    if (!isFlushingRef.current && !animationFrameIdRef.current) {
      isFlushingRef.current = true;
      animationFrameIdRef.current = requestAnimationFrame(flushPendingNotes);
    }
  }, [flushPendingNotes]);

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          MIDI 音乐伴奏生成器
        </h1>
        <p className="text-center text-gray-400 mb-8">
          使用 MIDI 键盘输入主旋律，自动生成钢琴、贝斯、鼓三轨伴奏
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">录音控制</h3>
              <button
                onClick={() => setIsRecording(!isRecording)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors
                  ${isRecording
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                  }
                `}
              >
                {isRecording ? '停止录音' : '开始录音'}
              </button>
            </div>
            <WaveformVisualizer isRecording={isRecording} />
          </div>

          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <MidiInput notes={notes} onNoteChange={handleAddNote} />
          </div>

          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <StyleSelector
              selectedStyle={selectedStyle}
              onStyleChange={setSelectedStyle}
            />
          </div>

          {notes.length > 0 && (
            <>
              <BarVisualizer
                notes={notes}
                selectedBars={selectedBars}
                onSelectBars={(start, end) => setSelectedBars([start, end])}
                appliedChords={appliedChords}
              />

              <div className="text-center">
                <button
                  onClick={() => setShowChordPanel(!showChordPanel)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg font-semibold transition-all"
                >
                  {showChordPanel ? '隐藏和弦推荐' : '🎵 智能和弦推荐'}
                </button>
              </div>

              {showChordPanel && (
                <ChordRecommendation
                  notes={notes}
                  currentStyle={selectedStyle}
                  onApplyProgression={handleApplyProgression}
                />
              )}
            </>
          )}

          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="flex gap-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="作品名称（可选）"
                className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleClearNotes}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
              >
                清除音符
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || notes.length === 0}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? '生成中...' : '生成伴奏'}
              </button>
            </div>
          </div>

          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700">
            <CompositionList
              compositions={compositions}
              onDelete={loadCompositions}
            />
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-sm text-gray-500 hover:text-gray-300 mb-4"
          >
            {showDebug ? '隐藏' : '显示'}调试信息
          </button>
          
          {showDebug && (
            <div className="bg-gray-800 rounded-lg p-4 text-left text-sm text-gray-300">
              <h4 className="font-semibold mb-2 text-white">性能监控 & 调试信息</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>已录制音符总数: {notes.length}</div>
                <div>待处理音符: {pendingNotesRef.current.length}</div>
                <div>检测到的丢失音符: {lostNotesCountRef.current}</div>
                <div>总处理音符: {totalNotesCountRef.current}</div>
                <div>已应用和弦数: {Object.keys(appliedChords).length}</div>
                <div>选中小节数: {selectedBars[1] - selectedBars[0] + 1}</div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                优化说明: 使用 requestAnimationFrame 批量更新状态，避免闭包陷阱，减少重渲染次数
              </p>
            </div>
          )}
          
          <p className="text-gray-500 text-sm">提示：连接 MIDI 键盘可获得更好的输入体验，也可使用界面上的虚拟钢琴</p>
          <p className="mt-1 text-gray-500 text-sm">支持导出标准 MIDI 文件，可在任何音乐制作软件中打开</p>
        </div>
      </div>
    </div>
  );
};

export default App;
