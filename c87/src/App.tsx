import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, Cluster, SearchFilters } from './types';
import Heatmap from './components/Heatmap';
import Clusters from './components/Clusters';
import LogsTable from './components/LogsTable';
import SearchWindow from './components/SearchWindow';
import ProgressBar from './components/ProgressBar';
import Pagination from './components/Pagination';
import PatternMining from './components/PatternMining';

declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => void;
      onFileDialogResult: (callback: (filePaths: string[]) => void) => void;
      importLogs: (filePaths: string[], format: string) => Promise<any>;
      cancelImport: (filePath: string) => Promise<any>;
      getImportStatus: () => Promise<any>;
      onImportProgress: (callback: (progress: any) => void) => void;
      removeImportProgressListener: () => void;
      searchLogs: (query: string, filters: SearchFilters, page: number, pageSize: number) => Promise<{
        logs: LogEntry[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>;
      getHeatmapData: (startDate: string, endDate: string) => Promise<any>;
      getClusters: (startDate: string, endDate: string) => Promise<Cluster[]>;
      exportPDF: (options: any) => Promise<any>;
      closeSearchWindow: () => void;
      quickSearch: (query: string) => Promise<any>;
      getTotalLogs: () => Promise<number>;
      minePatterns: (minSupport: number, maxPatternLength: number) => Promise<any>;
      testRegex: (regex: string, limit: number) => Promise<any>;
      generateRegexForPattern: (pattern: string[]) => Promise<any>;
      getLogsByRegex: (regex: string, limit: number) => Promise<any>;
    };
  }
}

interface ImportProgress {
  filePath: string;
  percentage: number;
  status: string;
  message: string;
}

const App: React.FC = () => {
  const [searchResult, setSearchResult] = useState<{
    logs: LogEntry[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({ logs: [], total: 0, page: 1, pageSize: 100, totalPages: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    level: 'all',
    source: 'all',
    startDate: '',
    endDate: '',
    regex: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [importProgresses, setImportProgresses] = useState<Map<string, ImportProgress>>(new Map());
  const [activeView, setActiveView] = useState<'logs' | 'heatmap' | 'clusters' | 'pattern-mining'>('logs');
  const [isSearchWindow, setIsSearchWindow] = useState(false);
  const [totalLogs, setTotalLogs] = useState(0);

  useEffect(() => {
    if (window.location.hash === '#search') {
      setIsSearchWindow(true);
    }
  }, []);

  useEffect(() => {
    window.electronAPI.onFileDialogResult(async (filePaths: string[]) => {
      if (filePaths.length > 0) {
        await window.electronAPI.importLogs(filePaths, 'auto');
      }
    });

    window.electronAPI.onImportProgress((progress: ImportProgress) => {
      setImportProgresses((prev) => {
        const next = new Map(prev);
        next.set(progress.filePath, progress);
        
        if (progress.status === 'completed' || progress.status === 'error') {
          setTimeout(() => {
            setImportProgresses((p) => {
              const newP = new Map(p);
              newP.delete(progress.filePath);
              return newP;
            });
          }, 5000);
        }
        
        return next;
      });

      if (progress.status === 'completed') {
        handleSearch();
        updateTotalLogs();
      }
    });

    return () => {
      window.electronAPI.removeImportProgressListener();
    };
  }, []);

  useEffect(() => {
    updateTotalLogs();
  }, []);

  const updateTotalLogs = async () => {
    const total = await window.electronAPI.getTotalLogs();
    setTotalLogs(total);
  };

  const handleSearch = useCallback(async (page: number = 1) => {
    setIsSearching(true);
    try {
      const dbFilters: any = { ...filters };
      if (filters.startDate) {
        dbFilters.startDate = new Date(filters.startDate).getTime();
      }
      if (filters.endDate) {
        dbFilters.endDate = new Date(filters.endDate).getTime();
      }
      
      const result = await window.electronAPI.searchLogs(searchQuery, dbFilters, page, 100);
      setSearchResult(result);
      setCurrentPage(page);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, filters]);

  const handlePageChange = (page: number) => {
    handleSearch(page);
  };

  const handleExportPDF = async () => {
    await window.electronAPI.exportPDF({});
  };

  const handleCancelImport = async (filePath: string) => {
    await window.electronAPI.cancelImport(filePath);
    setImportProgresses((prev) => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  };

  if (isSearchWindow) {
    return <SearchWindow />;
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h1>日志分析器</h1>
        <div style={{ marginBottom: '16px', fontSize: '12px', color: '#888' }}>
          总日志数: {totalLogs.toLocaleString()}
        </div>
        <button onClick={() => window.electronAPI.openFileDialog()}>
          📁 导入日志文件
        </button>
        <button onClick={() => setActiveView('logs')} style={{ background: activeView === 'logs' ? '#e94560' : undefined }}>
          📋 日志列表
        </button>
        <button onClick={() => setActiveView('heatmap')} style={{ background: activeView === 'heatmap' ? '#e94560' : undefined }}>
          📊 时间热力图
        </button>
        <button onClick={() => setActiveView('clusters')} style={{ background: activeView === 'clusters' ? '#e94560' : undefined }}>
          🔍 异常聚类
        </button>
        <button onClick={() => setActiveView('pattern-mining')} style={{ background: activeView === 'pattern-mining' ? '#e94560' : undefined }}>
          🧠 模式发现
        </button>
        <button onClick={handleExportPDF}>
          📄 导出PDF报告
        </button>
      </div>

      <div className="main-content">
        {Array.from(importProgresses.values()).map((progress) => (
          <ProgressBar
            key={progress.filePath}
            progress={progress.percentage}
            status={progress.status}
            message={progress.message}
            fileName={progress.filePath.split(/[\\/]/).pop() || progress.filePath}
            onCancel={() => handleCancelImport(progress.filePath)}
          />
        ))}

        {activeView === 'logs' && (
          <>
            <div className="search-panel">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="搜索日志内容（支持SQLite FTS语法）..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={() => handleSearch()} disabled={isSearching}>
                  {isSearching ? '搜索中...' : '搜索'}
                </button>
              </div>

              <div className="filters">
                <div className="filter-group">
                  <label>日志级别</label>
                  <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}>
                    <option value="all">全部</option>
                    <option value="ERROR">ERROR</option>
                    <option value="WARN">WARN</option>
                    <option value="INFO">INFO</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>开始日期</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </div>

                <div className="filter-group">
                  <label>结束日期</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </div>

                <div className="filter-group">
                  <label>正则表达式</label>
                  <input
                    type="text"
                    placeholder="例如: error.*"
                    value={filters.regex}
                    onChange={(e) => setFilters({ ...filters, regex: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <LogsTable 
              logs={searchResult.logs} 
              isLoading={isSearching} 
            />

            <Pagination
              currentPage={searchResult.page}
              totalPages={searchResult.totalPages}
              totalItems={searchResult.total}
              pageSize={searchResult.pageSize}
              onPageChange={handlePageChange}
            />
          </>
        )}

        {activeView === 'heatmap' && (
          <Heatmap startDate={filters.startDate} endDate={filters.endDate} />
        )}

        {activeView === 'clusters' && (
          <Clusters startDate={filters.startDate} endDate={filters.endDate} />
        )}

        {activeView === 'pattern-mining' && (
          <PatternMining
            onApplyRegex={(regex: string) => {
              setFilters({ ...filters, regex });
              setActiveView('logs');
              handleSearch(1);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default App;
