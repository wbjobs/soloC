import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Monitor, List, Bell, PlayCircle } from 'lucide-react';
import UrlList from './components/UrlList';
import UrlDetail from './components/UrlDetail';
import DiffViewer from './components/DiffViewer';
import WebhookSubscriptionManager from './components/WebhookSubscriptionManager';
import ChangeReplayAnimation from './components/ChangeReplayAnimation';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Monitor className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">网页监控系统</span>
            </div>
            <div className="flex items-center space-x-6">
              <Link to="/" className="flex items-center text-gray-600 hover:text-blue-600">
                <List className="h-5 w-5 mr-1" />
                URL列表
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<UrlList />} />
          <Route path="/url/:id" element={<UrlDetail />} />
          <Route path="/diff/:urlId/:diffId" element={<DiffViewer />} />
          <Route path="/webhooks/:id" element={<WebhookSubscriptionManager />} />
          <Route path="/replay/:id/:diffId" element={<ChangeReplayAnimation />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
