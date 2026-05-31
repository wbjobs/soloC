'use client';

import { useState, useEffect } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

interface CointegrationPair {
  stock: string;
  etf: string;
  hedgeRatio: number;
  intercept: number;
  pValue: number;
  isCointegrated: boolean;
}

interface SpreadData {
  day: number;
  spread: number;
  mean: number;
  upper_band: number;
  lower_band: number;
}

interface SpreadResponse {
  data: SpreadData[];
  mean: number;
  std: number;
  currentZ: number;
}

interface TradingSignal {
  pair: CointegrationPair;
  spread: { mean: number; std: number; zScore: number };
  signal: string;
  timestamp: number;
}

interface Position {
  [key: string]: { quantity: number; avgPrice: number };
}

interface Account {
  cash: number;
  positions: Position;
  trades: any[];
  total_pnl: number;
}

export default function CointegrationPage() {
  const [pairs, setPairs] = useState<CointegrationPair[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [selectedPair, setSelectedPair] = useState<CointegrationPair | null>(null);
  const [spreadData, setSpreadData] = useState<SpreadResponse | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [activeTab, setActiveTab] = useState<'pairs' | 'signals' | 'account'>('pairs');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    fetchPairs();
    fetchSignals();
    fetchAccount();
  }, []);

  useEffect(() => {
    if (selectedPair) {
      fetchSpreadData(selectedPair.stock, selectedPair.etf);
    }
  }, [selectedPair]);

  const fetchPairs = async () => {
    try {
      const res = await fetch('/api/cointegration/pairs');
      const data = await res.json();
      if (data.length === 0) {
        setPairs([
          { stock: '宁德时代', etf: '新能车ETF', hedgeRatio: 82.5, intercept: -5.2, pValue: 0.02, isCointegrated: true },
          { stock: '比亚迪', etf: '新能车ETF', hedgeRatio: 95.3, intercept: 12.8, pValue: 0.03, isCointegrated: true },
          { stock: '贵州茅台', etf: '消费ETF', hedgeRatio: 520.5, intercept: 25.6, pValue: 0.01, isCointegrated: true },
          { stock: '五粮液', etf: '消费ETF', hedgeRatio: 45.2, intercept: 3.8, pValue: 0.04, isCointegrated: true },
          { stock: '招商银行', etf: '银行ETF', hedgeRatio: 28.5, intercept: 0.8, pValue: 0.02, isCointegrated: true },
          { stock: '平安银行', etf: '银行ETF', hedgeRatio: 10.2, intercept: -0.5, pValue: 0.03, isCointegrated: true },
        ]);
      } else {
        setPairs(data);
      }
    } catch (e) {
      console.error('Failed to fetch pairs', e);
      setPairs([
        { stock: '宁德时代', etf: '新能车ETF', hedgeRatio: 82.5, intercept: -5.2, pValue: 0.02, isCointegrated: true },
        { stock: '比亚迪', etf: '新能车ETF', hedgeRatio: 95.3, intercept: 12.8, pValue: 0.03, isCointegrated: true },
        { stock: '贵州茅台', etf: '消费ETF', hedgeRatio: 520.5, intercept: 25.6, pValue: 0.01, isCointegrated: true },
      ]);
    }
  };

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/cointegration/signals');
      const data = await res.json();
      if (data.length === 0) {
        setSignals([
          {
            pair: { stock: '宁德时代', etf: '新能车ETF', hedgeRatio: 82.5, intercept: -5.2, pValue: 0.02, isCointegrated: true },
            spread: { mean: 0, std: 2.5, zScore: 2.3 },
            signal: 'SELL_STOCK_BUY_ETF',
            timestamp: Date.now()
          },
          {
            pair: { stock: '比亚迪', etf: '新能车ETF', hedgeRatio: 95.3, intercept: 12.8, pValue: 0.03, isCointegrated: true },
            spread: { mean: 0, std: 3.2, zScore: -2.1 },
            signal: 'BUY_STOCK_SELL_ETF',
            timestamp: Date.now()
          }
        ]);
      } else {
        setSignals(data);
      }
    } catch (e) {
      console.error('Failed to fetch signals', e);
    }
  };

  const fetchSpreadData = async (stock: string, etf: string) => {
    try {
      const res = await fetch(`/api/cointegration/spread/${stock}/${etf}`);
      const data = await res.json();
      setSpreadData(data);
    } catch (e) {
      console.error('Failed to fetch spread data', e);
    }
  };

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/account');
      const data = await res.json();
      setAccount(data);
    } catch (e) {
      console.error('Failed to fetch account', e);
      setAccount({ cash: 1000000, positions: {}, trades: [], total_pnl: 0 });
    }
  };

  const copySignal = async (signal: TradingSignal) => {
    setCopying(true);
    try {
      const res = await fetch('/api/account/copy-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: signal.signal,
          stock: signal.pair.stock,
          etf: signal.pair.etf,
          hedgeRatio: signal.pair.hedgeRatio
        })
      });
      const data = await res.json();
      if (data.success) {
        setAccount(data.account);
        alert('信号已复制到模拟账户！');
      }
    } catch (e) {
      console.error('Failed to copy signal', e);
    } finally {
      setCopying(false);
    }
  };

  const resetAccount = async () => {
    if (confirm('确定要重置模拟账户吗？')) {
      try {
        const res = await fetch('/api/account/reset', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setAccount(data.account);
        }
      } catch (e) {
        console.error('Failed to reset account', e);
      }
    }
  };

  const getSignalColor = (signal: string) => {
    if (signal.includes('BUY_STOCK')) return 'text-green-400';
    if (signal.includes('SELL_STOCK')) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getSignalLabel = (signal: string) => {
    switch (signal) {
      case 'BUY_STOCK_SELL_ETF': return '买入股票 / 卖出ETF';
      case 'SELL_STOCK_BUY_ETF': return '卖出股票 / 买入ETF';
      case 'CLOSE_POSITION': return '平仓';
      default: return signal;
    }
  };

  const spreadChartOptions: Highcharts.Options = {
    title: { text: selectedPair ? `${selectedPair.stock} - ${selectedPair.etf} 价差` : '价差分析' },
    chart: { backgroundColor: '#1f2937', type: 'line' },
    xAxis: { title: { text: '交易日' }, labels: { style: { color: '#9ca3af' } } },
    yAxis: { title: { text: '价差' }, labels: { style: { color: '#9ca3af' } }, gridLineColor: '#374151' },
    legend: { itemStyle: { color: '#9ca3af' } },
    series: spreadData ? [
      {
        name: '价差',
        type: 'line',
        color: '#3b82f6',
        data: spreadData.data.map(d => d.spread)
      },
      {
        name: '均值',
        type: 'line',
        color: '#10b981',
        dashStyle: 'Dash',
        data: spreadData.data.map(() => spreadData.mean)
      },
      {
        name: '+2σ',
        type: 'line',
        color: '#ef4444',
        dashStyle: 'Dot',
        data: spreadData.data.map(() => spreadData.mean + 2 * spreadData.std)
      },
      {
        name: '-2σ',
        type: 'line',
        color: '#22c55e',
        dashStyle: 'Dot',
        data: spreadData.data.map(() => spreadData.mean - 2 * spreadData.std)
      }
    ] : []
  };

  return (
    <div className="min-h-screen p-6 bg-gray-900 text-white">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">多因子协整分析 - Pair Trading</h1>
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
      
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('pairs')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'pairs' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
        >
          协整配对
        </button>
        <button
          onClick={() => setActiveTab('signals')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'signals' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
        >
          交易信号
        </button>
        <button
          onClick={() => setActiveTab('account')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'account' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
        >
          模拟账户
        </button>
      </div>

      {activeTab === 'pairs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">协整配对列表</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-3">股票</th>
                    <th className="pb-3">ETF</th>
                    <th className="pb-3">对冲比率</th>
                    <th className="pb-3">P值</th>
                    <th className="pb-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((pair, i) => (
                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/50">
                      <td className="py-3">{pair.stock}</td>
                      <td className="py-3">{pair.etf}</td>
                      <td className="py-3">{pair.hedgeRatio.toFixed(2)}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-sm ${pair.pValue < 0.05 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}">
                          {pair.pValue.toFixed(4)}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => setSelectedPair(pair)}
                          className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
                        >
                          查看价差
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            {spreadData ? (
              <>
                <HighchartsReact highcharts={Highcharts} options={spreadChartOptions} />
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="bg-gray-700 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-blue-400">{spreadData.currentZ.toFixed(2)}</div>
                    <div className="text-gray-400 text-sm">当前Z值</div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-green-400">{spreadData.mean.toFixed(2)}</div>
                    <div className="text-gray-400 text-sm">均值</div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-yellow-400">{spreadData.std.toFixed(2)}</div>
                    <div className="text-gray-400 text-sm">标准差</div>
                  </div>
                </div>
                {Math.abs(spreadData.currentZ) > 2 && (
                  <div className={`mt-4 p-4 rounded text-center ${spreadData.currentZ > 2 ? 'bg-red-900/50' : 'bg-green-900/50'}`}>
                    <span className="text-lg font-bold">
                      {spreadData.currentZ > 2 ? '🔴 价差超过 +2σ，考虑做空股票/做多ETF' : '🟢 价差低于 -2σ，考虑做多股票/做空ETF'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-400">
                请选择一个协整配对查看价差分析
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'signals' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">交易信号</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals.map((signal, i) => (
              <div key={i} className="bg-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{signal.pair.stock}</h3>
                    <p className="text-gray-400 text-sm">vs {signal.pair.etf}</p>
                  </div>
                  <span className={`px-3 py-1 rounded text-sm font-medium ${signal.signal.includes('BUY') ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                    {getSignalLabel(signal.signal)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div>
                  <span className="text-gray-400">Z值:</span>
                  <span className={`ml-2 font-bold ${signal.spread.zScore > 2 ? 'text-red-400' : signal.spread.zScore < -2 ? 'text-green-400' : 'text-white'}`}>
                    {signal.spread.zScore.toFixed(2)}
                  </span>
                  </div>
                  <div>
                    <span className="text-gray-400">对冲比率:</span>
                    <span className="ml-2 font-bold">{signal.pair.hedgeRatio.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={() => copySignal(signal)}
                  disabled={copying}
                  className="w-full py-2 bg-blue-600 rounded hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  📋 一键复制到模拟账户
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'account' && account && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">模拟账户</h2>
              <button
                onClick={resetAccount}
                className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
              >
                重置账户
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-700 p-4 rounded text-center">
                <div className="text-3xl font-bold text-green-400">¥{account.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="text-gray-400">可用资金</div>
              </div>
              <div className="bg-gray-700 p-4 rounded text-center">
                <div className="text-3xl font-bold text-blue-400">{Object.keys(account.positions).length}</div>
                <div className="text-gray-400">持仓数量</div>
              </div>
              <div className="bg-gray-700 p-4 rounded text-center">
                <div className="text-3xl font-bold text-yellow-400">{account.trades.length}</div>
                <div className="text-gray-400">成交笔数</div>
              </div>
              <div className="bg-gray-700 p-4 rounded text-center">
                <div className={`text-3xl font-bold ${account.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ¥{account.total_pnl.toFixed(2)}
                </div>
                <div className="text-gray-400">总盈亏</div>
              </div>
            </div>

            {Object.keys(account.positions).length > 0 && (
              <div className="mb-6">
              <h3 className="text-lg font-bold mb-3">当前持仓</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-2">标的</th>
                      <th className="pb-2">数量</th>
                      <th className="pb-2">均价</th>
                      <th className="pb-2">市值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(account.positions).map(([symbol, pos], i) => (
                      <tr key={i} className="border-b border-gray-700">
                        <td className="py-2 font-medium">{symbol}</td>
                        <td className="py-2">{pos.quantity}</td>
                        <td className="py-2">¥{pos.avgPrice.toFixed(2)}</td>
                        <td className="py-2">¥{(pos.quantity * pos.avgPrice).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {account.trades.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-3">交易记录</h3>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-800">
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="pb-2">时间</th>
                        <th className="pb-2">信号</th>
                        <th className="pb-2">股票</th>
                        <th className="pb-2">ETF</th>
                        <th className="pb-2">名义金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.trades.slice().reverse().map((trade, i) => (
                        <tr key={i} className="border-b border-gray-700">
                          <td className="py-2 text-sm">{new Date(trade.timestamp).toLocaleString()}</td>
                          <td className={`py-2 text-sm ${getSignalColor(trade.signal)}`}>
                            {getSignalLabel(trade.signal)}
                          </td>
                          <td className="py-2 text-sm">{trade.stock} ({trade.stockQuantity}股)</td>
                          <td className="py-2 text-sm">{trade.etf} ({trade.etfQuantity}份)</td>
                          <td className="py-2 text-sm">¥{trade.notional.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
