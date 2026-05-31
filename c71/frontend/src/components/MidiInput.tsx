import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Note } from '../types';

interface MidiInputProps {
  onNoteChange: (notes: Note[]) => void;
  notes: Note[];
}

const MidiInput: React.FC<MidiInputProps> = ({ onNoteChange, notes }) => {
  const [midiAccess, setMidiAccess] = useState<any>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState<number>(0);
  
  const notesRef = useRef<Note[]>(notes);
  const midiAccessRef = useRef<any>(null);
  const activeNotesRef = useRef<Set<number>>(new Set());
  const isProcessingRef = useRef(false);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);

  const midiNumberToNote = useCallback((midiNumber: number): string => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    return `${notes[noteIndex]}${octave}`;
  }, []);

  const handleMidiMessage = useCallback((message: any) => {
    if (!message || !message.data || message.data.length < 3) {
      return;
    }

    const [status, noteNumber, velocity] = message.data;
    const receivedTime = performance.now();
    
    const messageLatency = receivedTime - (message.timeStamp || receivedTime);
    if (messageLatency > 0 && messageLatency < 100) {
      setLatency(messageLatency);
    }

    if (noteNumber < 0 || noteNumber > 127) {
      console.warn('Invalid MIDI note number:', noteNumber);
      return;
    }

    const isNoteOn = (status & 0xF0) === 0x90 && velocity > 0;
    const isNoteOff = (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0);

    if (isNoteOn) {
      if (!activeNotesRef.current.has(noteNumber)) {
        setActiveNotes(prev => {
          const newSet = new Set(prev);
          newSet.add(noteNumber);
          return newSet;
        });

        const newNote: Note = {
          pitch: midiNumberToNote(noteNumber),
          duration: 1,
          velocity: velocity,
          timestamp: Date.now()
        };
        
        onNoteChange([newNote]);
      }
    }

    if (isNoteOff) {
      setActiveNotes(prev => {
        const newSet = new Set(prev);
        newSet.delete(noteNumber);
        return newSet;
      });
    }
  }, [midiNumberToNote, onNoteChange]);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      console.log('Web MIDI API not supported');
      return;
    }

    let isMounted = true;

    const initMidi = async () => {
      try {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        
        if (!isMounted) return;

        midiAccessRef.current = access;
        setMidiAccess(access);

        const inputs = Array.from(access.inputs.values());
        
        if (inputs.length > 0) {
          inputs.forEach((input: any) => {
            input.onmidimessage = handleMidiMessage;
          });
          setIsConnected(true);
          console.log(`Connected to ${inputs.length} MIDI input(s)`);
        }

        access.onstatechange = (event: any) => {
          if (!isMounted) return;
          console.log('MIDI state changed:', event.port.name, event.port.state);
          
          if (event.port.state === 'connected' && event.port.type === 'input') {
            setTimeout(() => {
              event.port.onmidimessage = handleMidiMessage;
              setIsConnected(true);
            }, 10);
          } else if (event.port.state === 'disconnected' && event.port.type === 'input') {
            const remainingInputs = Array.from(access.inputs.values());
            if (remainingInputs.length === 0) {
              setIsConnected(false);
            }
          }
        };
      } catch (err) {
        console.error('MIDI access denied or error:', err);
      }
    };

    initMidi();

    return () => {
      isMounted = false;
      if (midiAccessRef.current) {
        const inputs = midiAccessRef.current.inputs.values();
        for (let input of inputs) {
          input.onmidimessage = null;
        }
      }
    };
  }, [handleMidiMessage]);

  const pianoKeys = Array.from({ length: 24 }, (_, i) => i + 60);

  const isBlackKey = useCallback((noteNumber: number): boolean => {
    const note = noteNumber % 12;
    return [1, 3, 6, 8, 10].includes(note);
  }, []);

  const handleVirtualKeyClick = useCallback((noteNumber: number) => {
    const newNote: Note = {
      pitch: midiNumberToNote(noteNumber),
      duration: 1,
      velocity: 100,
      timestamp: Date.now()
    };
    onNoteChange([newNote]);
  }, [midiNumberToNote, onNoteChange]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">MIDI 输入</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: isConnected ? '#22c55e' : '#ef4444' }}
            />
            <span className="text-sm text-gray-400">
              {isConnected ? 'MIDI 已连接' : '未检测到 MIDI 设备，请使用虚拟钢琴'}
            </span>
          </div>
          {isConnected && latency > 0 && (
            <span className={`text-sm px-2 py-1 rounded ${
              latency < 20 ? 'bg-green-600' : latency < 50 ? 'bg-yellow-600' : 'bg-red-600'
            }`}>
              延迟: {latency.toFixed(1)}ms
            </span>
          )}
        </div>
      </div>
      
      <div className="relative h-32 flex justify-center gap-1">
        {pianoKeys.filter(key => !isBlackKey(key)).map((key, index) => (
          <div key={key} className="relative">
            <button
              className={`piano-key white-key w-12 h-32 rounded-b-lg cursor-pointer transition-transform duration-75
                ${activeNotes.has(key) ? 'active translate-y-1' : ''}
              `}
              onClick={() => handleVirtualKeyClick(key)}
            />
            {pianoKeys.includes(key + 1) && isBlackKey(key + 1) && (
              <button
                className={`piano-key black-key absolute w-8 h-20 rounded-b-lg cursor-pointer -ml-4 z-10 transition-transform duration-75
                  ${activeNotes.has(key + 1) ? 'active translate-y-1' : ''}
                `}
                style={{ left: '32px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleVirtualKeyClick(key + 1);
                }}
              />
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4">
        <p className="text-sm text-gray-400 mb-2">
          已录制音符: {notes.length}
        </p>
        <div className="flex flex-wrap gap-2 min-h-[32px]">
          {notes.slice(-16).map((note, index) => (
            <span
              key={`${note.pitch}-${note.timestamp}-${index}`}
              className="px-2 py-1 bg-indigo-600 rounded text-xs"
            >
              {note.pitch}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MidiInput;
