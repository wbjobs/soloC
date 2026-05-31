from midiutil import MIDIFile
import io
from typing import List, Dict, Tuple

class SimpleMusicGenerator:
    def __init__(self, style: str = "pop"):
        self.style = style
        self.tempo = 120
        self.midi_channels = {
            'piano': 0,
            'bass': 1,
            'drums': 9,
            'melody': 2
        }
        
    def note_name_to_midi(self, note_name: str) -> int:
        notes = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 
                 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
                 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
        
        octave = 4
        note_part = note_name
        
        for i, char in enumerate(note_name):
            if char.isdigit():
                octave = int(note_name[i:])
                note_part = note_name[:i]
                break
        
        return notes.get(note_part, 60) + (octave + 1) * 12
    
    def get_chord_notes(self, root_midi: int, chord_type: str) -> List[int]:
        if chord_type == 'major':
            return [root_midi, root_midi + 4, root_midi + 7]
        elif chord_type == 'minor':
            return [root_midi, root_midi + 3, root_midi + 7]
        elif chord_type == '7':
            return [root_midi, root_midi + 4, root_midi + 7, root_midi + 10]
        else:
            return [root_midi, root_midi + 4, root_midi + 7]
    
    def generate_accompaniment(self, melody_notes: List[Dict]) -> Tuple[bytes, bytes]:
        num_bars = max(4, min(8, max(4, len(melody_notes) // 4)))
        beats_per_bar = 4
        
        midi = MIDIFile(4)
        midi.addTempo(0, 0, self.tempo)
        
        roots = [60, 67, 69, 65]
        chord_types = ['major', 'major', 'minor', 'major']
        
        if self.style == 'jazz':
            chord_types = ['7', 'minor', '7', '7']
        elif self.style == 'classical':
            roots = [60, 65, 67, 60]
        
        for bar in range(num_bars):
            chord_idx = bar % len(roots)
            root = roots[chord_idx]
            c_type = chord_types[chord_idx]
            chord_notes = self.get_chord_notes(root, c_type)
            
            start_time = bar * beats_per_bar
            
            if self.style == 'pop':
                for beat in range(beats_per_bar):
                    for note in chord_notes:
                        midi.addNote(0, self.midi_channels['piano'], note, 
                                    start_time + beat, 1, 80)
            elif self.style == 'jazz':
                midi.addNote(0, self.midi_channels['piano'], chord_notes[0], start_time, 4, 70)
                midi.addNote(0, self.midi_channels['piano'], chord_notes[2], start_time + 0.5, 0.5, 70)
                midi.addNote(0, self.midi_channels['piano'], chord_notes[1], start_time + 1, 0.5, 70)
            else:
                for beat in range(0, beats_per_bar, 2):
                    for note in chord_notes:
                        midi.addNote(0, self.midi_channels['piano'], note,
                                    start_time + beat, 2, 75)
            
            bass_note = root - 12
            if self.style == 'pop':
                for beat in range(beats_per_bar):
                    midi.addNote(0, self.midi_channels['bass'], bass_note,
                                start_time + beat, 0.5, 90)
            elif self.style == 'jazz':
                midi.addNote(0, self.midi_channels['bass'], bass_note, start_time, 2, 85)
                midi.addNote(0, self.midi_channels['bass'], bass_note + 12, start_time + 2, 2, 80)
            else:
                midi.addNote(0, self.midi_channels['bass'], bass_note, start_time, 4, 85)
            
            for beat in range(beats_per_bar):
                if beat % 2 == 0:
                    midi.addNote(0, self.midi_channels['drums'], 36, start_time + beat, 0.5, 100)
                if beat % 2 == 1:
                    midi.addNote(0, self.midi_channels['drums'], 38, start_time + beat, 0.5, 90)
                midi.addNote(0, self.midi_channels['drums'], 42, start_time + beat * 0.5, 0.25, 70)
        
        for i, note in enumerate(melody_notes[:num_bars * beats_per_bar]):
            if 'pitch' in note:
                midi_pitch = self.note_name_to_midi(note['pitch'])
                duration = note.get('duration', 1)
                velocity = note.get('velocity', 100)
                midi.addNote(0, self.midi_channels['melody'], midi_pitch,
                            i * 0.5, duration, velocity)
        
        melody_midi = MIDIFile(1)
        melody_midi.addTempo(0, 0, self.tempo)
        for i, note in enumerate(melody_notes[:num_bars * beats_per_bar]):
            if 'pitch' in note:
                midi_pitch = self.note_name_to_midi(note['pitch'])
                duration = note.get('duration', 1)
                velocity = note.get('velocity', 100)
                melody_midi.addNote(0, 0, midi_pitch, i * 0.5, duration, velocity)
        
        accompaniment_buffer = io.BytesIO()
        midi.writeFile(accompaniment_buffer)
        accompaniment_buffer.seek(0)
        
        melody_buffer = io.BytesIO()
        melody_midi.writeFile(melody_buffer)
        melody_buffer.seek(0)
        
        return melody_buffer.getvalue(), accompaniment_buffer.getvalue()

def midi_to_bytes(melody_notes: List[Dict], style: str) -> Tuple[bytes, bytes]:
    generator = SimpleMusicGenerator(style)
    return generator.generate_accompaniment(melody_notes)
