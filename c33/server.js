const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const uuidv4 = () => crypto.randomBytes(16).toString('hex');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const JWT_SECRET = 'your-secret-key-change-in-production';
const PORT = process.env.PORT || 5000;

const users = new Map();
const matchQueue = [];
const games = new Map();
const activeSockets = new Map();
const processedMessages = new Map();
const levels = new Map();

const MESSAGE_EXPIRY = 10000;

const ATTACK_TYPES = ['port_scan', 'buffer_overflow', 'phishing'];
const DEFENSE_TYPES = ['firewall', 'patch', 'training'];
const MIN_SUCCESS_RATE = 0.1;
const MAX_SUCCESS_RATE = 0.9;
const MIN_TOTAL_SUCCESS_RATE = 1.0;
const MAX_TOTAL_SUCCESS_RATE = 2.0;

function validateLevel(levelData) {
  const errors = [];
  
  if (!levelData || typeof levelData !== 'object') {
    errors.push('关卡数据必须是对象');
    return { valid: false, errors };
  }
  
  if (!levelData.name || typeof levelData.name !== 'string') {
    errors.push('关卡名称不能为空');
  }
  
  if (levelData.name.length > 50) {
    errors.push('关卡名称不能超过50个字符');
  }
  
  if (!levelData.matrix || typeof levelData.matrix !== 'object') {
    errors.push('必须包含弱点矩阵 matrix');
    return { valid: false, errors };
  }
  
  for (const attack of ATTACK_TYPES) {
    if (!levelData.matrix[attack]) {
      errors.push(`缺少攻击类型 ${attack} 的配置`);
      continue;
    }
    
    const attackConfig = levelData.matrix[attack];
    
    if (typeof attackConfig.baseSuccess !== 'number') {
      errors.push(`${attack} 的 baseSuccess 必须是数字`);
      continue;
    }
    
    if (attackConfig.baseSuccess < MIN_SUCCESS_RATE || attackConfig.baseSuccess > MAX_SUCCESS_RATE) {
      errors.push(`${attack} 的基础成功率必须在 ${MIN_SUCCESS_RATE * 100}% - ${MAX_SUCCESS_RATE * 100}% 之间`);
    }
    
    if (!attackConfig.counters || typeof attackConfig.counters !== 'object') {
      errors.push(`${attack} 缺少 counters 配置`);
      continue;
    }
    
    for (const defense of DEFENSE_TYPES) {
      if (typeof attackConfig.counters[defense] !== 'number') {
        errors.push(`${attack} 的 ${defense} 克制值必须是数字`);
        continue;
      }
      
      if (attackConfig.counters[defense] < 0 || attackConfig.counters[defense] > 0.8) {
        errors.push(`${attack} 的 ${defense} 克制值必须在 0 - 0.8 之间`);
      }
    }
  }
  
  if (errors.length === 0) {
    let totalBaseSuccess = 0;
    for (const attack of ATTACK_TYPES) {
      totalBaseSuccess += levelData.matrix[attack].baseSuccess;
    }
    
    if (totalBaseSuccess < MIN_TOTAL_SUCCESS_RATE) {
      errors.push(`所有攻击的基础成功率总和过低（当前: ${(totalBaseSuccess * 100).toFixed(1)}%，最低: ${MIN_TOTAL_SUCCESS_RATE * 100}%）`);
    }
    
    if (totalBaseSuccess > MAX_TOTAL_SUCCESS_RATE) {
      errors.push(`所有攻击的基础成功率总和过高（当前: ${(totalBaseSuccess * 100).toFixed(1)}%，最高: ${MAX_TOTAL_SUCCESS_RATE * 100}%）`);
    }
    
    for (const attack of ATTACK_TYPES) {
      const attackConfig = levelData.matrix[attack];
      let minPossibleRate = attackConfig.baseSuccess;
      let maxPossibleRate = attackConfig.baseSuccess;
      
      for (const defense of DEFENSE_TYPES) {
        const counterRate = attackConfig.baseSuccess - attackConfig.counters[defense];
        if (counterRate < minPossibleRate) minPossibleRate = counterRate;
        if (counterRate > maxPossibleRate) maxPossibleRate = counterRate;
      }
      
      if (minPossibleRate < 0.05) {
        errors.push(`${attack} 在被最优防御克制后成功率过低（低于5%），可能导致必败`);
      }
      if (maxPossibleRate > 0.95) {
        errors.push(`${attack} 在无有效防御时成功率过高（高于95%），可能导致必胜`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function isMessageProcessed(username, actionType, round) {
  const key = `${username}-${actionType}-${round}`;
  const now = Date.now();
  
  for (const [k, time] of processedMessages.entries()) {
    if (now - time > MESSAGE_EXPIRY) {
      processedMessages.delete(k);
    }
  }
  
  if (processedMessages.has(key)) {
    return true;
  }
  
  processedMessages.set(key, now);
  return false;
}

const vulnerabilityMatrix = {
  'port_scan': {
    baseSuccess: 0.6,
    counters: {
      'firewall': 0.4,
      'patch': 0.1,
      'training': 0.0
    }
  },
  'buffer_overflow': {
    baseSuccess: 0.4,
    counters: {
      'firewall': 0.1,
      'patch': 0.5,
      'training': 0.0
    }
  },
  'phishing': {
    baseSuccess: 0.5,
    counters: {
      'firewall': 0.0,
      'patch': 0.1,
      'training': 0.6
    }
  }
};

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (users.has(username)) {
    return res.status(400).json({ error: '用户已存在' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.set(username, { password: hashedPassword });
  
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, username });
});

app.get('/api/levels', (req, res) => {
  const levelList = Array.from(levels.values()).map(level => ({
    id: level.id,
    name: level.name,
    creator: level.creator,
    createdAt: level.createdAt,
    playCount: level.playCount || 0,
    rating: level.rating || 0
  }));
  res.json(levelList);
});

app.get('/api/levels/:id', (req, res) => {
  const level = levels.get(req.params.id);
  if (!level) {
    return res.status(404).json({ error: '关卡不存在' });
  }
  res.json({
    id: level.id,
    name: level.name,
    creator: level.creator,
    createdAt: level.createdAt,
    matrix: level.matrix,
    description: level.description || ''
  });
});

app.post('/api/levels', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' });
  }
  
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const creator = decoded.username;
    
    const levelData = req.body;
    const validation = validateLevel(levelData);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        error: '关卡校验失败', 
        details: validation.errors 
      });
    }
    
    const levelId = uuidv4().substring(0, 8);
    const newLevel = {
      id: levelId,
      name: levelData.name,
      description: levelData.description || '',
      creator,
      matrix: levelData.matrix,
      createdAt: new Date().toISOString(),
      playCount: 0,
      rating: 0,
      ratings: []
    };
    
    levels.set(levelId, newLevel);
    res.json({
      success: true,
      levelId,
      level: newLevel
    });
  } catch (err) {
    res.status(401).json({ error: '无效的 token' });
  }
});

