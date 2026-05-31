import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HeatmapPage from './pages/HeatmapPage';
import BookingsPage from './pages/BookingsPage';

function App() {
  return (
    <Router>
      <div>
        <nav className="bg-blue-600 text-white shadow-lg">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-8">
                <span className="text-xl font-bold">会议室管理系统</span>
                <Link to="/" className="hover:text-blue-200">热力图</Link>
                <Link to="/bookings" className="hover:text-blue-200">预订管理</Link>
              </div>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HeatmapPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;