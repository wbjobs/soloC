import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Auth from './components/Auth';
import Lobby from './components/Lobby';
import Game from './components/Game';

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState('lobby');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
      setUser({ token, username });
    }
  }, []);

  useEffect(() => {
    if (user) {
      const newSocket = io('http://localhost:5000', {
        auth: {
          token: user.token
        }
      });

      newSocket.on('connect', () => {
        console.log('已连接到服务器');
      });

      newSocket.on('disconnect', () => {
        console.log('与服务器断开连接');
      });

      newSocket.on('game_started', (data) => {
        setGameState('playing');
      });

      newSocket.on('game_ended', () => {
        setGameState('lobby');
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user]);

  const handleLogin = (userData) => {
    localStorage.setItem('token', userData.token);
    localStorage.setItem('username', userData.username);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUser(null);
    if (socket) {
      socket.close();
    }
    setSocket(null);
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="container">
      {gameState === 'lobby' ? (
        <Lobby socket={socket} user={user} onLogout={handleLogout} />
      ) : (
        <Game socket={socket} user={user} />
      )}
    </div>
  );
}

export default App;
