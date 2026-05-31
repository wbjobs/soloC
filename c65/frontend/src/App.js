import React, { useState } from 'react';
import { CollaborationView } from './components/CollaborationView';

function App() {
  const [studyId, setStudyId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isHost, setIsHost] = useState(true);
  const [joined, setJoined] = useState(false);

  const handleJoin = (e) => {
    e.preventDefault();
    if (studyId && sessionId) {
      setJoined(true);
    }
  };

  if (joined) {
    return (
      <CollaborationView
        studyId={studyId}
        sessionId={sessionId}
        isHost={isHost}
      />
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '50px auto', padding: 20 }}>
      <h1>DICOM Collaboration Platform</h1>
      <p>Connect with other doctors for real-time annotation</p>

      <form onSubmit={handleJoin} style={{ marginTop: 30 }}>
        <div style={{ marginBottom: 15 }}>
          <label style={{ display: 'block', marginBottom: 5 }}>Study ID:</label>
          <input
            type="text"
            value={studyId}
            onChange={(e) => setStudyId(e.target.value)}
            style={{ width: '100%', padding: 8 }}
            placeholder="Enter study UUID"
          />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label style={{ display: 'block', marginBottom: 5 }}>Session ID:</label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            style={{ width: '100%', padding: 8 }}
            placeholder="Enter session UUID"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>
            <input
              type="checkbox"
              checked={isHost}
              onChange={(e) => setIsHost(e.target.checked)}
            />
            {' '}I am the host (Surgeon)
          </label>
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            padding: 12,
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 16
          }}
        >
          {isHost ? 'Create Session' : 'Join Session'}
        </button>
      </form>

      <div style={{ marginTop: 30, padding: 15, backgroundColor: '#f8f9fa', borderRadius: 4 }}>
        <h3>Features:</h3>
        <ul>
          <li>WebRTC P2P data channel for large annotation data</li>
          <li>Chunked data transfer with congestion control</li>
          <li>Progressive DICOM slice loading with priority queue</li>
          <li>Ordered message delivery over WebSocket channels</li>
          <li>Window/Level adjustment with presets</li>
          <li>Real-time annotation synchronization</li>
          <li>Comment system for collaboration</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
