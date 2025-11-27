import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Activity, ChevronDown, RefreshCw, X, Clock, Edit3, List, Eye, EyeOff, Coins, AlertCircle, User, Briefcase, Check, Download, Copy, FileText, Pencil, Lock, Unlock, Settings, Share2, Link as LinkIcon, LogIn, FileJson, Globe } from 'lucide-react';

/**
 * FCN 投資組合管理系統 (Share Guard v46)
 * Fix: 加入環境檢測機制，防止在 file:// 或 localhost 環境下產生無效的分享連結
 * UI: 優化 Landing Page 與分享視窗的提示訊息
 * Update: Storage Key v46
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
const KEY_POSITIONS = 'fcn_positions_v46'; 
const KEY_PRICES = 'fcn_market_prices_v46';
const KEY_CLIENTS = 'fcn_clients_v46';
const KEY_UPDATE_DATE = 'fcn_last_update_date_v46';
const KEY_SHEET_ID = 'fcn_google_sheet_id_v46';
const KEY_PASSWORD = 'fcn_admin_password_v46'; 

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

// Helper: Base64URL Encode/Decode (URL Safe)
const base64UrlEncode = (str) => {
    const base64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlDecode = (str) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
};

// Helper: 統一複製功能
const copyToClipboard = (text) => {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        return false;
    }
};

// --- Minification Helpers ---
const minifyData = (payload) => {
    return {
        v: 1,
        n: payload.clientName,
        t: payload.lastUpdated,
        p: payload.positions.map(p => [
            p.productName, p.issuer, p.nominal, p.currency, p.couponRate, 
            p.koLevel, p.kiLevel, p.strikeLevel, p.strikeDate, 
            p.koObservationStartDate, p.maturityDate, p.tenor, 
            p.underlyings.map(u => [u.ticker, u.entryPrice])
        ]),
        m: payload.prices
    };
};

const unminifyData = (minified) => {
    if (!minified.v) return minified; 
    return {
        clientName: minified.n,
        lastUpdated: minified.t,
        prices: minified.m,
        positions: minified.p.map((arr, index) => ({
            id: index, 
            productName: arr[0], issuer: arr[1], nominal: arr[2], currency: arr[3],
            couponRate: arr[4], koLevel: arr[5], kiLevel: arr[6], strikeLevel: arr[7],
            strikeDate: arr[8], koObservationStartDate: arr[9], maturityDate: arr[10],
            tenor: arr[11], underlyings: arr[12].map(u => ({ ticker: u[0], entryPrice: u[1] })),
            status: "Active", clientId: 'guest'
        }))
    };
};

// 空白表單預設值
const DEFAULT_FORM_STATE = {
  productName: "", issuer: "", nominal: 10000, currency: "USD", couponRate: 10,
  koLevel: 103, kiLevel: 70, strikeLevel: 100,
  strikeDate: new Date().toISOString().split('T')[0],
  koObservationStartDate: "", tenor: "6 個月", maturityDate: ""
};

const App = () => {
  // --- State ---
  const [viewMode, setViewMode] = useState('landing');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestData, setGuestData] = useState(null);

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
  const [savedPassword, setSavedPassword] = useState(() => localStorage.getItem(KEY_PASSWORD) || "");
  const [isUnlocked, setIsUnlocked] = useState(() => !localStorage.getItem(KEY_PASSWORD)); 
  
  const [currentShareData, setCurrentShareData] = useState({ url: '', name: '' }); 
  const [pendingAction, setPendingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmbedSheet, setShowEmbedSheet] = useState(false);

  // UI States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBatchPriceModalOpen, setIsBatchPriceModalOpen] = useState(false);
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [isShareLinkModalOpen, setIsShareLinkModalOpen] = useState(false); 
  const [isLoadCodeModalOpen, setIsLoadCodeModalOpen] = useState(false); 

  // Form States
  const [editId, setEditId] = useState(null);
  const [formPosition, setFormPosition] = useState(DEFAULT_FORM_STATE);
  const [formUnderlyings, setFormUnderlyings] = useState([{ id: Date.now(), ticker: "", entryPrice: 0 }]);

  // --- Initialization (Hash Check) ---
  useEffect(() => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#share=')) {
          const shareCode = hash.replace('#share=', '');
          if(!shareCode) return;
          
          try {
              const decodedRaw = JSON.parse(base64UrlDecode(shareCode));
              const decoded = unminifyData(decodedRaw);
              
              setGuestData(decoded);
              setIsGuestMode(true);
              if (decoded.prices) setMarketPrices(decoded.prices);
              if (decoded.lastUpdated) setLastUpdated(decoded.lastUpdated);
              setViewMode('dashboard');
              
              window.history.replaceState(null, '', window.location.pathname);
          } catch (e) {
              console.error("Hash parse error", e);
              alert("連結無效或資料已損毀：請重新產生連結");
          }
      }
  }, []);

  // --- Computed ---
  const activeClient = useMemo(() => {
    if (isGuestMode && guestData) return { id: 'guest', name: guestData.clientName || '訪客' };
    return clients.find(c => c.id === activeClientId) || { id: 'temp', name: '未知投資人' };
  }, [clients, activeClientId, isGuestMode, guestData]);
  
  const currentClientPositions = useMemo(() => {
    if (isGuestMode && guestData) return guestData.positions || [];
    return allPositions.filter(p => p.clientId === activeClientId);
  }, [allPositions, activeClientId, isGuestMode, guestData]);

  const activeTickers = useMemo(() => {
    const tickers = new Set();
    const sourcePositions = isGuestMode ? currentClientPositions : allPositions;
    sourcePositions.forEach(p => {
      if(p.underlyings) p.underlyings.forEach(u => tickers.add(u.ticker));
    });
    return Array.from(tickers).sort();
  }, [allPositions, currentClientPositions, isGuestMode]);

  // --- Persistence ---
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); } catch(e){} }, [clients, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_POSITIONS, JSON.stringify(allPositions)); } catch(e){} }, [allPositions, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_PRICES, JSON.stringify(marketPrices)); } catch(e){} }, [marketPrices, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_SHEET_ID, googleSheetId); } catch(e){} }, [googleSheetId, isGuestMode]);
  useEffect(() => { 
      if(!isGuestMode) {
        if(savedPassword) localStorage.setItem(KEY_PASSWORD, savedPassword);
        else localStorage.removeItem(KEY_PASSWORD);
      }
  }, [savedPassword, isGuestMode]);

  // --- Security Helpers ---
  const checkAuth = (action) => {
    if (isUnlocked) {
      action();
    } else {
      setPendingAction(() => action);
      setIsPasswordPromptOpen(true);
    }
  };

  const handleUnlock = (inputPwd) => {
    if (inputPwd === savedPassword) {
      setIsUnlocked(true);
      setIsPasswordPromptOpen(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      alert("密碼錯誤");
    }
  };

  const handleAdminLogin = (inputPwd) => {
      if (!savedPassword || inputPwd === savedPassword) {
          setIsUnlocked(true);
          setIsGuestMode(false);
          setViewMode('dashboard');
          return true;
      } else {
          alert("密碼錯誤");
          return false;
      }
  };

  const handleManualLock = () => { if(savedPassword) setIsUnlocked(false); };

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
    const validUnderlyings = formUnderlyings
      .filter(u => u.ticker.trim() !== "")
      .map(u => ({ ticker: u.ticker.toUpperCase(), entryPrice: parseFloat(u.entryPrice) }));

    if (validUnderlyings.length === 0) return;

    const updatedPrices = { ...marketPrices };
    validUnderlyings.forEach(u => {
      if (getPriceForTicker(u.ticker) === undefined) updatedPrices[u.ticker] = u.entryPrice;
    });
    setMarketPrices(updatedPrices);

    const tickersStr = validUnderlyings.map(u => u.ticker).join('/');
    
    const entryData = {
      clientId: activeClientId,
      productName: formPosition.productName || `FCN ${tickersStr}`,
      issuer: formPosition.issuer || "Self",
      nominal: parseFloat(formPosition.nominal),
      currency: formPosition.currency,
      couponRate: parseFloat(formPosition.couponRate),
      strikeDate: formPosition.strikeDate,
      koObservationStartDate: formPosition.koObservationStartDate,
      maturityDate: formPosition.maturityDate,
      tenor: formPosition.tenor,
      koLevel: parseFloat(formPosition.koLevel),
      kiLevel: parseFloat(formPosition.kiLevel),
      strikeLevel: parseFloat(formPosition.strikeLevel),
      underlyings: validUnderlyings,
      status: "Active"
    };

    if (editId) {
        setAllPositions(prev => prev.map(p => p.id === editId ? { ...entryData, id: editId } : p));
    } else {
        setAllPositions(prev => [...prev, { ...entryData, id: Date.now() }]);
    }

    setIsAddModalOpen(false);
  };

  const deletePosition = (id) => {
    checkAuth(() => {
        if(confirm("確定刪除此部位？")) {
            setAllPositions(allPositions.filter(p => p.id !== id));
        }
    });
  };

  const handleAddClient = (name) => {
    checkAuth(() => {
        if (name) {
          const newId = `c${Date.now()}`;
          setClients(prev => [...prev, { id: newId, name }]);
          setActiveClientId(newId);
        }
    });
  };

  const handleDeleteClient = (id) => {
    checkAuth(() => {
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
    });
  };

  const handleGenerateShareLink = (clientId) => {
      // 1. Environment Check
      if (window.location.protocol === 'file:') {
          alert("❌ 錯誤：您正在使用「本機檔案」模式。\n\n產生的連結僅為本機路徑，無法分享給其他人。\n請先將網站部署至網路 (如 Vercel)。");
          return;
      }
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          if(!confirm("⚠️ 警告：您正在使用「本機測試」模式。\n\n產生的連結僅能在本機開啟，無法傳送至手機。\n確定要繼續嗎？")) return;
      }

      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      
      const clientPositions = allPositions.filter(p => p.clientId === clientId);
      const relevantPrices = {};
      clientPositions.forEach(p => {
          p.underlyings.forEach(u => {
              const price = getPriceForTicker(u.ticker);
              if (price !== undefined) relevantPrices[u.ticker] = price;
          });
      });

      const payload = {
          clientName: client.name,
          positions: clientPositions,
          prices: relevantPrices,
          lastUpdated: lastUpdated,
          generatedAt: new Date().toISOString()
      };

      try {
        const minified = minifyData(payload);
        const jsonString = JSON.stringify(minified);
        const encoded = base64UrlEncode(jsonString);
        
        // Get clean base URL without hash or query
        const baseUrl = window.location.href.split(/[?#]/)[0];
        const url = `${baseUrl}#share=${encoded}`;
        
        setCurrentShareData({ 
            url, 
            code: encoded, 
            name: client.name 
        });
        setIsClientManagerOpen(false); 
        setIsShareLinkModalOpen(true);

      } catch (e) {
          console.error(e);
          alert("連結生成失敗");
      }
  };

  const handleLoadCode = (code) => {
      try {
          const cleanCode = code.trim();
          const decodedRaw = JSON.parse(base64UrlDecode(cleanCode));
          const decoded = unminifyData(decodedRaw);
          setGuestData(decoded);
          setIsGuestMode(true);
          if (decoded.prices) setMarketPrices(decoded.prices);
          if (decoded.lastUpdated) setLastUpdated(decoded.lastUpdated);
          setViewMode('dashboard');
      } catch (e) {
          alert("無效的代碼，請確認複製完整。");
      }
  };

  const handleLoadFile = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const content = e.target.result;
              const parsed = JSON.parse(content);
              const decoded = unminifyData(parsed);
              setGuestData(decoded); setIsGuestMode(true);
              if (decoded.prices) setMarketPrices(decoded.prices);
              if (decoded.lastUpdated) setLastUpdated(decoded.lastUpdated);
              setViewMode('dashboard');
          } catch(err) { alert("檔案格式錯誤"); }
      };
      reader.readAsText(file);
  };

  const handleExportClientFile = (clientId) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      const clientPositions = allPositions.filter(p => p.clientId === clientId);
      const relevantPrices = {};
      clientPositions.forEach(p => { p.underlyings.forEach(u => { const price = getPriceForTicker(u.ticker); if (price !== undefined) relevantPrices[u.ticker] = price; }); });
      const payload = { clientName: client.name, positions: clientPositions, prices: relevantPrices, lastUpdated: lastUpdated };
      
      const minified = minifyData(payload);
      const jsonString = JSON.stringify(minified);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${client.name}_Portfolio.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExitGuestMode = () => {
      if(confirm("確定要登出嗎？")) {
          setIsGuestMode(false); setGuestData(null); setViewMode('landing');
          window.history.replaceState(null, '', window.location.pathname); 
      }
  };

  const handleOpenAddModal = () => {
      checkAuth(() => {
          setEditId(null);
          setFormPosition(DEFAULT_FORM_STATE);
          setFormUnderlyings([{ id: Date.now(), ticker: "", entryPrice: 0 }]);
          setIsAddModalOpen(true);
      });
  };

  const handleOpenEditModal = (pos) => {
      checkAuth(() => {
          setEditId(pos.id);
          setFormPosition({
              productName: pos.productName, issuer: pos.issuer, nominal: pos.nominal, currency: pos.currency,
              couponRate: pos.couponRate, koLevel: pos.koLevel, kiLevel: pos.kiLevel, strikeLevel: pos.strikeLevel,
              strikeDate: pos.strikeDate, koObservationStartDate: pos.koObservationStartDate, tenor: pos.tenor,
              maturityDate: pos.maturityDate
          });
          setFormUnderlyings(pos.underlyings.map((u, idx) => ({ ...u, id: Date.now() + idx })));
          setIsAddModalOpen(true);
      });
  };

  const handleExportCSV = () => {
    const headers = [
      "投資人", "產品名稱", "發行商", "幣別", "名目本金", "年息(%)", 
      "到期日", "KI(%)", "KO(%)", 
      "最差標的(Laggard)", "Laggard現價", "Laggard進場價", "表現(%)", "狀態"
    ];

    const rows = (isGuestMode ? currentClientPositions : allPositions).map(pos => {
      const calculated = calculateRisk(pos);
      const clientName = isGuestMode ? activeClient.name : (clients.find(c => c.id === pos.clientId)?.name || "未知");
      
      return [
        clientName,
        pos.productName,
        pos.issuer,
        pos.currency,
        pos.nominal,
        pos.couponRate,
        pos.maturityDate,
        pos.kiLevel,
        pos.koLevel,
        calculated.laggard.ticker,
        calculated.laggard.currentPrice,
        calculated.laggard.entryPrice,
        calculated.laggard.performance.toFixed(2),
        calculated.riskStatus
      ];
    });

    const csvString = [
      headers.join(','),
      ...rows.map(row => row.map(item => `"${String(item).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `FCN_Portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- RENDER ---

  if (viewMode === 'landing') {
      return <LandingPage onAdminLogin={handleAdminLogin} onLoadCode={handleLoadCode} onLoadFile={handleLoadFile} hasPassword={!!savedPassword}/>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
      {isGuestMode && (
          <div className="bg-blue-600 text-white px-4 py-2 text-xs flex justify-between items-center sticky top-0 z-20 shadow-md">
              <div className="flex items-center gap-2"><Eye size={14} /><span className="font-bold">訪客檢視：{activeClient.name}</span></div>
              <button onClick={handleExitGuestMode} className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded flex items-center gap-1 transition"><X size={12}/> 登出</button>
          </div>
      )}

      <header className={`bg-white shadow-sm border-b border-slate-200 ${!isGuestMode ? 'sticky top-0 z-10' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <div className="flex items-center gap-2"><Activity className="text-blue-600 h-6 w-6" /><h1 className="text-lg font-bold text-slate-800 hidden sm:block">FCN 管理</h1>
                {!isGuestMode && (<button onClick={() => { if(savedPassword && isUnlocked) handleManualLock(); else if(savedPassword && !isUnlocked) setIsPasswordPromptOpen(true); else setIsSettingsModalOpen(true); }} className="ml-2 p-1.5 rounded-full transition-colors hover:bg-slate-100">{savedPassword ? (isUnlocked ? <Unlock size={16} className="text-green-600"/> : <Lock size={16} className="text-red-600"/>) : (<Settings size={16} className="text-slate-400 hover:text-slate-600"/>)}</button>)}
              </div>
              {!isGuestMode && (
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 pr-3 relative group">
                    <div className="bg-white p-1.5 rounded shadow-sm text-blue-600"><User size={16} /></div>
                    <select value={activeClientId} onChange={(e) => setActiveClientId(e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer appearance-none pr-6 min-w-[120px]">
                    {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 text-slate-400 pointer-events-none"/>
                    <button onClick={() => setIsClientManagerOpen(true)} className="ml-2 text-slate-400 hover:text-blue-600"><Edit3 size={14} /></button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end overflow-x-auto no-scrollbar">
               {!isGuestMode && <button onClick={() => setIsLoadCodeModalOpen(true)} className="flex-none flex items-center justify-center gap-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap"><LogIn size={16} /><span className="hidden sm:inline">載入</span></button>}
               <button onClick={() => setIsExportModalOpen(true)} className="flex-none flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap"><FileText size={16} /><span className="hidden sm:inline">匯出</span><span className="sm:hidden">匯出</span></button>
               {!isGuestMode && (
                   <>
                    <button onClick={() => checkAuth(() => setIsBatchPriceModalOpen(true))} className="flex-none flex items-center justify-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap"><RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /><span className="hidden sm:inline">報價</span><span className="sm:hidden">報價</span></button>
                    <button onClick={handleOpenAddModal} className="flex-none flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition shadow-md whitespace-nowrap"><Plus size={16} /><span className="hidden sm:inline">新增</span><span className="sm:hidden">新增</span></button>
                   </>
               )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-9 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
              <div className="flex justify-between mb-2"><span className="text-[10px] text-slate-500 font-bold uppercase">USD 資產</span><DollarSign size={14} className="text-slate-300"/></div>
              <div className="space-y-1"><div className="flex justify-between text-xs text-slate-600"><span>本金</span><span className="font-bold text-slate-800">${(summary.usd.nominal/1000).toFixed(0)}k</span></div><div className="flex justify-between text-xs text-green-600"><span>月息</span><span className="font-bold">+${summary.usd.monthly.toLocaleString()}</span></div></div>
            </div>
            <div className="p-3 rounded-xl border bg-white border-slate-200 shadow-sm">
              <div className="flex justify-between mb-2"><span className="text-[10px] text-slate-500 font-bold uppercase">JPY 資產</span><Coins size={14} className="text-slate-300"/></div>
              <div className="space-y-1"><div className="flex justify-between text-xs text-slate-600"><span>本金</span><span className="font-bold text-slate-800">¥{(summary.jpy.nominal/10000).toFixed(0)}w</span></div><div className="flex justify-between text-xs text-green-600"><span>月息</span><span className="font-bold">+¥{summary.jpy.monthly.toLocaleString()}</span></div></div>
            </div>
            <div className={`p-3 rounded-xl border shadow-sm flex flex-col justify-between ${summary.koCount > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
              <span className="text-[10px] text-slate-500 font-bold uppercase">KO 機會</span>
              <div className="flex items-end justify-between"><span className="text-2xl font-bold text-blue-600">{summary.koCount}</span><TrendingUp size={18} className="text-blue-400 mb-1"/></div>
            </div>
            <div className={`p-3 rounded-xl border shadow-sm flex flex-col justify-between ${summary.kiCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <span className="text-[10px] text-slate-500 font-bold uppercase">KI 風險</span>
              <div className="flex items-end justify-between"><span className="text-2xl font-bold text-red-600">{summary.kiCount}</span><AlertTriangle size={18} className="text-red-400 mb-1"/></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2"><Briefcase size={16} className="text-slate-400"/><h2 className="font-bold text-slate-700 text-sm">{activeClient.name} 的部位</h2></div>
              <span className="text-[10px] text-slate-400 bg-white border px-2 py-0.5 rounded-full">{currentClientPositions.length} 筆資料</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3 font-medium w-56">產品資訊</th>
                    <th className="px-4 py-3 font-medium text-right">本金 / 月息</th>
                    <th className="px-4 py-3 font-medium">連結標的情況</th>
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
                           <div className="text-xs text-slate-500 font-medium truncate max-w-[140px]">{pos.productName}</div>
                           <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ml-1 ${pos.statusColor}`}>{pos.riskStatus}</span>
                        </div>
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
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1"><Clock size={10}/> {pos.maturityDate} 到期</div>
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        <div className="font-mono font-medium text-slate-700 text-sm">{formatMoney(pos.nominal, pos.currency)}</div>
                        <div className="text-sm text-green-600 font-bold mt-1 bg-green-50 px-2 py-0.5 rounded inline-block">月息 {formatMoney(pos.monthlyCoupon, pos.currency)}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          {(pos.underlyingDetails || []).map((u) => {
                            let tickerStyle = "bg-slate-100 text-slate-800 border-slate-200";
                            if (u.currentPrice >= u.koPrice) tickerStyle = "bg-red-600 text-white border-red-700 shadow-sm";
                            else if (u.currentPrice <= u.kiPrice) tickerStyle = "bg-green-600 text-white border-green-700 shadow-sm";

                            let priceColor = "text-slate-700";
                            if (u.currentPrice >= u.koPrice || u.currentPrice <= u.kiPrice) priceColor = "text-white/90";
                            else priceColor = u.currentPrice >= u.entryPrice ? "text-red-600" : "text-green-600";
                            
                            const isHighlighted = u.currentPrice >= u.koPrice || u.currentPrice <= u.kiPrice;
                            const dividerColor = isHighlighted ? 'border-white/30' : 'border-slate-200/60';

                            return (
                              <div key={u.ticker} className={`flex items-center justify-between text-xs p-2 rounded border ${tickerStyle}`}>
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-extrabold text-base">{u.ticker}</span>
                                        <span className={`font-mono font-bold text-base ${priceColor}`}>${u.currentPrice.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className={`flex gap-3 font-mono text-right ${u.currentPrice >= u.koPrice || u.currentPrice <= u.kiPrice ? 'text-white/90' : 'text-slate-500'}`}>
                                    <div className="flex flex-col items-end"><span className="text-[9px] opacity-80">出場</span><span className={`text-base font-bold ${u.currentPrice >= u.koPrice || u.currentPrice <= u.kiPrice ? 'text-white' : 'text-green-600'}`}>${u.koPrice.toLocaleString(undefined, {maximumFractionDigits:0})}</span></div>
                                    <div className={`flex flex-col items-end border-l ${dividerColor} pl-2`}><span className="text-[9px] opacity-80">履約</span><span className={`text-base font-bold ${u.currentPrice >= u.koPrice || u.currentPrice <= u.kiPrice ? 'text-white' : 'text-slate-800'}`}>${u.strikePrice.toLocaleString(undefined, {maximumFractionDigits:0})}</span></div>
                                    <div className={`flex flex-col items-end border-l ${dividerColor} pl-2`}><span className="text-[9px] opacity-80">下限</span><span className={`text-base font-bold ${u.currentPrice >= u.koPrice || u.currentPrice <= u.kiPrice ? 'text-white' : 'text-red-600'}`}>${u.kiPrice.toLocaleString(undefined, {maximumFractionDigits:0})}</span></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        {!isGuestMode && (
                            <div className="flex flex-col items-end gap-2">
                                <button onClick={() => handleOpenEditModal(pos)} className="text-blue-400 hover:text-blue-600 p-1" title="編輯部位"><Pencil size={16} /></button>
                                <button onClick={() => deletePosition(pos.id)} className="text-slate-300 hover:text-red-500 p-1" title="刪除部位"><Trash2 size={16} /></button>
                            </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {processedPositions.length === 0 && (
                    <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">目前沒有部位，請點擊右上角「新增」</td></tr>
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
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><List size={16} className="text-blue-500" />共用報價</h3>
              <div className="flex gap-2">
                {googleSheetId && (
                  <button onClick={() => setShowEmbedSheet(!showEmbedSheet)} className={`text-[10px] px-2 py-1 rounded transition flex items-center gap-1 ${showEmbedSheet ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {showEmbedSheet ? <Eye size={10}/> : <EyeOff size={10}/>}{showEmbedSheet ? '隱藏' : '表格'}
                  </button>
                )}
              </div>
            </div>
            {googleSheetId && showEmbedSheet && (
               <div className="mb-4 border border-slate-200 rounded overflow-hidden shadow-inner h-48 bg-slate-50 relative">
                  <iframe src={`https://docs.google.com/spreadsheets/d/${googleSheetId}/pubhtml?widget=true&headers=false`} className="w-full h-full border-0" title="Google Sheet Embed"/>
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
                    <input type="number" value={price} onChange={(e) => {}} readOnly className="w-full px-2 py-1 text-sm border border-slate-300 rounded text-right font-mono bg-slate-50" step="0.01"/>
                  </div>
                );
              })}
              {activeTickers.length === 0 && <div className="text-center text-xs text-slate-400 py-4">尚無標的</div>}
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {isBatchPriceModalOpen && <BatchPriceModal isOpen={isBatchPriceModalOpen} onClose={() => setIsBatchPriceModalOpen(false)} marketPrices={marketPrices} setMarketPrices={setMarketPrices} setLastUpdated={setLastUpdated} googleSheetId={googleSheetId} setGoogleSheetId={setGoogleSheetId} />}
      {isAddModalOpen && <AddPositionModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleSavePosition} newPosition={formPosition} setNewPosition={setFormPosition} tempUnderlyings={formUnderlyings} setTempUnderlyings={setFormUnderlyings} isEdit={!!editId} />}
      {isClientManagerOpen && <ClientManagerModal isOpen={isClientManagerOpen} onClose={() => setIsClientManagerOpen(false)} clients={clients} onAdd={handleAddClient} onDelete={handleDeleteClient} activeId={activeClientId} onGenerateShareLink={handleGenerateShareLink} onExportClientFile={handleExportClientFile} />}
      {isExportModalOpen && <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} allPositions={allPositions} clients={clients} marketPrices={marketPrices} calculateRisk={calculateRisk} />}
      {isSettingsModalOpen && <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} savedPassword={savedPassword} setSavedPassword={setSavedPassword} setIsUnlocked={setIsUnlocked} />}
      {isPasswordPromptOpen && <PasswordPromptModal isOpen={isPasswordPromptOpen} onConfirm={handleUnlock} onCancel={() => { setIsPasswordPromptOpen(false); setPendingAction(null); }} />}
      {isShareLinkModalOpen && <ShareLinkModal isOpen={isShareLinkModalOpen} onClose={() => setIsShareLinkModalOpen(false)} link={currentShareData.url} clientName={currentShareData.name} code={currentShareData.code} />}
      {isLoadCodeModalOpen && <LoadCodeModal isOpen={isLoadCodeModalOpen} onClose={() => setIsLoadCodeModalOpen(false)} onLoad={handleLoadCode} onLoadFile={handleLoadFile} />}
    </div>
  );
};

// --- Sub Components ---

const LandingPage = ({ onAdminLogin, onLoadCode, onLoadFile, hasPassword }) => {
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [mode, setMode] = useState('client'); 
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if(file) onLoadFile(file);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="bg-blue-600 p-6 text-center">
                    <Activity size={48} className="text-white/90 mx-auto mb-3"/>
                    <h1 className="text-2xl font-bold text-white">FCN 投資組合</h1>
                    <p className="text-blue-100 text-sm mt-1">專業結構型商品監控</p>
                </div>
                <div className="flex border-b">
                    <button onClick={()=>setMode('client')} className={`flex-1 py-4 text-sm font-bold transition ${mode==='client'?'text-blue-600 border-b-2 border-blue-600 bg-blue-50':'text-slate-500'}`}>投資人入口</button>
                    <button onClick={()=>setMode('admin')} className={`flex-1 py-4 text-sm font-bold transition ${mode==='admin'?'text-blue-600 border-b-2 border-blue-600 bg-blue-50':'text-slate-500'}`}>管理員登入</button>
                </div>
                <div className="p-6">
                    {mode === 'client' ? (
                        <div className="space-y-4">
                             {/* File Method (Primary) */}
                             <div className="bg-purple-50 p-6 rounded-lg border border-purple-100 text-center cursor-pointer hover:bg-purple-100 transition group" onClick={() => fileInputRef.current.click()}>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange}/>
                                <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
                                    <FileJson size={24} className="text-purple-600"/>
                                </div>
                                <p className="text-sm font-bold text-purple-800">開啟我的投資組合</p>
                                <p className="text-xs text-purple-500 mt-1">點擊選擇 .json 檔案</p>
                            </div>
                            
                            <div className="relative flex py-2 items-center">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-xs text-slate-400">或使用代碼</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>
                            
                            <div className="flex gap-2">
                                <input className="flex-1 p-2 border border-slate-300 rounded-lg text-sm" placeholder="貼上代碼..." value={code} onChange={e=>setCode(e.target.value)}/>
                                <button onClick={()=>onLoadCode(code)} disabled={!code} className="bg-slate-800 text-white px-4 rounded-lg text-sm font-bold">載入</button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={(e)=>{e.preventDefault(); onAdminLogin(password);}} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">管理員密碼</label>
                                <input type="password" className="w-full p-3 border border-slate-300 rounded-lg" placeholder={hasPassword ? "請輸入密碼" : "未設定 (直接登入)"} value={password} onChange={e=>setPassword(e.target.value)}/>
                            </div>
                            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-lg font-bold">登入系統</button>
                        </form>
                    )}
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-6 text-center">資料僅儲存於此裝置，請定期備份。</p>
        </div>
    );
};

