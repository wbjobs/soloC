import React, { useState, useEffect } from 'react';
import { useNetwork } from '../contexts/NetworkContext';
import { useVoice } from '../contexts/VoiceContext';

export function RoomJoinPanel() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('museum-hall-01');
  const { isConnected, currentRoom, remoteUsers, joinRoom, leaveRoom } = useNetwork();
  const { startVoice, stopVoice, isMuted, toggleMute, isSpeaking } = useVoice();

  const handleJoin = () => {
    if (username.trim()) {
      joinRoom(roomId, username.trim());
      setTimeout(() => startVoice(), 1000);
    }
  };

  const handleLeave = () => {
    stopVoice();
    leaveRoom();
  };

  if (!currentRoom) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '40px',
          borderRadius: '12px',
          color: 'white',
          zIndex: 1000,
          minWidth: '350px',
        }}
      >
        <h2 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>🏛️ 虚拟博物馆</h2>
        <p style={{ margin: '0 0 20px 0', color: '#888', textAlign: 'center' }}>
          多人协同参观系统
        </p>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>房间号</label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #444',
              backgroundColor: '#222',
              color: 'white',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入您的名字"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #444',
              backgroundColor: '#222',
              color: 'white',
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        <button
          onClick={handleJoin}
          disabled={!isConnected || !username.trim()}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: isConnected ? '#4CAF50' : '#666',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            cursor: isConnected ? 'pointer' : 'not-allowed',
          }}
        >
          {isConnected ? '🚀 进入房间' : '🔌 连接中...'}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '80px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: '15px',
        borderRadius: '8px',
        color: 'white',
        zIndex: 1000,
        minWidth: '200px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>👥 在线用户</h3>
        <span style={{ fontSize: '12px', color: '#4CAF50' }}>{remoteUsers.length + 1} 人</span>
      </div>

      <div style={{ borderTop: '1px solid #444', paddingTop: '10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '5px 0',
            color: '#4CAF50',
          }}
        >
          <span style={{ marginRight: '8px' }}>
            {isSpeaking ? '🎤' : '👤'}
          </span>
          <span>{username} (你)</span>
        </div>

        {remoteUsers.map((user) => (
          <div
            key={user.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '5px 0',
              color: '#aaa',
            }}
          >
            <span style={{ marginRight: '8px' }}>👤</span>
            <span>{user.username}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '15px', display: 'flex', gap: '8px' }}>
        <button
          onClick={toggleMute}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: isMuted ? '#f44336' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isMuted ? '🔇 已静音' : '🎙️ 语音'}
        </button>
        <button
          onClick={handleLeave}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          🚪 离开
        </button>
      </div>
    </div>
  );
}
