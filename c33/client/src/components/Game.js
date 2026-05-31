import React, { useState, useEffect } from 'react';

const ATTACKS = [
  { id: 'port_scan', name: '端口扫描', icon: '🔍' },
  { id: 'buffer_overflow', name: '缓冲区溢出', icon: '💥' },
  { id: 'phishing', name: '钓鱼邮件', icon: '🎣' }
];

const DEFENSES = [
  { id: 'firewall', name: '防火墙调整', icon: '🔥' },
  { id: 'patch', name: '补丁更新', icon: '🔧' },
  { id: 'training', name: '员工培训', icon: '📚' }
];

function Game({ socket, user }) {
  const [gameData, setGameData] = useState({
    role: null,
    opponent: null,
    round: 1,
    attackerScore: 0,
    defenderScore: 0,
    logs: []
  });
  const [selectedAction, setSelectedAction] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    if (socket) {
      socket.on('game_started', (data) => {
        setGameData({
          role: data.role,
          opponent: data.opponent,
          round: data.round,
          attackerScore: 0,
          defenderScore: 0,
          logs: []
        });
        setSelectedAction(null);
        setShowResult(false);
        setGameOver(false);
      });

      socket.on('round_result', (data) => {
        setRoundResult(data);
        setShowResult(true);
        setGameData(prev => ({
          ...prev,
          attackerScore: data.attackerScore,
          defenderScore: data.defenderScore,
          logs: data.logs
        }));
      });

      socket.on('new_round', (data) => {
        setShowResult(false);
        setSelectedAction(null);
        setGameData(prev => ({
          ...prev,
          round: data.round,
          role: data.yourRole,
          attackerScore: data.attackerScore,
          defenderScore: data.defenderScore
        }));
      });

      socket.on('game_ended', (data) => {
        setGameOver(true);
        setWinner(data.winner);
        setGameData(prev => ({
          ...prev,
          attackerScore: data.attackerScore,
          defenderScore: data.defenderScore,
          logs: data.logs
        }));
      });

      socket.on('opponent_disconnected', () => {
        alert('对手断开连接，游戏结束');
        setGameOver(true);
      });
    }
  }, [socket]);

  const handleAction = (actionId) => {
    if (selectedAction || showResult || gameOver) return;
    
    setSelectedAction(actionId);
    
    if (gameData.role === 'attacker') {
      socket.emit('attack', { attack: actionId });
    } else {
      socket.emit('defend', { defense: actionId });
    }
  };

  const getActionName = (id, type) => {
    const list = type === 'attack' ? ATTACKS : DEFENSES;
    const action = list.find(a => a.id === id);
    return action ? `${action.icon} ${action.name}` : id;
  };

  const playAgain = () => {
    window.location.reload();
  };

  if (!gameData.role) {
    return (
      <div className="loading">
        <p>正在匹配对手...</p>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>⚔️ 网络攻防</h1>
        <div className="game-info">
          <span>对手: {gameData.opponent}</span>
        </div>
        <div className={`role-badge role-${gameData.role}`}>
          你的角色: {gameData.role === 'attacker' ? '🎯 攻击方' : '🛡️ 防御方'}
        </div>
        <div className="round-indicator">
          第 {gameData.round} / 5 回合
        </div>
      </div>

      <div className="score-board">
        <div className="score attacker">
          <div className="score-label">攻击方</div>
          <div className="score-value">{gameData.attackerScore}</div>
        </div>
        <div className="score defender">
          <div className="score-label">防御方</div>
          <div className="score-value">{gameData.defenderScore}</div>
        </div>
      </div>

      {gameOver ? (
        <div className="game-over">
          <h2>🎉 游戏结束</h2>
          {winner ? (
            <div className="winner">
              {winner === user.username ? '🏆 你赢了！' : `😢 ${winner} 获胜`}
            </div>
          ) : (
            <div className="winner">🤝 平局！</div>
          )}
          <div className="final-scores">
            <div className="score attacker">
              <div className="score-label">攻击方</div>
              <div className="score-value">{gameData.attackerScore}</div>
            </div>
            <div className="score defender">
              <div className="score-label">防御方</div>
              <div className="score-value">{gameData.defenderScore}</div>
            </div>
          </div>
          <button className="btn btn-play-again" onClick={playAgain}>
            🔄 再来一局
          </button>
        </div>
      ) : showResult ? (
        <div className="round-result">
          <h3>回合结果</h3>
          <div className="result-details">
            <div className="result-item">
              <div className="result-label">攻击</div>
              <div className="result-value">
                {getActionName(roundResult.attack, 'attack')}
              </div>
            </div>
            <div className="result-item">
              <div className="result-label">防御</div>
              <div className="result-value">
                {getActionName(roundResult.defense, 'defense')}
              </div>
            </div>
            <div className="result-item">
              <div className="result-label">成功率</div>
              <div className="result-value">{roundResult.successRate}%</div>
            </div>
          </div>
          <div className={`result-value ${roundResult.success ? 'success' : 'failure'}`}>
            {roundResult.success ? '💥 攻击成功！' : '🛡️ 防御成功！'}
          </div>
        </div>
      ) : (
        <div className="actions-section">
          <h3>
            {gameData.role === 'attacker' 
              ? '🎯 选择你的攻击方式' 
              : '🛡️ 选择你的防御方式'}
          </h3>
          <div className="action-buttons">
            {(gameData.role === 'attacker' ? ATTACKS : DEFENSES).map(action => (
              <button
                key={action.id}
                className={`action-btn ${gameData.role} ${selectedAction === action.id ? 'selected' : ''}`}
                onClick={() => handleAction(action.id)}
                disabled={selectedAction !== null}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{action.icon}</div>
                {action.name}
              </button>
            ))}
          </div>
          {selectedAction && (
            <div className="waiting-message">
              ⏳ 已选择，等待对手...
            </div>
          )}
        </div>
      )}

      <div className="logs-section">
        <h3>📋 行动日志</h3>
        {gameData.logs.length === 0 ? (
          <p style={{ color: '#90a4ae' }}>暂无记录</p>
        ) : (
          gameData.logs.map((log, index) => (
            <div 
              key={index} 
              className={`log-entry ${log.success ? 'success' : 'failure'}`}
            >
              <div className="log-round">第 {log.round} 回合</div>
              <div className="log-details">
                {log.attacker} 使用 {getActionName(log.attack, 'attack')} 
                {' → '}
                {log.defender} 使用 {getActionName(log.defense, 'defense')}
                {' → '}
                {log.success ? '攻击成功' : '防御成功'}
                {' '}({log.successRate}%)
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Game;
