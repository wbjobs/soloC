import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNetwork } from './NetworkContext';

interface VoiceConnection {
  peerConnection: RTCPeerConnection;
  remoteStream: MediaStream | null;
}

interface VoiceContextType {
  isMuted: boolean;
  isSpeaking: boolean;
  remoteSpeaking: Set<string>;
  toggleMute: () => void;
  startVoice: () => Promise<void>;
  stopVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Set<string>>(new Set());

  const { socket, currentUserId, remoteUsers, sendVoiceSignal } = useNetwork();

  const localStream = useRef<MediaStream | null>(null);
  const connections = useRef<Map<string, VoiceConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('voiceSignal', async (data: { senderId: string; signal: any }) => {
      if (data.signal.type === 'offer') {
        await handleOffer(data.senderId, data.signal);
      } else if (data.signal.type === 'answer') {
        await handleAnswer(data.senderId, data.signal);
      } else if (data.signal.type === 'ice-candidate') {
        await handleIceCandidate(data.senderId, data.signal);
      }
    });

    return () => {
      socket.off('voiceSignal');
    };
  }, [socket]);

  useEffect(() => {
    remoteUsers.forEach(user => {
      if (!connections.current.has(user.id) && localStream.current) {
        createPeerConnection(user.id);
      }
    });

    connections.current.forEach((_, userId) => {
      if (!remoteUsers.find(u => u.id === userId)) {
        const conn = connections.current.get(userId);
        conn?.peerConnection.close();
        connections.current.delete(userId);
      }
    });
  }, [remoteUsers]);

  const createPeerConnection = useCallback(async (targetUserId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendVoiceSignal(targetUserId, {
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const audio = document.createElement('audio');
      audio.srcObject = stream;
      audio.play();

      const conn = connections.current.get(targetUserId);
      if (conn) {
        conn.remoteStream = stream;
      }
    };

    connections.current.set(targetUserId, {
      peerConnection: pc,
      remoteStream: null,
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendVoiceSignal(targetUserId, { type: 'offer', offer });
  }, [sendVoiceSignal]);

  const handleOffer = useCallback(async (senderId: string, offer: RTCSessionDescriptionInit) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendVoiceSignal(senderId, {
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const audio = document.createElement('audio');
      audio.srcObject = stream;
      audio.play();

      const conn = connections.current.get(senderId);
      if (conn) {
        conn.remoteStream = stream;
      }
    };

    connections.current.set(senderId, {
      peerConnection: pc,
      remoteStream: null,
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendVoiceSignal(senderId, { type: 'answer', answer });
  }, [sendVoiceSignal]);

  const handleAnswer = useCallback(async (senderId: string, answer: RTCSessionDescriptionInit) => {
    const conn = connections.current.get(senderId);
    if (conn) {
      await conn.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleIceCandidate = useCallback(async (senderId: string, candidate: RTCIceCandidateInit) => {
    const conn = connections.current.get(senderId);
    if (conn) {
      await conn.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const startVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStream.current = stream;

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const detectSpeaking = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setIsSpeaking(average > 30 && !isMuted);
        }
        requestAnimationFrame(detectSpeaking);
      };
      detectSpeaking();

      remoteUsers.forEach(user => {
        createPeerConnection(user.id);
      });
    } catch (error) {
      console.error('Error starting voice:', error);
    }
  }, [remoteUsers, createPeerConnection, isMuted]);

  const stopVoice = useCallback(() => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }

    connections.current.forEach(conn => {
      conn.peerConnection.close();
    });
    connections.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  return (
    <VoiceContext.Provider
      value={{
        isMuted,
        isSpeaking,
        remoteSpeaking,
        toggleMute,
        startVoice,
        stopVoice,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within VoiceProvider');
  }
  return context;
};
