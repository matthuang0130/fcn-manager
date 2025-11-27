import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Activity, ChevronDown, RefreshCw, X, Clock, Edit3, List, Eye, EyeOff, Coins, AlertCircle, User, Briefcase, Check, Download, Copy, FileText } from 'lucide-react';

/**
 * FCN 投資組合管理系統 (UI Update v16)
 * Style: 在年息附近新增 KI/履約/KO 百分比資訊
 * Update: Storage Key v16
 */

// --- 預設資料 ---
const DEFAULT_CLIENTS = [
  { id: 'c1', name: '預設投資人' }
];

const INITIAL_POSITIONS = [
  {
    id: 1,
    clientId: 'c1',
    productName: "FCN Tech Giants",
    issuer: "GS",
    nominal: 100000,
    currency: "USD",
    couponRate: 12.5,
    strikeDate: "2024-01-15",
    koObservationStartDate: "2024-04-15",
    tenor: "6 個月",
    maturityDate: "2024-07-15",
    koLevel: 105, 
    kiLevel: 70, 
    strikeLevel: 100, 
    underlyings: [
      { ticker: "NVDA", entryPrice: 550 },
      { ticker: "AMD", entryPrice: 140 }
    ],
    status: "Active"
  }
];

const DEFAULT_MARKET_PRICES = {
  "NVDA": 610.50,
  "AMD": 135.20,
  "TSLA": 190.00,
  "RIVN": 11.50,
  "AAPL": 175.00,
  "MSFT": 405.00,
  "7203": 3550,
  "7267": 1700,
  "COIN": 165.00
};

// Storage Keys
const KEY_POSITIONS = 'fcn_positions_v16'; 
const KEY_PRICES = 'fcn_market_prices_v16';
const KEY_CLIENTS = 'fcn_clients_v16';
const KEY_UPDATE_DATE = 'fcn_last_update_date_v16';
const KEY_SHEET_ID = 'fcn_google_sheet_id_v16';

// Helper: 安全讀取 LocalStorage
const safeGetStorage = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;
    const parsed = JSON.parse(saved);
    if (key.includes('clients') && !Array.isArray(parsed)) return defaultValue;
    return parsed;
  } catch (e) {
    return defaultValue;
  }
};

// Helper: 全形轉半形
const toHalfWidth = (str) => str ? str.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ') : "";

