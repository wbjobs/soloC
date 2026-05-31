import React, { useState } from 'react'

function Lobby({ onCreateRoom, onJoinRoom }) {
  const [joinCid, setJoinCid] = useState('')

  const handleJoin = () => {
    if (joinCid.trim()) {
      onJoinRoom(joinCid.trim())
    }
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1 className="lobby-title">🎨 Vector Whiteboard</h1>
        <div className="lobby-buttons">
          <button className="lobby-btn primary" onClick={onCreateRoom}>
            Create New Room
          </button>
          <div className="divider">or</div>
          <input
            type="text"
            className="lobby-input"
            placeholder="Enter Room CID"
            value={joinCid}
            onChange={(e) => setJoinCid(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button className="lobby-btn secondary" onClick={handleJoin}>
            Join Room
          </button>
        </div>
      </div>
    </div>
  )
}

export default Lobby