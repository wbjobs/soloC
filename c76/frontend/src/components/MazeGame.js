import React, { useState, useEffect, useCallback, useRef } from 'react';

const MazeGame = ({ attentionScore, isActive }) => {
  const [ballPosition, setBallPosition] = useState({ x: 50, y: 50 });
  const [targetPosition, setTargetPosition] = useState({ x: 250, y: 250 });
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [walls, setWalls] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);

  const mazeSize = 300;
  const ballRadius = 8;
  const targetRadius = 12;

  const generateMaze = useCallback((levelNum) => {
    const newWalls = [];
    const numWalls = 3 + levelNum * 2;

    for (let i = 0; i < numWalls; i++) {
      const isHorizontal = Math.random() > 0.5;
      if (isHorizontal) {
        newWalls.push({
          x: Math.random() * (mazeSize - 100) + 20,
          y: Math.random() * (mazeSize - 50) + 20,
          width: 50 + Math.random() * 50,
          height: 8
        });
      } else {
        newWalls.push({
          x: Math.random() * (mazeSize - 50) + 20,
          y: Math.random() * (mazeSize - 100) + 20,
          width: 8,
          height: 50 + Math.random() * 50
        });
      }
    }
    return newWalls;
  }, [mazeSize]);

  const checkCollision = useCallback((pos) => {
    for (const wall of walls) {
      const closestX = Math.max(wall.x, Math.min(pos.x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(pos.y, wall.y + wall.height));
      const distance = Math.sqrt(
        Math.pow(pos.x - closestX, 2) + Math.pow(pos.y - closestY, 2)
      );
      if (distance < ballRadius) return true;
    }
    return false;
  }, [walls, ballRadius]);

  const checkTargetReached = useCallback((pos) => {
    const distance = Math.sqrt(
      Math.pow(pos.x - targetPosition.x, 2) + 
      Math.pow(pos.y - targetPosition.y, 2)
    );
    return distance < (ballRadius + targetRadius);
  }, [targetPosition, ballRadius, targetRadius]);

  useEffect(() => {
    if (!isActive || !gameStarted) return;

    const moveSpeed = (attentionScore / 100) * 3;

    gameLoopRef.current = setInterval(() => {
      setBallPosition(prev => {
        const dx = (targetPosition.x - prev.x) * 0.05 * moveSpeed;
        const dy = (targetPosition.y - prev.y) * 0.05 * moveSpeed;

        const newPos = {
          x: Math.max(ballRadius, Math.min(mazeSize - ballRadius, prev.x + dx)),
          y: Math.max(ballRadius, Math.min(mazeSize - ballRadius, prev.y + dy))
        };

        if (checkCollision(newPos)) {
          return prev;
        }

        if (checkTargetReached(newPos)) {
          setScore(s => s + level * 100);
          setLevel(l => l + 1);
          setWalls(generateMaze(level + 1));
          setTargetPosition({
            x: Math.random() * (mazeSize - 60) + 30,
            y: Math.random() * (mazeSize - 60) + 30
          });
        }

        return newPos;
      });
    }, 50);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [isActive, gameStarted, attentionScore, targetPosition, checkCollision, checkTargetReached, generateMaze, level, mazeSize, ballRadius]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, mazeSize, mazeSize);

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, mazeSize, mazeSize);

    ctx.fillStyle = '#374151';
    walls.forEach(wall => {
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    });

    ctx.beginPath();
    ctx.arc(targetPosition.x, targetPosition.y, targetRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ballPosition.x, ballPosition.y, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = attentionScore > 50 ? '#3b82f6' : '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.stroke();

    const gradient = ctx.createRadialGradient(
      ballPosition.x, ballPosition.y, 0,
      ballPosition.x, ballPosition.y, ballRadius * 2
    );
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.beginPath();
    ctx.arc(ballPosition.x, ballPosition.y, ballRadius * 2 * (attentionScore / 100), 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [ballPosition, targetPosition, walls, attentionScore, mazeSize, ballRadius, targetRadius]);

  const startGame = () => {
    setGameStarted(true);
    setBallPosition({ x: 50, y: 50 });
    setTargetPosition({ x: 250, y: 250 });
    setWalls(generateMaze(1));
    setScore(0);
    setLevel(1);
  };

  const resetGame = () => {
    setGameStarted(false);
    setBallPosition({ x: 50, y: 50 });
    setScore(0);
    setLevel(1);
    setWalls([]);
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-3">🧠 注意力迷宫训练</h3>
      
      <div className="flex justify-between items-center mb-3">
        <div className="flex gap-4">
          <span className="text-sm text-gray-600">关卡: <strong>{level}</strong></span>
          <span className="text-sm text-gray-600">分数: <strong>{score}</strong></span>
        </div>
        <div className="text-sm text-gray-600">
          注意力: <strong className={attentionScore > 50 ? 'text-green-600' : 'text-red-600'}>
            {Math.round(attentionScore)}%
          </strong>
        </div>
      </div>

      <div className="flex justify-center mb-3">
        <canvas
          ref={canvasRef}
          width={mazeSize}
          height={mazeSize}
          className="border-2 border-gray-300 rounded-lg"
        />
      </div>

      <p className="text-xs text-gray-500 mb-3 text-center">
        {gameStarted 
          ? "保持专注！小球会根据你的注意力评分向目标移动"
          : "点击开始游戏来进行注意力训练"
        }
      </p>

      <div className="flex gap-2 justify-center">
        {!gameStarted ? (
          <button
            onClick={startGame}
            disabled={!isActive}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            开始游戏
          </button>
        ) : (
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            重新开始
          </button>
        )}
      </div>
    </div>
  );
};

export default MazeGame;
