import React, { useState, useEffect } from 'react';

function Lobby({ socket, user, onLogout }) {
  const [inQueue, setInQueue] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    if (socket) {
      socket.on('queue_update', (data) => {
        setQueueSize(data.queueSize);
      });

      socket.on('queue_joined', () => {
        setInQueue(true);
      });
    }
  }, [socket]);

  const joinQueue = () => {
    if (socket) {
      socket.emit('join_queue');
    }
  };

  const leaveQueue = () => {
    if (socket) {
      socket.emit('leave_queue');
      setInQueue(false);
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <h1>🎮 网络攻防大厅</h1>
        <div className="user-info">
          <span>欢迎, {user.username}</span>
          <button className="btn-logout" onClick={onLogout}>
            退出
          </button>
        </div>
      </div>

      <div className="queue-section">
        <h2>匹配队列</h2>
        
        {inQueue ? (
          <div className="queue-info">
            <p>✅ 已加入匹配队列</p>
            <p>当前队列人数: {queueSize}</p>
            <p>正在寻找对手...</p>
          </div>
        ) : (
          <p>点击下方按钮开始匹配</p>
        )}

        <div>
          {!inQueue ? (
            <button 
              className="btn btn-queue btn-join"
              onClick={joinQueue}
            >
              🎯 开始匹配
            </button>
          ) : (
            <button 
              className="btn btn-queue btn-leave"
              onClick={leaveQueue}
            >
              ❌ 取消匹配
            </button>
          )}
        </div>
      </div>

      <div className="queue-section">
        <h2>游戏规则</h2>
        <div style={{ textAlign: 'left', lineHeight: '1.8' }}>
          <p>🎯 <strong>攻击方</strong> 可以选择：端口扫描、缓冲区溢出、钓鱼邮件</p>
          <p>🛡️ <strong>防御方</strong> 可以选择：防火墙调整、补丁更新、员工培训</p>
          <p>⚔️ 每局共 5 回合，双方轮流攻防</p>
          <p>🏆 得分高者获胜</p>
          <br />
          <p style={{ color: '#90caf9' }}>💡 提示：不同的防御对不同的攻击有不同的克制效果！</p>
        </div>
      </div>
    </div>
  );
}

export default Lobby;