app.post('/api/levels/:id/rate', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' });
  }
  
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const username = decoded.username;
    
    const level = levels.get(req.params.id);
    if (!level) {
      return res.status(404).json({ error: '关卡不存在' });
    }
    
    const { rating } = req.body;
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '评分必须是1-5之间的数字' });
    }
    
    const existingRating = level.ratings.find(r => r.username === username);
    if (existingRating) {
      existingRating.rating = rating;
    } else {
      level.ratings.push({ username, rating });
    }
    
    const totalRating = level.ratings.reduce((sum, r) => sum + r.rating, 0);
    level.rating = Math.round((totalRating / level.ratings.length) * 10) / 10;
    
    res.json({
      success: true,
      rating: level.rating,
      ratingCount: level.ratings.length
    });
  } catch (err) {
    res.status(401).json({ error: '无效的 token' });
  }
});

function initDefaultLevels() {
  if (levels.size === 0) {
    const defaultLevel = {
      id: 'default',
      name: '标准攻防',
      description: '官方标准配置，平衡的攻防对抗',
      creator: 'system',
      matrix: {
        'port_scan': {
          baseSuccess: 0.6,
          counters: {
            'firewall': 0.4,
            'patch': 0.1,
            'training': 0.0
          }
        },
        'buffer_overflow': {
          baseSuccess: 0.4,
          counters: {
            'firewall': 0.1,
            'patch': 0.5,
            'training': 0.0
          }
        },
        'phishing': {
          baseSuccess: 0.5,
          counters: {
            'firewall': 0.0,
            'patch': 0.1,
            'training': 0.6
          }
        }
      },
      createdAt: new Date().toISOString(),
      playCount: 0,
      rating: 4.5,
      ratings: []
    };
    levels.set('default', defaultLevel);
    
    const beginnerLevel = {
      id: 'beginner',
      name: '新手训练',
      description: '适合新手的简单配置',
      creator: 'system',
      matrix: {
        'port_scan': {
          baseSuccess: 0.5,
          counters: {
            'firewall': 0.2,
            'patch': 0.1,
            'training': 0.1
          }
        },
        'buffer_overflow': {
          baseSuccess: 0.5,
          counters: {
            'firewall': 0.1,
            'patch': 0.2,
            'training': 0.1
          }
        },
        'phishing': {
          baseSuccess: 0.5,
          counters: {
            'firewall': 0.1,
            'patch': 0.1,
            'training': 0.3
          }
        }
      },
      createdAt: new Date().toISOString(),
      playCount: 0,
      rating: 4.2,
      ratings: []
    };
    levels.set('beginner', beginnerLevel);
  }
}

