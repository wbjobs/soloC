import { Note, Chord, ChordProgression } from '../types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
};

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const CHORD_PROGRESSIONS = {
  pop: [
    { pattern: ['I', 'V', 'vi', 'IV'], name: '经典流行', description: '最常用的流行进行' },
    { pattern: ['I', 'vi', 'IV', 'V'], name: '50年代流行', description: '复古风格进行' },
    { pattern: ['I', 'IV', 'vi', 'V'], name: '现代流行', description: '当代流行常用' },
  ],
  jazz: [
    { pattern: ['ii7', 'V7', 'Imaj7', 'IVmaj7'], name: 'ii-V-I 爵士', description: '爵士标准进行' },
    { pattern: ['Im7', 'IVm7', 'IIm7b5', 'V7'], name: '波萨诺瓦', description: '拉丁爵士风格' },
    { pattern: ['Imaj7', 'vi7', 'ii7', 'V7'], name: '爵士流行', description: '融合流行的爵士' },
  ],
  classical: [
    { pattern: ['I', 'IV', 'V', 'I'], name: '正格进行', description: '古典标准终止' },
    { pattern: ['I', 'vi', 'ii', 'V'], name: '巴洛克进行', description: '经典巴洛克风格' },
    { pattern: ['I', 'IV', 'viio', 'iii'], name: '浪漫主义', description: '浪漫时期常用' },
  ],
};

const ROMAN_TO_DEGREE: { [key: string]: { degree: number; type: string } } = {
  'I': { degree: 0, type: 'major' },
  'ii': { degree: 1, type: 'minor' },
  'iii': { degree: 2, type: 'minor' },
  'IV': { degree: 3, type: 'major' },
  'V': { degree: 4, type: 'major' },
  'vi': { degree: 5, type: 'minor' },
  'viio': { degree: 6, type: 'diminished' },
  'ii7': { degree: 1, type: 'min7' },
  'V7': { degree: 4, type: '7' },
  'Imaj7': { degree: 0, type: 'maj7' },
  'IVmaj7': { degree: 3, type: 'maj7' },
  'Im7': { degree: 0, type: 'min7' },
  'IVm7': { degree: 3, type: 'min7' },
  'IIm7b5': { degree: 1, type: 'diminished' },
  'vi7': { degree: 5, type: 'min7' },
};

export const noteToMidi = (noteName: string): number => {
  const match = noteName.match(/([A-G]#?)(\d)/);
  if (!match) return 60;
  
  const [, name, octave] = match;
  const noteIndex = NOTE_NAMES.indexOf(name);
  return noteIndex + (parseInt(octave) + 1) * 12;
};

export const midiToNote = (midi: number): string => {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
};

export const createChord = (root: string, type: keyof typeof CHORD_TYPES): Chord => {
  const rootMidi = noteToMidi(`${root}4`);
  const intervals = CHORD_TYPES[type];
  const notes = intervals.map(interval => midiToNote(rootMidi + interval));
  
  return {
    name: `${root}${type === 'major' ? '' : type}`,
    notes,
    root,
    type,
  };
};

export const detectKey = (notes: Note[]): string => {
  if (notes.length === 0) return 'C';
  
  const noteCounts: { [key: string]: number } = {};
  
  notes.forEach(note => {
    const match = note.pitch.match(/([A-G]#?)/);
    if (match) {
      const noteName = match[1];
      noteCounts[noteName] = (noteCounts[noteName] || 0) + 1;
    }
  });
  
  const sortedNotes = Object.entries(noteCounts)
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);
  
  return sortedNotes[0] || 'C';
};

export const generateChordProgression = (
  key: string,
  style: 'pop' | 'jazz' | 'classical',
  numChords: number = 4
): ChordProgression[] => {
  const progressions = CHORD_PROGRESSIONS[style];
  const keyIndex = NOTE_NAMES.indexOf(key);
  
  return progressions.map((prog, idx) => {
    const chords: Chord[] = [];
    
    prog.pattern.slice(0, numChords).forEach(roman => {
      const mapping = ROMAN_TO_DEGREE[roman] || { degree: 0, type: 'major' };
      const chordRootIndex = (keyIndex + SCALES.major[mapping.degree]) % 12;
      const chordRoot = NOTE_NAMES[chordRootIndex];
      chords.push(createChord(chordRoot, mapping.type as keyof typeof CHORD_TYPES));
    });
    
    return {
      id: `${style}-${idx}`,
      name: prog.name,
      chords,
      style,
      description: prog.description,
    };
  });
};

export const playChordProgression = async (
  progression: ChordProgression,
  tempo: number = 120
): Promise<() => void> => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContext();
  
  const beatDuration = 60 / tempo;
  let isPlaying = true;
  
  const oscillators: OscillatorNode[] = [];
  
  const stopAll = () => {
    isPlaying = false;
    oscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    audioContext.close();
  };
  
  for (let chordIdx = 0; chordIdx < progression.chords.length; chordIdx++) {
    if (!isPlaying) break;
    
    const chord = progression.chords[chordIdx];
    const startTime = audioContext.currentTime + chordIdx * beatDuration;
    
    chord.notes.forEach(note => {
      const midi = noteToMidi(note);
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + beatDuration - 0.1);
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.start(startTime);
      osc.stop(startTime + beatDuration);
      
      oscillators.push(osc);
    });
  }
  
  return stopAll;
};

export const getNotesInBarRange = (
  notes: Note[],
  startBar: number,
  endBar: number,
  notesPerBar: number = 4
): Note[] => {
  const startIndex = startBar * notesPerBar;
  const endIndex = (endBar + 1) * notesPerBar;
  return notes.slice(startIndex, endIndex);
};