const PasswordPromptModal = ({ isOpen, onConfirm, onCancel }) => {
    if(!isOpen) return null;
    const [val, setVal] = useState("");
    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-in fade-in zoom-in duration-200">
                <h3 className="text-lg font-bold mb-4 text-slate-800">請輸入密碼</h3>
                <form onSubmit={(e)=>{e.preventDefault(); onConfirm(val);}} className="space-y-3">
                    <input type="password" autoFocus className="w-full border rounded px-3 py-2" value={val} onChange={e=>setVal(e.target.value)}/>
                    <div className="flex gap-2"><button type="button" onClick={onCancel} className="flex-1 bg-slate-100 py-2 rounded">取消</button><button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded">確認</button></div>
                </form>
            </div>
        </div>
    );
};

const ShareLinkModal = ({ isOpen, onClose, link, clientName, code }) => {
  const [copyStatus, setCopyStatus] = useState("複製連結");
  const [activeTab, setActiveTab] = useState("link");
  const inputRef = useRef(null);
  const codeRef = useRef(null);

  const handleCopy = (text) => {
      const success = copyToClipboard(text);
      if(success) {
          setCopyStatus("已複製！");
          setTimeout(() => setCopyStatus(activeTab === 'link' ? "複製連結" : "複製代碼"), 2000);
      } else {
          prompt("請手動複製：", text);
      }
  };

  if(!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Share2 size={18} className="text-blue-600"/>
                    分享給 {clientName}
                </h3>
                <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
            </div>

            <div className="flex gap-2 mb-4">
                <button onClick={()=>setActiveTab('link')} className={`flex-1 py-2 text-xs rounded font-bold ${activeTab==='link'?'bg-blue-50 text-blue-600':'bg-slate-50 text-slate-500'}`}>連結分享</button>
                <button onClick={()=>setActiveTab('code')} className={`flex-1 py-2 text-xs rounded font-bold ${activeTab==='code'?'bg-blue-50 text-blue-600':'bg-slate-50 text-slate-500'}`}>代碼分享</button>
            </div>
            
            {activeTab === 'link' ? (
                <>
                    <p className="text-xs text-slate-500 mb-3">
                        將此連結傳送給客戶，對方即可在手機上查看即時部位與損益（唯讀模式）。
                        <br/><span className="text-red-500">* 若連結太長無法傳送，請改用「代碼分享」。</span>
                    </p>
                    <div className="relative mb-4">
                        <input 
                            ref={inputRef}
                            readOnly 
                            value={link} 
                            onClick={(e) => e.target.select()}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-xs text-slate-600 break-all pr-10 focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex gap-2">
                        <a href={link} target="_blank" rel="noreferrer" className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50">
                            <LinkIcon size={16}/> 測試開啟
                        </a>
                        <button onClick={()=>handleCopy(link)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                            <Copy size={16}/> {copyStatus}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className="text-xs text-slate-500 mb-3">
                        複製此代碼給客戶，請客戶點擊主畫面上的「載入代碼」按鈕貼上即可。
                    </p>
                    <textarea 
                        ref={codeRef}
                        readOnly 
                        value={code} 
                        onClick={(e) => e.target.select()}
                        className="w-full h-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-xs text-slate-600 break-all mb-4 focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <button onClick={()=>handleCopy(code)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <Copy size={16}/> {copyStatus}
                    </button>
                </>
            )}
        </div>
    </div>
  );
};

// New: Load Code Modal
const LoadCodeModal = ({ isOpen, onClose, onLoad, onLoadFile }) => {
    const [code, setCode] = useState("");
    const fileInputRef = useRef(null);
    const handleFileChange = (e) => { const file = e.target.files[0]; if(file) onLoadFile(file); };
    if(!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="font-bold text-slate-800">載入投資組合</h3><button onClick={onClose}><X size={20} className="text-slate-400"/></button></div>
                <div className="mb-4"><div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-center cursor-pointer hover:bg-purple-100 transition" onClick={() => fileInputRef.current.click()}><input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange}/><FileJson size={32} className="mx-auto text-purple-500 mb-2"/><p className="text-sm font-bold text-purple-700">開啟檔案 (.json)</p></div></div>
                <div className="relative flex py-2 items-center"><div className="flex-grow border-t border-slate-200"></div><span className="flex-shrink-0 mx-4 text-xs text-slate-400">或輸入代碼</span><div className="flex-grow border-t border-slate-200"></div></div>
                <textarea placeholder="請在此貼上投資組合代碼..." className="w-full h-24 border border-slate-300 rounded-lg p-3 text-xs font-mono mb-4" value={code} onChange={e=>setCode(e.target.value)}/><button onClick={()=>onLoad(code)} className="w-full bg-slate-800 text-white py-2.5 rounded-lg text-sm font-bold flex justify-center gap-2"><Check size={16}/> 確認載入</button>
            </div>
        </div>
    );
};

// Reusing other existing modals...
const SettingsModal = ({ isOpen, onClose, savedPassword, setSavedPassword, setIsUnlocked }) => {
    if(!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800">安全性設定</h3><button onClick={onClose}><X size={20}/></button></div>
                <div className="mb-6 border-b border-slate-100 pb-4">
                    <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase">管理員密碼</h4>
                    {savedPassword ? (
                        <div className="space-y-2"><p className="text-sm text-slate-600">目前已設定密碼。</p><button onClick={() => { if(confirm("確定移除密碼？")) { setSavedPassword(""); setIsUnlocked(true); }}} className="w-full bg-red-50 text-red-600 py-2 rounded font-bold text-sm border border-red-100">移除密碼</button></div>
                    ) : (
                        <div className="space-y-2"><p className="text-xs text-slate-500 mb-2">設定密碼後，修改資料需先解鎖。</p><PasswordInput onConfirm={(pwd) => { setSavedPassword(pwd); setIsUnlocked(false); }} btnText="設定"/></div>
                    )}
                </div>
            </div>
        </div>
    );
};
const PasswordInput = ({ onConfirm, onCancel, btnText }) => {
    const [val, setVal] = useState("");
    return (
        <form onSubmit={(e) => { e.preventDefault(); if(val) onConfirm(val); }} className="space-y-3">
            <input type="password" autoFocus className="w-full border rounded px-3 py-2" placeholder="密碼" value={val} onChange={e=>setVal(e.target.value)} />
            <div className="flex gap-2">
                {onCancel && <button type="button" onClick={onCancel} className="flex-1 bg-slate-100 py-2 rounded">取消</button>}
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded font-bold">{btnText}</button>
            </div>
        </form>
    );
};
const ClientManagerModal = ({ isOpen, onClose, clients, onAdd, onDelete, activeId, onGenerateShareLink, onExportClientFile }) => {
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const handleConfirmAdd = (e) => { e.preventDefault(); if(newName.trim()) { onAdd(newName.trim()); setNewName(''); setIsAdding(false); } };
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800">管理投資人</h3><button onClick={onClose}><X size={20} className="text-slate-400"/></button></div>
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {clients.map(c => (
            <div key={c.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 group">
              <div className="flex items-center gap-2">
                <User size={16} className={c.id === activeId ? "text-blue-600" : "text-slate-400"}/>
                <span className={`text-sm ${c.id === activeId ? "font-bold text-blue-700" : "text-slate-700"}`}>{c.name}</span>
              </div>
              <div className="flex gap-1">
                  <button onClick={() => onExportClientFile(c.id)} className="text-slate-300 hover:text-purple-500 p-1" title="下載檔案"><Download size={14}/></button>
                  <button onClick={() => onGenerateShareLink(c.id)} className="text-slate-300 hover:text-blue-500 p-1" title="分享連結"><Share2 size={14}/></button>
                  <button onClick={() => onDelete(c.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
        {isAdding ? (
            <form onSubmit={handleConfirmAdd} className="flex gap-2 animate-in fade-in zoom-in duration-200"><input autoFocus type="text" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="輸入名稱..." value={newName} onChange={(e) => setNewName(e.target.value)}/><button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-lg"><Check size={16}/></button><button type="button" onClick={()=>setIsAdding(false)} className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg"><X size={16}/></button></form>
        ) : (
            <button onClick={()=>setIsAdding(true)} className="w-full border border-dashed border-slate-300 text-slate-500 py-2.5 rounded-lg text-sm hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300 transition flex items-center justify-center gap-2"><Plus size={14}/> 新增投資人</button>
        )}
      </div>
    </div>
  );
};
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
    const success = copyToClipboard(csvContent);
    if (success) { setCopyStatus('複製成功！'); setTimeout(() => setCopyStatus(''), 2000); } else { setCopyStatus('失敗'); }
  };
  const handleDownload = () => {
    try {
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `FCN_Portfolio.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) { alert("下載失敗"); }
  };
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 mb-10">
        <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="font-bold text-slate-800">匯出資料</h3><button onClick={onClose}><X size={20} className="text-slate-400"/></button></div>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">如果下載失敗，請點擊「複製」並貼到 Excel。</p>
          <textarea ref={textAreaRef} readOnly className="w-full h-32 border p-2 text-xs font-mono rounded bg-slate-50" value={csvContent} />
          <div className="flex gap-3"><button onClick={handleCopy} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Copy size={16}/> {copyStatus || "複製內容"}</button><button onClick={handleDownload} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Download size={16}/> 下載 CSV</button></div>
        </div>
      </div>
    </div>
  );
};

const BatchPriceModal = ({ isOpen, onClose, marketPrices, setMarketPrices, setLastUpdated, googleSheetId, setGoogleSheetId }) => {
  const [activeTab, setActiveTab] = useState('paste'); 
  const [pasteContent, setPasteContent] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [status, setStatus] = useState('');
  const parseSheetId = (url) => { const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return match ? match[1] : (url.length > 20 && !url.includes('/') ? url : null); };
  const handlePaste = () => {
    const lines = pasteContent.split('\n'); const newPrices = { ...marketPrices }; let count = 0;
    lines.forEach(line => { const match = line.replace(/[¥$,JPY"\s]/g, '').match(/([A-Za-z0-9.:]+)[^\d-]*([\d.,]+)/); if(match) { const t = match[1].toUpperCase().replace("TYO:","").replace(".T",""); const p = parseFloat(match[2].replace(/,/g,'')); if(!isNaN(p)) { newPrices[t] = p; count++; } } });
    setMarketPrices(newPrices); localStorage.setItem(KEY_PRICES, JSON.stringify(newPrices)); setLastUpdated(new Date().toLocaleDateString() + " (貼上)"); setStatus(`成功更新 ${count} 筆`); setTimeout(onClose, 1000);
  };
  const handleSheet = () => { const id = parseSheetId(inputUrl); if(id) { setGoogleSheetId(id); setStatus("ID 已設定，請點擊主畫面同步按鈕"); setTimeout(onClose, 1500); } else { setStatus("無效的連結"); } };
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 mb-10">
        <div className="flex justify-between mb-4 border-b pb-2"><h3 className="font-bold">更新報價</h3><button onClick={onClose}><X/></button></div>
        <div className="flex gap-2 mb-4"><button onClick={()=>setActiveTab('paste')} className={`flex-1 py-2 text-xs rounded ${activeTab==='paste'?'bg-blue-50 text-blue-600 font-bold':'bg-slate-50'}`}>貼上</button><button onClick={()=>setActiveTab('sheet')} className={`flex-1 py-2 text-xs rounded ${activeTab==='sheet'?'bg-blue-50 text-blue-600 font-bold':'bg-slate-50'}`}>Google Sheet</button></div>
        {activeTab === 'paste' ? (<div className="space-y-3"><textarea className="w-full h-32 border p-2 text-xs font-mono rounded" placeholder="NVDA 800&#10;7203 3500" value={pasteContent} onChange={e=>setPasteContent(e.target.value)}/><button onClick={handlePaste} className="w-full bg-blue-600 text-white py-2 rounded text-sm">更新</button></div>) : (<div className="space-y-3"><input className="w-full border p-2 text-xs rounded" placeholder="Google Sheet URL..." value={inputUrl} onChange={e=>setInputUrl(e.target.value)}/><button onClick={handleSheet} className="w-full bg-green-600 text-white py-2 rounded text-sm">設定連結</button><p className="text-[10px] text-slate-400">需先將檔案「發布到網路」為 CSV 格式</p></div>)}
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