initDefaultLevels();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('未授权'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('无效的 token'));
  }
});

function findMatch() {
  for (let i = 0; i < matchQueue.length; i++) {
    for (let j = i + 1; j < matchQueue.length; j++) {
      const p1 = matchQueue[i];
      const p2 = matchQueue[j];
      
      if (p1.levelId === p2.levelId || p1.levelId === 'any' || p2.levelId === 'any') {
        const levelId = p1.levelId !== 'any' ? p1.levelId : p2.levelId;
        
        matchQueue.splice(j, 1);
        matchQueue.splice(i, 1);
        
        return { player1: p1.username, player2: p2.username, levelId };
      }
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('用户连接:', socket.user.username);
  activeSockets.set(socket.user.username, socket.id);

  socket.on('join_queue', (data = {}) => {
    const levelId = data.levelId || 'default';
    
    const existingIndex = matchQueue.findIndex(p => p.username === socket.user.username);
    if (existingIndex > -1) {
      matchQueue.splice(existingIndex, 1);
    }
    
    matchQueue.push({
      username: socket.user.username,
      levelId,
      joinedAt: Date.now()
    });
    
    socket.emit('queue_joined', { 
      position: matchQueue.length,
      levelId 
    });
    io.emit('queue_update', { queueSize: matchQueue.length });
    
    const match = findMatch();
    if (match) {
      startGame(match.player1, match.player2, match.levelId);
    }
  });

  socket.on('leave_queue', () => {
    const index = matchQueue.findIndex(p => p.username === socket.user.username);
    if (index > -1) {
      matchQueue.splice(index, 1);
      io.emit('queue_update', { queueSize: matchQueue.length });
    }
  });

  socket.on('attack', (data) => {
    const game = findGameByPlayer(socket.user.username);
    if (game && game.attacker === socket.user.username && !game.roundComplete) {
      if (isMessageProcessed(socket.user.username, 'attack', game.round)) {
        return;
      }
      if (game.attack === null) {
        game.attack = data.attack;
        checkRoundComplete(game);
      }
    }
  });

  socket.on('defend', (data) => {
    const game = findGameByPlayer(socket.user.username);
    if (game && game.defender === socket.user.username && !game.roundComplete) {
      if (isMessageProcessed(socket.user.username, 'defend', game.round)) {
        return;
      }
      if (game.defense === null) {
        game.defense = data.defense;
        checkRoundComplete(game);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.user.username);
    activeSockets.delete(socket.user.username);
    const index = matchQueue.findIndex(p => p.username === socket.user.username);
    if (index > -1) {
      matchQueue.splice(index, 1);
    }
    const game = findGameByPlayer(socket.user.username);
    if (game) {
      const otherPlayer = game.attacker === socket.user.username ? game.defender : game.attacker;
      const otherSocketId = activeSockets.get(otherPlayer);
      if (otherSocketId) {
        io.to(otherSocketId).emit('opponent_disconnected');
      }
      games.delete(game.id);
    }
  });
});

function findGameByPlayer(username) {
  for (const game of games.values()) {
    if (game.attacker === username || game.defender === username) {
      return game;
    }
  }
  return null;
}

function startGame(player1, player2, levelId = 'default') {
  const gameId = uuidv4();
  
  const level = levels.get(levelId) || levels.get('default');
  if (level) {
    level.playCount = (level.playCount || 0) + 1;
  }
  
  const game = {
    id: gameId,
    attacker: player1,
    defender: player2,
    round: 1,
    maxRounds: 5,
    attackerScore: 0,
    defenderScore: 0,
    attack: null,
    defense: null,
    roundComplete: false,
    gameComplete: false,
    logs: [],
    levelId,
    levelName: level ? level.name : '标准攻防',
    matrix: level ? level.matrix : vulnerabilityMatrix,
    systemWeakness: generateSystemWeakness()
  };

  games.set(gameId, game);
  
  const p1Socket = activeSockets.get(player1);
  const p2Socket = activeSockets.get(player2);
  
  const gameStartData = {
    gameId,
    levelId,
    levelName: game.levelName,
    matrix: game.matrix,
    round: 1
  };
  
  if (p1Socket) {
    io.to(p1Socket).emit('game_started', {
      ...gameStartData,
      role: 'attacker',
      opponent: player2
    });
  }
  if (p2Socket) {
    io.to(p2Socket).emit('game_started', {
      ...gameStartData,
      role: 'defender',
      opponent: player1
    });
  }
}

function generateSystemWeakness() {
  return {
    port_scan: Math.random() * 0.3 - 0.15,
    buffer_overflow: Math.random() * 0.3 - 0.15,
    phishing: Math.random() * 0.3 - 0.15
  };
}

const roundLocks = new Set();

function checkRoundComplete(game) {
  const lockKey = `${game.id}-${game.round}`;
  
  if (game.attack && game.defense && !game.roundComplete) {
    if (roundLocks.has(lockKey)) {
      return;
    }
    
    roundLocks.add(lockKey);
    game.roundComplete = true;
    
    try {
      calculateRoundResult(game);
    } finally {
      setTimeout(() => {
        roundLocks.delete(lockKey);
      }, 3000);
    }
  }
}

function calculateRoundResult(game) {
  const attackType = game.attack;
  const defenseType = game.defense;
  
  const attackConfig = game.matrix[attackType];
  const baseAttack = attackConfig.baseSuccess;
  const counterEffect = attackConfig.counters[defenseType];
  const weaknessModifier = game.systemWeakness[attackType];
  
  let successRate = baseAttack - counterEffect + weaknessModifier;
  successRate = Math.max(0.05, Math.min(0.95, successRate));
  successRate = Math.round(successRate * 10000) / 10000;
  
  const attackSuccess = Math.random() < successRate;
  
  if (attackSuccess) {
    game.attackerScore++;
  } else {
    game.defenderScore++;
  }
  
  const successRatePercent = Math.round(successRate * 10000) / 100;
  
  const roundResult = {
    round: game.round,
    attacker: game.attacker,
    defender: game.defender,
    attack: attackType,
    defense: defenseType,
    success: attackSuccess,
    successRate: successRatePercent,
    attackerScore: game.attackerScore,
    defenderScore: game.defenderScore,
    levelId: game.levelId
  };
  
  game.lastRoundResult = roundResult;
  
  const log = {
    ...roundResult
  };
  game.logs.push(log);
  
  broadcastRoundResult(game, roundResult);
}

function broadcastRoundResult(game, roundResult) {
  const attackerSocket = activeSockets.get(game.attacker);
  const defenderSocket = activeSockets.get(game.defender);
  
  const baseResult = {
    round: roundResult.round,
    attack: roundResult.attack,
    defense: roundResult.defense,
    success: roundResult.success,
    successRate: roundResult.successRate,
    attackerScore: roundResult.attackerScore,
    defenderScore: roundResult.defenderScore,
    logs: [...game.logs]
  };
  
  const attackerResult = { ...baseResult, yourRole: 'attacker' };
  const defenderResult = { ...baseResult, yourRole: 'defender' };
  
  if (attackerSocket) {
    io.to(attackerSocket).emit('round_result', attackerResult);
  }
  if (defenderSocket) {
    io.to(defenderSocket).emit('round_result', defenderResult);
  }
  
  setTimeout(() => {
    nextRound(game);
  }, 2000);
}

function nextRound(game) {
  if (game.round >= game.maxRounds) {
    endGame(game);
    return;
  }
  
  game.round++;
  game.attack = null;
  game.defense = null;
  game.roundComplete = false;
  
  const temp = game.attacker;
  game.attacker = game.defender;
  game.defender = temp;
  
  const attackerSocket = activeSockets.get(game.attacker);
  const defenderSocket = activeSockets.get(game.defender);
  
  if (attackerSocket) {
    io.to(attackerSocket).emit('new_round', {
      round: game.round,
      yourRole: 'attacker',
      attackerScore: game.attackerScore,
      defenderScore: game.defenderScore
    });
  }
  if (defenderSocket) {
    io.to(defenderSocket).emit('new_round', {
      round: game.round,
      yourRole: 'defender',
      attackerScore: game.attackerScore,
      defenderScore: game.defenderScore
    });
  }
}

function endGame(game) {
  game.gameComplete = true;
  
  const winner = game.attackerScore > game.defenderScore 
    ? game.attacker 
    : game.defenderScore > game.attackerScore 
      ? game.defender 
      : null;
  
  const result = {
    winner,
    attackerScore: game.attackerScore,
    defenderScore: game.defenderScore,
    logs: game.logs,
    levelId: game.levelId,
    levelName: game.levelName
  };
  
  const p1Socket = activeSockets.get(game.attacker);
  const p2Socket = activeSockets.get(game.defender);
  
  if (p1Socket) {
    io.to(p1Socket).emit('game_ended', result);
  }
  if (p2Socket) {
    io.to(p2Socket).emit('game_ended', result);
  }
  
  games.delete(game.id);
}

app.use(express.static('client/build'));

server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