const App = () => {
  // --- State ---
  const [clients, setClients] = useState(() => safeGetStorage(KEY_CLIENTS, DEFAULT_CLIENTS));
  
  const [activeClientId, setActiveClientId] = useState(() => {
    const initialClients = safeGetStorage(KEY_CLIENTS, DEFAULT_CLIENTS);
    return (initialClients && initialClients.length > 0) ? initialClients[0].id : 'c1';
  });

  const [allPositions, setAllPositions] = useState(() => {
    let data = safeGetStorage(KEY_POSITIONS, INITIAL_POSITIONS);
    if (!Array.isArray(data)) data = INITIAL_POSITIONS;
    if (data.length > 0 && !data[0].clientId) {
        data = data.map(p => ({...p, clientId: 'c1'}));
    }
    return data;
  });

  const [marketPrices, setMarketPrices] = useState(() => safeGetStorage(KEY_PRICES, DEFAULT_MARKET_PRICES));
  const [lastUpdated, setLastUpdated] = useState(() => localStorage.getItem(KEY_UPDATE_DATE) || "尚無紀錄");
  const [googleSheetId, setGoogleSheetId] = useState(() => localStorage.getItem(KEY_SHEET_ID) || "");

  // UI States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBatchPriceModalOpen, setIsBatchPriceModalOpen] = useState(false);
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false); // New Export Modal
  const [isLoading, setIsLoading] = useState(false);
  const [showEmbedSheet, setShowEmbedSheet] = useState(false);

  // Form States
  const [newPosition, setNewPosition] = useState({
    productName: "", issuer: "", nominal: 10000, currency: "USD", couponRate: 10,
    koLevel: 103, kiLevel: 70, strikeLevel: 100,
    strikeDate: new Date().toISOString().split('T')[0],
    koObservationStartDate: "", tenor: "6 個月", maturityDate: ""
  });
  const [tempUnderlyings, setTempUnderlyings] = useState([{ id: 1, ticker: "AAPL", entryPrice: 175 }]);

  // Computed
  const activeClient = useMemo(() => {
    return clients.find(c => c.id === activeClientId) || { id: 'temp', name: '未知投資人' };
  }, [clients, activeClientId]);
  
  const currentClientPositions = useMemo(() => {
    return allPositions.filter(p => p.clientId === activeClientId);
  }, [allPositions, activeClientId]);

  const activeTickers = useMemo(() => {
    const tickers = new Set();
    allPositions.forEach(p => {
      if(p.underlyings) {
        p.underlyings.forEach(u => tickers.add(u.ticker));
      }
    });
    return Array.from(tickers).sort();
  }, [allPositions]);

  // --- Persistence ---
  useEffect(() => { try { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); } catch(e){} }, [clients]);
  useEffect(() => { try { localStorage.setItem(KEY_POSITIONS, JSON.stringify(allPositions)); } catch(e){} }, [allPositions]);
  useEffect(() => { try { localStorage.setItem(KEY_PRICES, JSON.stringify(marketPrices)); } catch(e){} }, [marketPrices]);
  useEffect(() => { try { localStorage.setItem(KEY_SHEET_ID, googleSheetId); } catch(e){} }, [googleSheetId]);

  // --- Helpers ---
  const normalizeTicker = (ticker) => {
    if (!ticker) return "";
    let normalized = toHalfWidth(ticker.toString()).toUpperCase();
    return normalized.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
  };

  const getPriceForTicker = (ticker) => {
    const cleanTarget = normalizeTicker(ticker);
    if (marketPrices[ticker] !== undefined) return marketPrices[ticker];
    const foundKey = Object.keys(marketPrices).find(k => normalizeTicker(k) === cleanTarget);
    if (foundKey) return marketPrices[foundKey];
    return undefined;
  };

  const formatMoney = (val, currency) => currency === 'JPY' ? `¥${val.toLocaleString()}` : `$${val.toLocaleString()}`;

  // --- Core Logic ---
  const calculateRisk = (pos) => {
    let laggard = null;
    let minPerf = 99999;

    const underlyingDetails = (pos.underlyings || []).map(u => {
      const marketPrice = getPriceForTicker(u.ticker);
      const currentPrice = marketPrice !== undefined ? marketPrice : u.entryPrice;
      const performance = (currentPrice / u.entryPrice) * 100;
      
      const detail = { 
        ...u, 
        currentPrice, 
        performance,
        kiPrice: u.entryPrice * (pos.kiLevel/100),
        koPrice: u.entryPrice * (pos.koLevel/100),
        strikePrice: u.entryPrice * (pos.strikeLevel/100)
      };
      
      if (performance < minPerf) {
        minPerf = performance;
        laggard = detail;
      }
      return detail;
    });

    const monthlyCoupon = Math.round((pos.nominal * (pos.couponRate / 100)) / 12);
    let riskStatus = "Normal";
    let statusColor = "bg-blue-100 text-blue-800";
    
    if (minPerf <= pos.kiLevel) {
      riskStatus = "KI HIT";
      statusColor = "bg-red-100 text-red-800 font-bold border border-red-300";
    } else if (minPerf <= pos.kiLevel + 5) {
      riskStatus = "Near KI";
      statusColor = "bg-orange-100 text-orange-800 font-bold";
    } else if (minPerf >= pos.koLevel) {
      riskStatus = "KO Ready";
      statusColor = "bg-green-100 text-green-800 font-bold border border-green-300";
    }

    return { 
      ...pos, 
      underlyingDetails, 
      laggard: laggard || { ticker: 'N/A', performance: 0, currentPrice: 0, entryPrice: 0 }, 
      riskStatus, 
      statusColor, 
      monthlyCoupon
    };
  };

  const processedPositions = useMemo(() => {
    return currentClientPositions.map(calculateRisk);
  }, [currentClientPositions, marketPrices]);

  const summary = useMemo(() => {
    const usd = processedPositions.filter(p => p.currency === 'USD');
    const jpy = processedPositions.filter(p => p.currency === 'JPY');
    
    const sum = (list, key) => list.reduce((acc, curr) => acc + curr[key], 0);

    return {
      usd: { nominal: sum(usd, 'nominal'), monthly: sum(usd, 'monthlyCoupon') },
      jpy: { nominal: sum(jpy, 'nominal'), monthly: sum(jpy, 'monthlyCoupon') },
      kiCount: processedPositions.filter(p => p.riskStatus.includes("KI")).length,
      koCount: processedPositions.filter(p => p.riskStatus.includes("KO")).length
    };
  }, [processedPositions]);

  // --- Handlers ---
  
  const handleForceUpdate = async () => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setMarketPrices(prev => {
      const next = { ...prev };
      activeTickers.forEach(t => {
        const curr = getPriceForTicker(t) || 100;
        next[t] = parseFloat((curr * (1 + (Math.random()*0.04 - 0.02))).toFixed(2));
      });
      return next;
    });
    setLastUpdated(new Date().toLocaleString());
    setIsLoading(false);
  };

  const handleAddPosition = (e) => {
    e.preventDefault();
    const validUnderlyings = tempUnderlyings
      .filter(u => u.ticker.trim() !== "")
      .map(u => ({ ticker: u.ticker.toUpperCase(), entryPrice: parseFloat(u.entryPrice) }));

    if (validUnderlyings.length === 0) return;

    const updatedPrices = { ...marketPrices };
    validUnderlyings.forEach(u => {
      if (getPriceForTicker(u.ticker) === undefined) updatedPrices[u.ticker] = u.entryPrice;
    });
    setMarketPrices(updatedPrices);

    const tickersStr = validUnderlyings.map(u => u.ticker).join('/');
    const newEntry = {
      id: Date.now(),
      clientId: activeClientId,
      productName: newPosition.productName || `FCN ${tickersStr}`,
      issuer: newPosition.issuer || "Self",
      nominal: parseFloat(newPosition.nominal),
      currency: newPosition.currency,
      couponRate: parseFloat(newPosition.couponRate),
      strikeDate: newPosition.strikeDate,
      koObservationStartDate: newPosition.koObservationStartDate,
      maturityDate: newPosition.maturityDate,
      tenor: newPosition.tenor,
      koLevel: parseFloat(newPosition.koLevel),
      kiLevel: parseFloat(newPosition.kiLevel),
      strikeLevel: parseFloat(newPosition.strikeLevel),
      underlyings: validUnderlyings,
      status: "Active"
    };

    setAllPositions([...allPositions, newEntry]);
    setIsAddModalOpen(false);
  };

  const deletePosition = (id) => {
    setAllPositions(allPositions.filter(p => p.id !== id));
  };

  // --- Client Handlers ---
  const handleAddClient = (name) => {
    if (name) {
      const newId = `c${Date.now()}`;
      const newClients = [...clients, { id: newId, name }];
      setClients(newClients);
      setActiveClientId(newId);
    }
  };

  const handleDeleteClient = (id) => {
    if (clients.length <= 1) {
      alert("至少需保留一位投資人");
      return;
    }
    if (confirm("確定刪除此投資人？所有部位將一併刪除。")) {
      const newClients = clients.filter(c => c.id !== id);
      setClients(newClients);
      setAllPositions(allPositions.filter(p => p.clientId !== id));
      if (activeClientId === id) setActiveClientId(newClients[0].id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <div className="flex items-center gap-2">
                <Activity className="text-blue-600 h-6 w-6" />
                <h1 className="text-lg font-bold text-slate-800 hidden sm:block">FCN 管理</h1>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 pr-3 relative group">
                <div className="bg-white p-1.5 rounded shadow-sm text-blue-600">
                  <User size={16} />
                </div>
                <select 
                  value={activeClientId}
                  onChange={(e) => setActiveClientId(e.target.value)}
                  className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer appearance-none pr-6 min-w-[120px]"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 text-slate-400 pointer-events-none"/>
                <button 
                  onClick={() => setIsClientManagerOpen(true)}
                  className="ml-2 text-slate-400 hover:text-blue-600"
                  title="管理投資人"
                >
                  <Edit3 size={14} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end overflow-x-auto no-scrollbar">
               
               {/* Export Button */}
               <button 
                onClick={() => setIsExportModalOpen(true)}
                className="flex-none flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap"
              >
                <FileText size={16} />
                <span className="hidden sm:inline">匯出</span>
                <span className="sm:hidden">匯出</span>
              </button>

               <button onClick={() => setIsBatchPriceModalOpen(true)} className="flex-none flex items-center justify-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap">
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                <span className="hidden sm:inline">報價</span>
                <span className="sm:hidden">報價</span>
              </button>
              <button onClick={() => setIsAddModalOpen(true)} className="flex-none flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition shadow-md whitespace-nowrap">
                <Plus size={16} />
                <span className="hidden sm:inline">新增</span>
                <span className="sm:hidden">新增</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-9 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
              <div className="flex justify-between mb-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase">USD 資產</span>
                <DollarSign size={14} className="text-slate-300"/>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>本金</span>
                  <span className="font-bold text-slate-800">${(summary.usd.nominal/1000).toFixed(0)}k</span>
                </div>
                <div className="flex justify-between text-xs text-green-600">
                  <span>月息</span>
                  <span className="font-bold">+${summary.usd.monthly.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
              <div className="flex justify-between mb-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase">JPY 資產</span>
                <Coins size={14} className="text-slate-300"/>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>本金</span>
                  <span className="font-bold text-slate-800">¥{(summary.jpy.nominal/10000).toFixed(0)}w</span>
                </div>
                <div className="flex justify-between text-xs text-green-600">
                  <span>月息</span>
                  <span className="font-bold">+¥{summary.jpy.monthly.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className={`p-3 rounded-xl border shadow-sm flex flex-col justify-between ${summary.koCount > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
              <span className="text-[10px] text-slate-500 font-bold uppercase">KO 機會</span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-blue-600">{summary.koCount}</span>
                <TrendingUp size={18} className="text-blue-400 mb-1"/>
              </div>
            </div>
            <div className={`p-3 rounded-xl border shadow-sm flex flex-col justify-between ${summary.kiCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <span className="text-[10px] text-slate-500 font-bold uppercase">KI 風險</span>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-red-600">{summary.kiCount}</span>
                <AlertTriangle size={18} className="text-red-400 mb-1"/>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="font-semibold text-slate-700">持有部位明細</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3 font-medium w-56">產品資訊</th>
                    <th className="px-4 py-3 font-medium text-right">名目本金 / 預估月息</th>
                    <th className="px-4 py-3 font-medium">連結標的詳細監控 (Underlyings)</th>
                    <th className="px-4 py-3 font-medium text-center">Laggard 風險</th>
                    <th className="px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processedPositions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-50 transition group">
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-2 mb-1">
                           <span className={`text-[10px] px-1.5 rounded font-bold ${pos.currency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                             {pos.currency}
                           </span>
                           {/* 修改: 產品名稱縮小至 text-xs 並調淡顏色 */}
                           <div className="text-xs text-slate-500 font-medium truncate max-w-[140px]">{pos.productName}</div>
                        </div>
                        
                        {/* 新增: 結構參數標籤列 */}
                        <div className="flex flex-col gap-1.5 my-2">
                             <div className="flex flex-wrap gap-2 items-center">
                                 <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 border border-slate-200">{pos.issuer}</span>
                                 <span className="bg-blue-100 px-2 py-0.5 rounded text-sm text-blue-800 font-bold">年息 {pos.couponRate}%</span>
                             </div>
                             <div className="flex flex-wrap gap-1.5">
                                 <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-medium">KI {pos.kiLevel}%</span>
                                 <span className="text-[10px] bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-medium">履約 {pos.strikeLevel}%</span>
                                 <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100 font-medium">KO {pos.koLevel}%</span>
                             </div>
                        </div>

                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                           <Clock size={10}/> {pos.maturityDate} 到期
                        </div>
                      </td>
                      
                      <td className="px-4 py-4 text-right align-top">
                        <div className="font-mono font-medium text-slate-700 text-sm">
                          {formatMoney(pos.nominal, pos.currency)}
                        </div>
                        <div className="text-sm text-green-600 font-bold mt-1 bg-green-50 px-2 py-0.5 rounded inline-block">
                          月息 {formatMoney(pos.monthlyCoupon, pos.currency)}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          {(pos.underlyingDetails || []).map((u) => {
                            const isLaggard = u.ticker === pos.laggard.ticker;
                            return (
                              <div key={u.ticker} className={`flex items-center justify-between text-xs p-1.5 rounded border ${isLaggard ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-100'}`}>
                                <div className="flex items-center gap-1 min-w-[60px]">
                                  {/* 修改: 連結標的代碼放大至 text-base 並加粗 */}
                                  <span className="font-extrabold text-slate-800 text-base">{u.ticker}</span>
                                  {isLaggard && <AlertCircle size={10} className="text-yellow-600"/>}
                                </div>
                                <div className="flex gap-3 font-mono">
                                  <div className="flex flex-col items-end">
                                    <span className="text-[9px] text-slate-400">現價</span>
                                    <span className={`font-bold ${u.performance < 100 ? 'text-red-600' : 'text-green-600'}`}>
                                      {u.performance.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end border-l border-slate-100 pl-2">
                                    <span className="text-[9px] text-slate-400">Strike</span>
                                    {/* 修改: 履約價放大至 text-sm 並加粗 */}
                                    <span className="text-sm font-extrabold text-slate-900">${u.strikePrice.toLocaleString()}</span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[9px] text-slate-400">KI</span>
                                    <span className="font-bold text-red-600">${u.kiPrice.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top min-w-[140px]">
                        <div className="flex flex-col items-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${pos.statusColor}`}>
                            {pos.riskStatus}
                          </span>
                          <ProgressBar current={pos.laggard.performance} ki={pos.kiLevel} ko={pos.koLevel} />
                          <div className="w-full flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                             <span>KI:{pos.kiLevel}%</span>
                             <span>KO:{pos.koLevel}%</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right align-top">
                        <button onClick={() => deletePosition(pos.id)} className="text-slate-300 hover:text-red-500 p-2">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {processedPositions.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                        目前沒有部位，請點擊右上角「新增」
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sticky top-24">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <List size={16} className="text-blue-500" />
                共用報價
              </h3>
              <div className="flex gap-2">
                {googleSheetId && (
                  <button 
                    onClick={() => setShowEmbedSheet(!showEmbedSheet)}
                    className={`text-[10px] px-2 py-1 rounded transition flex items-center gap-1 ${showEmbedSheet ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {showEmbedSheet ? <Eye size={10}/> : <EyeOff size={10}/>}
                    {showEmbedSheet ? '隱藏' : '表格'}
                  </button>
                )}
              </div>
            </div>
            
            {googleSheetId && showEmbedSheet && (
               <div className="mb-4 border border-slate-200 rounded overflow-hidden shadow-inner h-48 bg-slate-50 relative">
                  <iframe 
                    src={`https://docs.google.com/spreadsheets/d/${googleSheetId}/pubhtml?widget=true&headers=false`}
                    className="w-full h-full border-0"
                    title="Google Sheet Embed"
                  />
               </div>
            )}

            <div className={`space-y-3 overflow-y-auto pr-1 ${showEmbedSheet ? 'max-h-[40vh]' : 'max-h-[70vh]'}`}>
              {activeTickers.map((ticker) => {
                const price = getPriceForTicker(ticker) || 100;
                const isMapped = getPriceForTicker(ticker) !== undefined;
                return (
                  <div key={ticker} className="space-y-1 pb-2 border-b border-slate-100 last:border-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-xs text-slate-700 bg-slate-100 px-1.5 rounded">{ticker}</span>
                      {!isMapped && <span className="text-[9px] text-red-500">未對應</span>}
                    </div>
                    <input 
                      type="number" 
                      value={price}
                      onChange={(e) => {}} // Read-only
                      readOnly
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded text-right font-mono bg-slate-50"
                      step="0.01"
                    />
                  </div>
                );
              })}
              {activeTickers.length === 0 && <div className="text-center text-xs text-slate-400 py-4">尚無標的</div>}
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {isBatchPriceModalOpen && (
        <BatchPriceModal 
          isOpen={isBatchPriceModalOpen} 
          onClose={() => setIsBatchPriceModalOpen(false)}
          marketPrices={marketPrices}
          setMarketPrices={setMarketPrices}
          setLastUpdated={setLastUpdated}
          googleSheetId={googleSheetId}
          setGoogleSheetId={setGoogleSheetId}
        />
      )}

      {isAddModalOpen && (
        <AddPositionModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onAdd={handleAddPosition}
          newPosition={newPosition}
          setNewPosition={setNewPosition}
          tempUnderlyings={tempUnderlyings}
          setTempUnderlyings={setTempUnderlyings}
        />
      )}

      {isClientManagerOpen && (
        <ClientManagerModal 
          isOpen={isClientManagerOpen}
          onClose={() => setIsClientManagerOpen(false)}
          clients={clients}
          onAdd={handleAddClient}
          onDelete={handleDeleteClient}
          activeId={activeClientId}
        />
      )}

      {isExportModalOpen && (
        <ExportModal 
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          allPositions={allPositions}
          clients={clients}
          marketPrices={marketPrices}
          calculateRisk={calculateRisk}
        />
      )}
    </div>
  );
};

// --- Sub Components ---

// New Export Modal with Manual Copy Fallback
const ExportModal = ({ isOpen, onClose, allPositions, clients, marketPrices, calculateRisk }) => {
  const [csvContent, setCsvContent] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const textAreaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const headers = ["投資人", "產品名稱", "發行商", "幣別", "名目本金", "年息(%)", "到期日", "KI(%)", "KO(%)", "最差標的", "現價", "進場價", "表現(%)", "狀態"];
      const rows = allPositions.map(pos => {
        const calculated = calculateRisk(pos);
        const clientName = clients.find(c => c.id === pos.clientId)?.name || "未知";
        return [
          clientName, pos.productName, pos.issuer, pos.currency, pos.nominal, pos.couponRate, pos.maturityDate, pos.kiLevel, pos.koLevel,
          calculated.laggard.ticker, calculated.laggard.currentPrice, calculated.laggard.entryPrice, calculated.laggard.performance.toFixed(2), calculated.riskStatus
        ];
      });
      const content = [headers.join(','), ...rows.map(row => row.map(item => `"${String(item).replace(/"/g, '""')}"`).join(','))].join('\n');
      setCsvContent(content);
    }
  }, [isOpen, allPositions, clients, marketPrices]);

  const handleCopy = () => {
    if (textAreaRef.current) {
      textAreaRef.current.select();
      textAreaRef.current.setSelectionRange(0, 99999); // For mobile
      try {
        document.execCommand('copy');
        setCopyStatus('複製成功！請貼上到 Excel');
      } catch (err) {
        setCopyStatus('複製失敗，請長按文字框手動複製');
      }
    }
  };

  const handleDownload = () => {
    try {
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `FCN_Portfolio.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert("下載被阻擋，請使用上方複製功能。");
    }
  };

  if(!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 mb-10">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h3 className="font-bold text-slate-800">匯出資料</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">如果下載失敗，請點擊「複製」並貼到 Excel，或直接全選下方文字複製。</p>
          <textarea 
            ref={textAreaRef}
            readOnly
            className="w-full h-32 border p-2 text-xs font-mono rounded bg-slate-50"
            value={csvContent}
          />
          <div className="flex gap-3">
            <button onClick={handleCopy} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
              <Copy size={16}/> {copyStatus || "複製內容"}
            </button>
            <button onClick={handleDownload} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
              <Download size={16}/> 下載 CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClientManagerModal = ({ isOpen, onClose, clients, onAdd, onDelete, activeId }) => {
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleConfirmAdd = (e) => {
    e.preventDefault();
    if(newName.trim()) {
        onAdd(newName.trim());
        setNewName('');
        setIsAdding(false);
    }
  };

  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">管理投資人</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {clients.map(c => (
            <div key={c.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 group">
              <div className="flex items-center gap-2">
                <User size={16} className={c.id === activeId ? "text-blue-600" : "text-slate-400"}/>
                <span className={`text-sm ${c.id === activeId ? "font-bold text-blue-700" : "text-slate-700"}`}>{c.name}</span>
                {c.id === activeId && <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 rounded">當前</span>}
              </div>
              <button onClick={() => onDelete(c.id)} className="text-slate-300 hover:text-red-500 p-1">
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
        </div>

        {isAdding ? (
            <form onSubmit={handleConfirmAdd} className="flex gap-2 animate-in fade-in zoom-in duration-200">
                <input 
                    autoFocus
                    type="text" 
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="輸入名稱..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-lg">
                    <Check size={16}/>
                </button>
                <button type="button" onClick={()=>setIsAdding(false)} className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg">
                    <X size={16}/>
                </button>
            </form>
        ) : (
            <button onClick={()=>setIsAdding(true)} className="w-full border border-dashed border-slate-300 text-slate-500 py-2.5 rounded-lg text-sm hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300 transition flex items-center justify-center gap-2">
              <Plus size={14}/> 新增投資人
            </button>
        )}
      </div>
    </div>
  );
};

const AddPositionModal = ({ isOpen, onClose, onAdd, newPosition, setNewPosition, tempUnderlyings, setTempUnderlyings }) => {
  const addU = () => setTempUnderlyings([...tempUnderlyings, { id: Date.now(), ticker: "", entryPrice: 100 }]);
  const removeU = (id) => setTempUnderlyings(tempUnderlyings.filter(u => u.id !== id));
  const updateU = (id, f, v) => setTempUnderlyings(tempUnderlyings.map(u => u.id === id ? { ...u, [f]: v } : u));

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-5 mb-10 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-lg font-bold text-slate-800">新增部位</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        <form onSubmit={onAdd} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="sm:col-span-2 md:col-span-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">產品名稱</label>
              <input type="text" required className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                value={newPosition.productName} onChange={e => setNewPosition({...newPosition, productName: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">發行商</label>
              <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                value={newPosition.issuer} onChange={e => setNewPosition({...newPosition, issuer: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">幣別</label>
              <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                value={newPosition.currency} onChange={e => setNewPosition({...newPosition, currency: e.target.value})}>
                <option value="USD">USD (美元)</option>
                <option value="JPY">JPY (日圓)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">本金</label>
              <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                value={newPosition.nominal} onChange={e => setNewPosition({...newPosition, nominal: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">年息(%)</label>
              <input type="number" className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                value={newPosition.couponRate} onChange={e => setNewPosition({...newPosition, couponRate: e.target.value})} />
            </div>
          </div>
          
          <div className="p-3 bg-slate-50 rounded border grid grid-cols-3 gap-4">
             <div><label className="text-xs font-bold text-slate-500">KI%</label><input type="number" className="w-full border rounded px-2 py-1 text-sm font-bold text-red-600" value={newPosition.kiLevel} onChange={e=>setNewPosition({...newPosition, kiLevel:e.target.value})}/></div>
             <div><label className="text-xs font-bold text-slate-500">Strike%</label><input type="number" className="w-full border rounded px-2 py-1 text-sm font-bold" value={newPosition.strikeLevel} onChange={e=>setNewPosition({...newPosition, strikeLevel:e.target.value})}/></div>
             <div><label className="text-xs font-bold text-slate-500">KO%</label><input type="number" className="w-full border rounded px-2 py-1 text-sm font-bold text-green-600" value={newPosition.koLevel} onChange={e=>setNewPosition({...newPosition, koLevel:e.target.value})}/></div>
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div><label className="text-xs text-slate-500">KO 觀察日</label><input type="date" className="w-full border rounded px-2 py-1 text-sm" value={newPosition.koObservationStartDate} onChange={e=>setNewPosition({...newPosition, koObservationStartDate:e.target.value})}/></div>
             <div><label className="text-xs text-slate-500">到期日</label><input type="date" className="w-full border rounded px-2 py-1 text-sm" value={newPosition.maturityDate} onChange={e=>setNewPosition({...newPosition, maturityDate:e.target.value})}/></div>
             <div><label className="text-xs text-slate-500">存續期</label><input type="text" className="w-full border rounded px-2 py-1 text-sm" value={newPosition.tenor} onChange={e=>setNewPosition({...newPosition, tenor:e.target.value})}/></div>
          </div>

          <div>
            <div className="flex justify-between mb-2"><label className="text-sm font-bold">連結標的</label><button type="button" onClick={addU} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">+ 新增</button></div>
            {tempUnderlyings.map(u => (
              <div key={u.id} className="flex gap-2 mb-2">
                <input type="text" placeholder="代碼" className="w-1/2 border rounded px-2 py-1 text-sm uppercase" value={u.ticker} onChange={e=>updateU(u.id, 'ticker', e.target.value)}/>
                <input type="number" placeholder="進場價" className="w-1/2 border rounded px-2 py-1 text-sm" value={u.entryPrice} onChange={e=>updateU(u.id, 'entryPrice', e.target.value)}/>
                <button type="button" onClick={()=>removeU(u.id)} className="text-slate-400"><Trash2 size={16}/></button>
              </div>
            ))}
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm">建立部位</button>
        </form>
      </div>
    </div>
  );
};

const BatchPriceModal = ({ isOpen, onClose, marketPrices, setMarketPrices, setLastUpdated, googleSheetId, setGoogleSheetId }) => {
  const [activeTab, setActiveTab] = useState('paste'); 
  const [pasteContent, setPasteContent] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [status, setStatus] = useState('');

  const parseSheetId = (url) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : (url.length > 20 && !url.includes('/') ? url : null);
  };

  const handlePaste = () => {
    const lines = pasteContent.split('\n');
    const newPrices = { ...marketPrices };
    let count = 0;
    lines.forEach(line => {
      const match = line.replace(/[¥$,JPY"\s]/g, '').match(/([A-Za-z0-9.:]+)[^\d-]*([\d.,]+)/);
      if(match) {
        const t = match[1].toUpperCase().replace("TYO:","").replace(".T","");
        const p = parseFloat(match[2].replace(/,/g,''));
        if(!isNaN(p)) { newPrices[t] = p; count++; }
      }
    });
    setMarketPrices(newPrices);
    localStorage.setItem(KEY_PRICES, JSON.stringify(newPrices));
    setLastUpdated(new Date().toLocaleDateString() + " (貼上)");
    setStatus(`成功更新 ${count} 筆`);
    setTimeout(onClose, 1000);
  };

  const handleSheet = () => {
    const id = parseSheetId(inputUrl);
    if(id) {
      setGoogleSheetId(id);
      setStatus("ID 已設定，請點擊主畫面同步按鈕");
      setTimeout(onClose, 1500);
    } else {
      setStatus("無效的連結");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 mb-10">
        <div className="flex justify-between mb-4 border-b pb-2">
           <h3 className="font-bold">更新報價</h3>
           <button onClick={onClose}><X/></button>
        </div>
        <div className="flex gap-2 mb-4">
           <button onClick={()=>setActiveTab('paste')} className={`flex-1 py-2 text-xs rounded ${activeTab==='paste'?'bg-blue-50 text-blue-600 font-bold':'bg-slate-50'}`}>貼上</button>
           <button onClick={()=>setActiveTab('sheet')} className={`flex-1 py-2 text-xs rounded ${activeTab==='sheet'?'bg-blue-50 text-blue-600 font-bold':'bg-slate-50'}`}>Google Sheet</button>
        </div>
        
        {activeTab === 'paste' ? (
          <div className="space-y-3">
            <textarea className="w-full h-32 border p-2 text-xs font-mono rounded" placeholder="NVDA 800&#10;7203 3500" value={pasteContent} onChange={e=>setPasteContent(e.target.value)}/>
            <button onClick={handlePaste} className="w-full bg-blue-600 text-white py-2 rounded text-sm">更新</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="w-full border p-2 text-xs rounded" placeholder="Google Sheet URL..." value={inputUrl} onChange={e=>setInputUrl(e.target.value)}/>
            <button onClick={handleSheet} className="w-full bg-green-600 text-white py-2 rounded text-sm">設定連結</button>
            <p className="text-[10px] text-slate-400">需先將檔案「發布到網路」為 CSV 格式</p>
          </div>
        )}
        {status && <p className="text-center text-xs mt-2 text-blue-600">{status}</p>}
      </div>
    </div>
  );
};

const ProgressBar = ({ current, ki, ko }) => {
  const getPos = (val) => Math.min(Math.max(((val - (ki - 15)) / (ko + 10 - (ki - 15))) * 100, 0), 100);
  return (
    <div className="relative w-full h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
      <div className="absolute top-0 bottom-0 left-0 bg-red-300" style={{ width: `${getPos(ki)}%` }} />
      <div className="absolute top-0 bottom-0 right-0 bg-green-300" style={{ width: `${100 - getPos(ko)}%` }} />
      <div className="absolute top-0 bottom-0 w-1 bg-blue-600 z-10" style={{ left: `${getPos(current)}%` }} />
    </div>
  );
};

export default App;