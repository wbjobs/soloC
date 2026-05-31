from music21 import stream, note, chord, scale, key, meter, tempo
from midiutil import MIDIFile
import io
from typing import List, Dict, Tuple

class MusicGenerator:
    def __init__(self, style: str = "pop"):
        self.style = style
        self.key_signature = key.Key('C')
        self.time_signature = meter.TimeSignature('4/4')
        self.bpm = 120
        
    def analyze_melody(self, melody_notes: List[Dict]) -> key.Key:
        pitch_list = []
        for n in melody_notes:
            if 'pitch' in n:
                pitch_list.append(n['pitch'])
        
        if not pitch_list:
            return self.key_signature
            
        note_names = [pitch for pitch in pitch_list if isinstance(pitch, str)]
        if note_names:
            from collections import Counter
            most_common = Counter(note_names).most_common(3)
            if most_common[0][0] in ['C', 'D', 'E', 'F', 'G', 'A', 'B']:
                self.key_signature = key.Key(most_common[0][0])
        
        return self.key_signature
    
    def get_chord_progression(self, key_obj: key.Key) -> List[chord.Chord]:
        tonic = key_obj.tonic
        roman_numerals = {
            'pop': ['I', 'V', 'vi', 'IV'],
            'jazz': ['I7', 'ii7', 'V7', 'I7'],
            'classical': ['I', 'IV', 'V', 'I']
        }
        
        progression = []
        for rn in roman_numerals.get(self.style, roman_numerals['pop']):
            try:
                from music21 import roman
                rn_obj = roman.RomanNumeral(rn, key_obj)
                c = chord.Chord(rn_obj.pitches)
                progression.append(c)
            except Exception as e:
                c = chord.Chord([tonic, tonic.transpose('M3'), tonic.transpose('P5')])
                progression.append(c)
        
        return progression
    
    def generate_piano_accompaniment(self, chord_prog: List[chord.Chord], num_bars: int) -> stream.Part:
        piano_part = stream.Part()
        piano_part.insert(0, self.key_signature)
        piano_part.insert(0, self.time_signature)
        piano_part.insert(0, tempo.MetronomeMark(number=self.bpm))
        
        chords_per_bar = len(chord_prog) // num_bars if num_bars > 0 else 1
        
        for i in range(num_bars):
            current_chord = chord_prog[i % len(chord_prog)]
            
            if self.style == 'pop':
                for j in range(4):
                    c = chord.Chord(current_chord.pitches, quarterLength=1)
                    c.octave = 4
                    piano_part.append(c)
            elif self.style == 'jazz':
                c = chord.Chord(current_chord.pitches, quarterLength=4)
                c.octave = 4
                piano_part.append(c)
            else:
                for j in range(2):
                    c = chord.Chord(current_chord.pitches, quarterLength=2)
                    c.octave = 4
                    piano_part.append(c)
        
        return piano_part
    
    def generate_bass_accompaniment(self, chord_prog: List[chord.Chord], num_bars: int) -> stream.Part:
        bass_part = stream.Part()
        bass_part.insert(0, self.key_signature)
        bass_part.insert(0, self.time_signature)
        
        for i in range(num_bars):
            current_chord = chord_prog[i % len(chord_prog)]
            root = current_chord.root()
            
            if self.style == 'pop':
                for j in range(4):
                    n = note.Note(root, quarterLength=1)
                    n.octave = 2
                    bass_part.append(n)
            elif self.style == 'jazz':
                n = note.Note(root, quarterLength=2)
                n.octave = 2
                bass_part.append(n)
                n2 = note.Note(root.transpose('P8'), quarterLength=2)
                bass_part.append(n2)
            else:
                n = note.Note(root, quarterLength=4)
                n.octave = 2
                bass_part.append(n)
        
        return bass_part
    
    def generate_drums(self, num_bars: int) -> stream.Part:
        drum_part = stream.Part()
        drum_part.insert(0, self.time_signature)
        
        for i in range(num_bars):
            for beat in range(4):
                if beat == 0 or beat == 2:
                    kick = note.Note()
                    kick.pitch.midi = 36
                    kick.quarterLength = 1
                    drum_part.append(kick)
                if beat == 1 or beat == 3:
                    snare = note.Note()
                    snare.pitch.midi = 38
                    snare.quarterLength = 1
                    drum_part.append(snare)
                hihat = note.Note()
                hihat.pitch.midi = 42
                hihat.quarterLength = 0.5
                drum_part.append(hihat)
        
        return drum_part
    
    def generate_accompaniment(self, melody_notes: List[Dict]) -> Tuple[bytes, bytes]:
        num_bars = max(4, min(8, len(melody_notes) // 4))
        
        key_obj = self.analyze_melody(melody_notes)
        chord_prog = self.get_chord_progression(key_obj)
        
        piano_part = self.generate_piano_accompaniment(chord_prog, num_bars)
        bass_part = self.generate_bass_accompaniment(chord_prog, num_bars)
        drum_part = self.generate_drums(num_bars)
        
        full_score = stream.Score()
        full_score.append(piano_part)
        full_score.append(bass_part)
        full_score.append(drum_part)
        
        melody_stream = stream.Part()
        for n in melody_notes[:num_bars * 4]:
            if 'pitch' in n:
                new_note = note.Note(n['pitch'], quarterLength=n.get('duration', 1))
                melody_stream.append(new_note)
        
        full_score.insert(0, melody_stream)
        
        midi_buffer = io.BytesIO()
        full_score.write('midi', fp=midi_buffer)
        midi_buffer.seek(0)
        accompaniment_midi = midi_buffer.getvalue()
        
        melody_buffer = io.BytesIO()
        melody_stream.write('midi', fp=melody_buffer)
        melody_buffer.seek(0)
        melody_midi = melody_buffer.getvalue()
        
        return melody_midi, accompaniment_midi

def midi_to_bytes(melody_notes: List[Dict], style: str) -> Tuple[bytes, bytes]:
    generator = MusicGenerator(style)
    return generator.generate_accompaniment(melody_notes)
