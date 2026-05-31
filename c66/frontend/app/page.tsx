'use client';

import { useState, useEffect, useRef } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

interface FactorData {
  symbol: string;
  buyPressure: number;
  sellPressure: number;
  netFlow: number;
  largeOrderNetFlow: number;
  timestamp: string;
}

interface Trade {
  timestamp: string;
  action: string;
  price: number;
  factorA: number;
  factorB: number;
}

interface BacktestProgress {
  current: number;
  total: number;
  totalReturn: number;
  winCount: number;
  lossCount: number;
  trades: Trade[];
  completed: boolean;
}

export default function Home() {
  const [factors, setFactors] = useState<FactorData[]>([]);
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [strategy, setStrategy] = useState('因子A > 0.8 and 因子B < -0.5');
  const [backtestProgress, setBacktestProgress] = useState<BacktestProgress | null>(null);
  const [isStreamingBacktest, setIsStreamingBacktest] = useState(false);
  const backtestAccRef = useRef<Trade[]>([]);

  useEffect(() => {
    fetchFactors();
    const interval = setInterval(fetchFactors, 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  const fetchFactors = async () => {
    try {
      const res = await fetch(`/api/factors/${symbol}?minutes=5`);
      const data = await res.json();
      if (data.data) {
        setFactors(data.data.reverse());
      }
    } catch (e) {
      console.error('Failed to fetch factors', e);
    }
  };

  const streamFactors = async () => {
    try {
      const res = await fetch(`/api/factors/stream/${symbol}`);
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      const allFactors: FactorData[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const factor = JSON.parse(line);
            allFactors.push(factor);
          } catch (e) {
            console.error('Failed to parse factor', e);
          }
        }
      }
      
      setFactors(allFactors);
    } catch (e) {
      console.error('Failed to stream factors', e);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && replayIndex < factors.length - 1) {
      interval = setInterval(() => {
        setReplayIndex(i => Math.min(i + 1, factors.length - 1));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, replayIndex, factors.length]);

  const runBacktest = async () => {
    setIsStreamingBacktest(true);
    backtestAccRef.current = [];
    
    try {
      const res = await fetch(`/api/backtest/${symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition: strategy, stream: true })
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const progress = JSON.parse(line);
            if (progress.completed) {
              backtestAccRef.current = progress.trades;
            } else {
              backtestAccRef.current.push(...progress.trades);
            }
            setBacktestProgress(progress);
          } catch (e) {
            console.error('Failed to parse backtest progress', e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to run backtest', e);
    } finally {
      setIsStreamingBacktest(false);
    }
  };

  const displayFactors = isPlaying ? factors.slice(0, replayIndex + 1) : factors;

  const chartOptions: Highcharts.Options = {
    title: { text: '订单流因子实时曲线' },
    chart: { backgroundColor: '#1f2937', type: 'line' },
    xAxis: {
      type: 'datetime',
      labels: { style: { color: '#9ca3af' } }
    },
    yAxis: {
      labels: { style: { color: '#9ca3af' } },
      gridLineColor: '#374151'
    },
    legend: { itemStyle: { color: '#9ca3af' } },
    series: [
      {
        name: '净资金流 (因子A)',
        type: 'line',
        color: '#10b981',
        data: displayFactors.map((f, i) => [Date.now() - (displayFactors.length - i) * 1000, f.netFlow])
      },
      {
        name: '大单净流 (因子B)',
        type: 'line',
        color: '#f59e0b',
        data: displayFactors.map((f, i) => [Date.now() - (displayFactors.length - i) * 1000, f.largeOrderNetFlow])
      }
    ]
  };

  const pressureChartOptions: Highcharts.Options = {
    title: { text: '买卖压力' },
    chart: { backgroundColor: '#1f2937', type: 'area' },
    xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
    yAxis: { labels: { style: { color: '#9ca3af' } }, gridLineColor: '#374151' },
    legend: { itemStyle: { color: '#9ca3af' } },
    series: [
      {
        name: '买压',
        type: 'area',
        color: '#22c55e',
        data: displayFactors.map((f, i) => [Date.now() - (displayFactors.length - i) * 1000, f.buyPressure])
      },
      {
        name: '卖压',
        type: 'area',
        color: '#ef4444',
        data: displayFactors.map((f, i) => [Date.now() - (displayFactors.length - i) * 1000, f.sellPressure])
      }
    ]
  };

  const displayTrades = backtestProgress?.completed 
    ? backtestProgress.trades 
    : backtestAccRef.current.slice(-100);

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">订单流因子监控系统</h1>
        <div className="flex gap-4">
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
          >
            📊 因子监控
          </button>
          <button
            onClick={() => window.location.href = '/cointegration'}
            className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700"
          >
            🔗 协整分析
          </button>
        </div>
      </div>
      
      <div className="flex gap-4 mb-6 flex-wrap">
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          className="px-4 py-2 bg-gray-700 rounded"
          placeholder="交易对"
        />
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
        >
          {isPlaying ? '暂停回放' : '开始回放'}
        </button>
        <button
          onClick={streamFactors}
          className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700"
        >
          流式加载历史数据
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 p-4 rounded-lg">
          <HighchartsReact highcharts={Highcharts} options={chartOptions} />
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <HighchartsReact highcharts={Highcharts} options={pressureChartOptions} />
        </div>
      </div>

      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-4">策略回测</h2>
        <div className="flex gap-4 mb-4 flex-wrap">
          <input
            type="text"
            value={strategy}
            onChange={e => setStrategy(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-700 rounded min-w-[300px]"
            placeholder="输入策略条件"
          />
          <button
            onClick={runBacktest}
            disabled={isStreamingBacktest}
            className="px-6 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isStreamingBacktest ? '回测中...' : '运行回测'}
          </button>
        </div>

        {backtestProgress && (
          <div className="mb-4">
            <div className="bg-gray-700 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-green-500 h-full transition-all duration-300"
                style={{ width: `${(backtestProgress.current / backtestProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              进度: {backtestProgress.current} / {backtestProgress.total}
            </p>
          </div>
        )}

        {backtestProgress && (
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-700 p-4 rounded text-center">
              <div className="text-2xl font-bold text-green-400">{backtestProgress.totalReturn.toFixed(2)}%</div>
              <div className="text-gray-400">总收益率</div>
            </div>
            <div className="bg-gray-700 p-4 rounded text-center">
              <div className="text-2xl font-bold text-blue-400">{displayTrades.length}</div>
              <div className="text-gray-400">交易次数</div>
            </div>
            <div className="bg-gray-700 p-4 rounded text-center">
              <div className="text-2xl font-bold text-green-400">{backtestProgress.winCount}</div>
              <div className="text-gray-400">盈利次数</div>
            </div>
            <div className="bg-gray-700 p-4 rounded text-center">
              <div className="text-2xl font-bold text-red-400">{backtestProgress.lossCount}</div>
              <div className="text-gray-400">亏损次数</div>
            </div>
          </div>
        )}

        {displayTrades.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-2">时间</th>
                  <th className="pb-2">操作</th>
                  <th className="pb-2">价格</th>
                  <th className="pb-2">因子A</th>
                  <th className="pb-2">因子B</th>
                </tr>
              </thead>
              <tbody>
                {displayTrades.map((trade, i) => (
                  <tr key={i} className="border-t border-gray-700">
                    <td className="py-2">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                    <td className={`py-2 ${trade.action === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.action.toUpperCase()}
                    </td>
                    <td className="py-2">{trade.price.toFixed(2)}</td>
                    <td className="py-2">{trade.factorA.toFixed(4)}</td>
                    <td className="py-2">{trade.factorB.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
