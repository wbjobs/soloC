export interface Note {
  pitch: string;
  duration: number;
  velocity: number;
  timestamp: number;
}

export interface Composition {
  id: number;
  title: string;
  style: string;
  created_at: string;
}

export type Style = 'pop' | 'jazz' | 'classical';

export interface Chord {
  name: string;
  notes: string[];
  root: string;
  type: string;
}

export interface ChordProgression {
  id: string;
  name: string;
  chords: Chord[];
  style: string;
  description: string;
}

export interface BarSelection {
  startBar: number;
  endBar: number;
  notes: Note[];
}
