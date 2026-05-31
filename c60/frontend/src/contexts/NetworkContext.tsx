import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface RemoteUser {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface NetworkContextType {
  socket: Socket | null;
  isConnected: boolean;
  currentUserId: string | null;
  currentRoom: string | null;
  remoteUsers: RemoteUser[];
  joinRoom: (roomId: string, username: string) => void;
  leaveRoom: () => void;
  sendPosition: (position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => void;
  sendVoiceSignal: (targetUserId: string, signal: any) => void;
  sendChatMessage: (message: string) => void;
  sendPointing: (position: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }) => void;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);

  const positionUpdateThrottle = useRef(0);

  useEffect(() => {
    const newSocket = io('http://localhost:3001/museum', {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
      setCurrentUserId(null);
      setCurrentRoom(null);
      setRemoteUsers([]);
    });

    newSocket.on('roomJoined', (data: { userId: string; users: RemoteUser[] }) => {
      console.log('Joined room:', data);
      setCurrentUserId(data.userId);
      setRemoteUsers(data.users);
    });

    newSocket.on('userJoined', (user: RemoteUser) => {
      console.log('User joined:', user);
      setRemoteUsers(prev => [...prev, user]);
    });

    newSocket.on('userLeft', (data: { userId: string; username: string }) => {
      console.log('User left:', data);
      setRemoteUsers(prev => prev.filter(u => u.id !== data.userId));
    });

    newSocket.on('userMoved', (data: { userId: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }) => {
      setRemoteUsers(prev =>
        prev.map(user =>
          user.id === data.userId
            ? { ...user, position: data.position, rotation: data.rotation }
            : user
        )
      );
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const joinRoom = useCallback((roomId: string, username: string) => {
    if (socket) {
      socket.emit('joinRoom', { roomId, username });
      setCurrentRoom(roomId);
    }
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (socket && currentRoom) {
      socket.leave(currentRoom);
      setCurrentRoom(null);
      setRemoteUsers([]);
    }
  }, [socket, currentRoom]);

  const sendPosition = useCallback(
    (position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => {
      if (!socket || !isConnected) return;

      const now = Date.now();
      if (now - positionUpdateThrottle.current < 50) return;
      positionUpdateThrottle.current = now;

      socket.emit('updatePosition', { position, rotation });
    },
    [socket, isConnected]
  );

  const sendVoiceSignal = useCallback(
    (targetUserId: string, signal: any) => {
      if (socket) {
        socket.emit('voiceSignal', { targetUserId, signal });
      }
    },
    [socket]
  );

  const sendChatMessage = useCallback(
    (message: string) => {
      if (socket) {
        socket.emit('chatMessage', { message });
      }
    },
    [socket]
  );

  const sendPointing = useCallback(
    (position: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }) => {
      if (socket) {
        socket.emit('pointing', { position, direction });
      }
    },
    [socket]
  );

  return (
    <NetworkContext.Provider
      value={{
        socket,
        isConnected,
        currentUserId,
        currentRoom,
        remoteUsers,
        joinRoom,
        leaveRoom,
        sendPosition,
        sendVoiceSignal,
        sendChatMessage,
        sendPointing,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
};
