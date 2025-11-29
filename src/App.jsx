import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Activity, ChevronDown, RefreshCw, X, Clock, Edit3, List, Eye, EyeOff, Coins, AlertCircle, User, Briefcase, Check, Download, Copy, FileText, Pencil, Lock, Unlock, Settings, Share2, Link as LinkIcon, LogIn, FileJson, CloudDownload, ExternalLink, Database, ArrowRightLeft, RefreshCcw } from 'lucide-react';

/**
 * FCN 投資組合管理系統 (Final Production Version - Traditional Chinese)
 * Update:
 * 1. Z-Index Fix: Increased Header z-index to z-40/z-50 to prevent content scrolling overlap.
 * 2. Maintains all previous layout and visual improvements.
 */

// --- 1. Constants ---

const DEFAULT_CLIENTS = [{ id: 'c1', name: '預設投資人' }];

const INITIAL_POSITIONS = [
  {
    id: 1, clientId: 'c1', productName: "FCN Tech SNMSELN02384", issuer: "GS", nominal: 100000, currency: "USD", couponRate: 12.5,
    strikeDate: "2024-01-15", koObservationStartDate: "2024-04-15", tenor: "6 個月", maturityDate: "2024-07-15",
    koLevel: 105, kiLevel: 70, strikeLevel: 100,
    underlyings: [{ ticker: "NVDA", entryPrice: 550 }, { ticker: "AMD", entryPrice: 140 }, { ticker: "TSLA", entryPrice: 200 }, { ticker: "MSFT", entryPrice: 400 }], status: "Active"
  }
];

const DEFAULT_MARKET_PRICES = { "NVDA": 610.50, "AMD": 135.20, "TSLA": 190.00, "RIVN": 11.50, "AAPL": 175.00, "MSFT": 405.00, "7203": 3550, "7267": 1700, "COIN": 165.00 };

const DEFAULT_FORM_STATE = {
  productName: "", issuer: "", nominal: 10000, currency: "USD", couponRate: 10,
  koLevel: 103, kiLevel: 70, strikeLevel: 100,
  strikeDate: new Date().toISOString().split('T')[0],
  koObservationStartDate: "", tenor: "6 個月", maturityDate: ""
};

// --- Storage Keys ---
const KEY_POSITIONS = 'fcn_positions_v56'; 
const KEY_PRICES = 'fcn_market_prices_v56';
const KEY_CLIENTS = 'fcn_clients_v56';
const KEY_UPDATE_DATE = 'fcn_last_update_date_v56';
const KEY_SHEET_ID = 'fcn_google_sheet_id_v56'; 
const KEY_PORTFOLIO_URL = 'fcn_portfolio_sheet_url_v56'; 
const KEY_PASSWORD = 'fcn_admin_password_v56'; 

// --- 2. Helpers ---

const safeGetStorage = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;
    const parsed = JSON.parse(saved);
    
    if (key.includes('clients')) {
        if (!Array.isArray(parsed)) return defaultValue;
        const isCorrupted = parsed.some(c => 
            c.name && (c.name.includes('function') || c.name.includes('var ') || c.name.length > 50 && c.name.includes('='))
        );
        if (isCorrupted) {
            console.warn("Detected corrupted client data, resetting to default.");
            return defaultValue;
        }
    }
    
    return parsed;
  } catch (e) { 
      console.error("Storage parse error", e);
      return defaultValue; 
  }
};

const toHalfWidth = (str) => str ? str.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ') : "";

const base64UrlEncode = (str) => {
    const base64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlDecode = (str) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
};

const copyToClipboard = (text) => {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed"; textArea.style.left = "-9999px"; textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus(); textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) { return false; }
};

const formatToWan = (val) => {
    if (!val) return "0";
    const wan = val / 10000;
    return parseFloat(wan.toFixed(2)).toString(); 
};

const minifyData = (payload) => ({
    v: 1, n: payload.clientName, t: payload.lastUpdated,
    p: payload.positions.map(p => [
        p.productName, p.issuer, p.nominal, p.currency, p.couponRate, p.koLevel, p.kiLevel, p.strikeLevel, 
        p.strikeDate, p.koObservationStartDate, p.maturityDate, p.tenor, 
        p.underlyings.map(u => [u.ticker, u.entryPrice])
    ]), m: payload.prices
});

const unminifyData = (minified) => {
    if (!minified.v) return minified; 
    return {
        clientName: minified.n, lastUpdated: minified.t, prices: minified.m,
        positions: minified.p.map((arr, index) => ({
            id: index, productName: arr[0], issuer: arr[1], nominal: arr[2], currency: arr[3],
            couponRate: arr[4], koLevel: arr[5], kiLevel: arr[6], strikeLevel: arr[7],
            strikeDate: arr[8], koObservationStartDate: arr[9], maturityDate: arr[10], tenor: arr[11],
            underlyings: arr[12].map(u => ({ ticker: u[0], entryPrice: u[1] })), status: "Active", clientId: 'guest'
        }))
    };
};

const parseRawDataToRows = (text) => {
    let rows = [];
    if (text.trim().startsWith('<') && text.includes('<table')) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const trs = Array.from(doc.querySelectorAll('tr'));
            rows = trs.map(tr => 
                Array.from(tr.querySelectorAll('td, th')).map(cell => cell.innerText.trim())
            ).filter(row => row.some(cell => cell.length > 0));
        } catch (e) {
            console.error("HTML Parse Error", e);
            throw new Error("HTML 解析失敗，請確認連結內容");
        }
    } else {
        rows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
            const res = [];
            let entry = [];
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') { inQuotes = !inQuotes; }
                else if (char === ',' && !inQuotes) {
                    res.push(entry.join('').trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                    entry = [];
                } else { entry.push(char); }
            }
            res.push(entry.join('').trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            return res;
        });
    }
    return rows;
};

const parsePortfolioRows = (rows) => {
    if (rows.length < 2) throw new Error("資料內容為空或只有標題");
    
    const headerMap = {
        'client': ['client', '投資人', '客戶', 'account'],
        'product': ['product', 'name', '產品', '名稱', '商品', 'title', '標的名稱'],
        'issuer': ['issuer', '發行商', '上手'],
        'currency': ['currency', 'ccy', '幣別', '幣種'],
        'nominal': ['nominal', 'amount', '本金', '金額', 'notional'],
        'coupon': ['coupon', 'rate', '年息', '配息', 'interest'],
        'maturity': ['maturity', 'date', '到期', '到期日', 'end'],
        'ki': ['ki', 'barrier', '下限', 'knock-in'],
        'ko': ['ko', 'barrier', '上限', 'knock-out'],
        'strike': ['strike', '履約', '行權'],
        'underlyings': ['underlying', 'tickers', 'stocks', '標的', '連結標的', 'code']
    };

    let headerIdx = -1;
    let idx = {};

    for(let i=0; i<Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if(!row.length) continue;
        const lowerRow = row.map(c => c.toLowerCase());
        const getIndex = (keys) => lowerRow.findIndex(h => keys.some(k => h.includes(k)));
        const pIdx = getIndex(headerMap.product);
        
        if (pIdx > -1) {
            headerIdx = i;
            idx = {
                client: getIndex(headerMap.client),
                product: pIdx,
                issuer: getIndex(headerMap.issuer),
                currency: getIndex(headerMap.currency),
                nominal: getIndex(headerMap.nominal),
                coupon: getIndex(headerMap.coupon),
                maturity: getIndex(headerMap.maturity),
                ki: getIndex(headerMap.ki),
                ko: getIndex(headerMap.ko),
                strike: getIndex(headerMap.strike),
                underlyings: getIndex(headerMap.underlyings)
            };
            break;
        }
    }

    if (headerIdx === -1) {
         throw new Error(`找不到「產品名稱」欄位。\n\n系統讀取到的第一列內容：\n[${rows[0] ? rows[0].join(', ') : '無資料'}]\n\n請確認 Google Sheet 中包含「產品」或「名稱」欄位。`);
    }

    const newClientsMap = new Map();
    const newPositions = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 3 || !row[idx.product]) continue;

        const clientName = idx.client > -1 ? (row[idx.client] || '預設投資人') : '預設投資人';
        
        if (!newClientsMap.has(clientName)) {
            newClientsMap.set(clientName, `c_${Date.now()}_${Math.floor(Math.random()*1000)}`);
        }
        const clientId = newClientsMap.get(clientName);

        const underlyingRaw = idx.underlyings > -1 ? row[idx.underlyings] : "";
        const underlyings = [];
        if (underlyingRaw) {
            const pairs = underlyingRaw.split(/[\/;|\n]+/).map(s => s.trim());
            pairs.forEach(p => {
                const parts = p.split(/[:\s]+/).filter(Boolean);
                if (parts.length >= 1) {
                    const ticker = parts[0].toUpperCase();
                    let entryPrice = 100; 
                    if (parts.length >= 2) {
                        const priceStr = parts[parts.length-1].replace(/,/g, '');
                        if(!isNaN(parseFloat(priceStr))) entryPrice = parseFloat(priceStr);
                    }
                    underlyings.push({ ticker, entryPrice });
                }
            });
        }
        if (underlyings.length === 0) underlyings.push({ ticker: "UNKNOWN", entryPrice: 100 });

        const pos = {
            id: Date.now() + i,
            clientId,
            productName: row[idx.product],
            issuer: idx.issuer > -1 ? row[idx.issuer] : "",
            currency: idx.currency > -1 ? row[idx.currency].toUpperCase() : "USD",
            nominal: idx.nominal > -1 ? (parseFloat(row[idx.nominal].replace(/,/g, '')) || 0) : 0,
            couponRate: idx.coupon > -1 ? (parseFloat(row[idx.coupon].replace(/[%]/g, '')) || 0) : 0,
            maturityDate: idx.maturity > -1 ? row[idx.maturity] : "",
            kiLevel: idx.ki > -1 ? (parseFloat(row[idx.ki]) || 60) : 60,
            koLevel: idx.ko > -1 ? (parseFloat(row[idx.ko]) || 100) : 100,
            strikeLevel: idx.strike > -1 ? (parseFloat(row[idx.strike]) || 100) : 100,
            underlyings,
            strikeDate: "",
            koObservationStartDate: "",
            tenor: "",
            status: "Active"
        };
        newPositions.push(pos);
    }

    const newClients = Array.from(newClientsMap.entries()).map(([name, id]) => ({ id, name }));
    return { clients: newClients, positions: newPositions };
};

// --- 3. Sub-Components ---

// ... (LandingPage, PasswordInput, PasswordPromptModal, SettingsModal unchanged) ...
const LandingPage = ({ onAdminLogin, hasPassword }) => {
    const [password, setPassword] = useState("");
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6">
                <div className="text-center mb-8">
                    <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                        <Activity size={32} className="text-white"/>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">FCN 投資組合管理</h1>
                    <p className="text-sm text-slate-500 mt-2">專業結構型商品監控系統</p>
                </div>
                <form onSubmit={(e)=>{e.preventDefault(); onAdminLogin(password);}} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">管理員登入</label>
                        <input type="password" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" placeholder={hasPassword ? "請輸入密碼" : "尚未設定密碼 (直接登入)"} value={password} onChange={e=>setPassword(e.target.value)}/>
                    </div>
                    <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-lg font-bold shadow-md transition transform active:scale-95">登入系統</button>
                </form>
                <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-400">投資人請直接點擊您收到的專屬連結進入。</p>
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

const PasswordPromptModal = ({ isOpen, onConfirm, onCancel }) => {
    if(!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-in fade-in zoom-in duration-200">
                <h3 className="text-lg font-bold mb-4 text-slate-800">請輸入密碼</h3>
                <PasswordInput onConfirm={onConfirm} onCancel={onCancel} btnText="確認"/>
            </div>
        </div>
    );
};

const SettingsModal = ({ isOpen, onClose, savedPassword, setSavedPassword, setIsUnlocked }) => {
    if(!isOpen) return null;

    const handleFactoryReset = () => {
        if(confirm("確定要重置所有資料嗎？\n\n這將會清除所有投資部位、報價與設定，且無法復原。\n請確認您已備份或匯出資料。")) {
            localStorage.clear();
            window.location.reload();
        }
    };

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

                <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase">系統維護</h4>
                    <button 
                        onClick={handleFactoryReset} 
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition"
                    >
                        <RefreshCcw size={16}/> 重置所有資料
                    </button>
                    <p className="text-[10px] text-slate-400 mt-2 text-center">如果介面出現亂碼或錯誤，請嘗試此操作</p>
                </div>
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
      const headers = ["投資人", "產品名稱", "發行商", "幣別", "名目本金", "年息(%)", "到期日", "KI(%)", "KO(%)", "履約(%)", "最差標的", "現價", "進場價", "履約價", "表現(%)", "狀態"];
      const rows = allPositions.map(pos => {
        const calculated = calculateRisk(pos);
        const clientName = clients.find(c => c.id === pos.clientId)?.name || "未知";
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
          pos.strikeLevel,
          calculated.laggard.ticker, 
          calculated.laggard.currentPrice, 
          calculated.laggard.entryPrice, 
          calculated.laggard.strikePrice.toFixed(2),
          calculated.laggard.performance.toFixed(2), 
          calculated.riskStatus
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

const DataSyncModal = ({ isOpen, onClose, marketPrices, setMarketPrices, setLastUpdated, googleSheetId, setGoogleSheetId, onSyncPortfolio, portfolioSheetUrl, setPortfolioSheetUrl, fetchWithFallback }) => {
  const [activeTab, setActiveTab] = useState('market'); 
  const [pasteContent, setPasteContent] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [status, setStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncData, setPendingSyncData] = useState(null);
  
  const parseSheetId = (url) => { 
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); 
      return match ? match[1] : (url.length > 20 && !url.includes('/') ? url : null); 
  };

  const handlePasteMarket = () => {
    const lines = pasteContent.split('\n'); const newPrices = { ...marketPrices }; let count = 0;
    lines.forEach(line => { const match = line.replace(/[¥$,JPY"\s]/g, '').match(/([A-Za-z0-9.:]+)[^\d-]*([\d.,]+)/); if(match) { const t = match[1].toUpperCase().replace("TYO:","").replace("JP:","").replace(".T",""); const p = parseFloat(match[2].replace(/,/g,'')); if(!isNaN(p)) { newPrices[t] = p; count++; } } });
    setMarketPrices(newPrices); localStorage.setItem(KEY_PRICES, JSON.stringify(newPrices)); setLastUpdated(new Date().toLocaleDateString() + " (貼上)"); setStatus(`成功更新 ${count} 筆`); setTimeout(() => setStatus(''), 2000);
  };
  
  const handleSaveMarketId = () => { 
      const id = parseSheetId(inputUrl); 
      if(id) { 
          setGoogleSheetId(id); 
          setStatus("ID 已儲存。請回主畫面「同步」。"); 
      } else { 
          setStatus("無效的連結"); 
      } 
  };

  const handleSyncPortfolioAction = async () => {
      if(!portfolioSheetUrl) return;
      setIsSyncing(true);
      setStatus("正在下載資料...");
      
      let fetchUrl = portfolioSheetUrl;
      const sheetId = parseSheetId(portfolioSheetUrl);
      if(sheetId && portfolioSheetUrl.includes("google.com") && !portfolioSheetUrl.includes("pubhtml")) {
          if(!portfolioSheetUrl.includes("output=csv")) {
             fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
          }
      }

      try {
          const text = await fetchWithFallback(fetchUrl);
          
          if(text.includes("google.com/accounts")) {
             throw new Error("權限錯誤：請確認連結為「發布到網路」的公開連結");
          }
          
          const rows = parseRawDataToRows(text);
          const { clients, positions } = parsePortfolioRows(rows);
          
          if(positions.length === 0) throw new Error("未找到有效部位資料");

          setPendingSyncData({ clients, positions });
          setStatus("解析完成，請確認以下資訊...");

      } catch (e) {
          console.error(e);
          setStatus(`失敗：${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleConfirmSync = () => {
      if(pendingSyncData) {
          onSyncPortfolio(pendingSyncData.clients, pendingSyncData.positions);
          setStatus(`同步成功！已更新 ${pendingSyncData.positions.length} 筆資料。`);
          setPendingSyncData(null);
          setTimeout(onClose, 1500);
      }
  };

  const handleCancelSync = () => {
      setPendingSyncData(null);
      setStatus("已取消同步");
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 mb-10 h-[600px] flex flex-col">
        <div className="flex justify-between mb-4 border-b pb-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft size={18} className="text-blue-600"/> 資料同步中心</h3>
            <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        
        {!pendingSyncData && (
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg shrink-0">
                <button onClick={()=>setActiveTab('market')} className={`flex-1 py-2 text-xs rounded-md transition ${activeTab==='market'?'bg-white text-blue-600 font-bold shadow-sm':'text-slate-500'}`}>1. 市場報價</button>
                <button onClick={()=>setActiveTab('portfolio')} className={`flex-1 py-2 text-xs rounded-md transition ${activeTab==='portfolio'?'bg-white text-purple-600 font-bold shadow-sm':'text-slate-500'}`}>2. 匯入投資組合</button>
            </div>
        )}

        <div className="flex-1 overflow-y-auto pr-1">
            {pendingSyncData ? (
                <div className="space-y-6 flex flex-col items-center justify-center h-full animate-in fade-in zoom-in duration-200">
                    <div className="bg-blue-50 p-4 rounded-xl text-center w-full">
                        <Check size={48} className="mx-auto text-blue-500 mb-2"/>
                        <h4 className="text-lg font-bold text-slate-800">解析成功</h4>
                        <p className="text-sm text-slate-500 mt-1">請確認是否覆蓋現有資料</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-200">
                            <span className="block text-2xl font-bold text-slate-800">{pendingSyncData.positions.length}</span>
                            <span className="text-xs text-slate-500">筆部位資料</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-200">
                            <span className="block text-2xl font-bold text-slate-800">{pendingSyncData.clients.length}</span>
                            <span className="text-xs text-slate-500">位投資人</span>
                        </div>
                    </div>

                    <div className="w-full space-y-3 mt-auto">
                        <button onClick={handleConfirmSync} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-md transition transform active:scale-95">
                            確認覆蓋並匯入
                        </button>
                        <button onClick={handleCancelSync} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-lg font-bold transition">
                            取消
                        </button>
                    </div>
                </div>
            ) : activeTab === 'market' ? (
                <div className="space-y-4">
                     <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 space-y-1">
                        <p className="font-bold">自動同步設定：</p>
                        <p>輸入 Google Sheet 發布的 CSV 或網頁(HTML) 連結，即可在主畫面一鍵更新股價。</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">Google Sheet 連結 (CSV/HTML)</label>
                        <input className="w-full border p-2 text-xs rounded" placeholder="https://docs.google.com/.../pub?output=csv" value={inputUrl} onChange={e=>setInputUrl(e.target.value)}/>
                        <button onClick={handleSaveMarketId} className="w-full bg-blue-600 text-white py-2 rounded text-sm font-bold">儲存設定</button>
                        {googleSheetId && <p className="text-xs text-green-600 flex items-center gap-1"><Check size={12}/> 已連結 ID: {googleSheetId.substring(0,8)}...</p>}
                    </div>
                    <hr className="border-slate-100"/>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">或直接貼上 (代碼 價格)</label>
                        <textarea className="w-full h-24 border p-2 text-xs font-mono rounded" placeholder="NVDA 800&#10;7203 3500" value={pasteContent} onChange={e=>setPasteContent(e.target.value)}/>
                        <button onClick={handlePasteMarket} className="w-full bg-slate-600 text-white py-2 rounded text-sm">手動更新</button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="bg-purple-50 p-3 rounded text-xs text-purple-800 space-y-2">
                        <p className="font-bold flex items-center gap-1"><Database size={12}/> 如何運作？</p>
                        <p>您可以在 Google Sheet 上管理所有投資部位，然後在此處貼上連結匯入。</p>
                        <p className="font-bold">支援格式：</p>
                        <ul className="list-disc list-inside opacity-80 pl-2">
                            <li>CSV 連結 (<code>output=csv</code>)</li>
                            <li>網頁發布連結 (<code>/pubhtml</code>)</li>
                        </ul>
                        <p className="opacity-80 mt-2">支援欄位：產品名稱, 幣別, 本金, 年息, 到期日, KI, KO, <span className="font-bold text-purple-700">履約(%)</span>, 標的</p>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500">Google Sheet 連結 (CSV/HTML)</label>
                        <input 
                            className="w-full border p-2 text-xs rounded focus:ring-2 focus:ring-purple-500 outline-none" 
                            placeholder="https://docs.google.com/.../pubhtml" 
                            value={portfolioSheetUrl} 
                            onChange={e=>setPortfolioSheetUrl(e.target.value)}
                        />
                    </div>

                    <button 
                        onClick={handleSyncPortfolioAction} 
                        disabled={isSyncing || !portfolioSheetUrl}
                        className={`w-full py-3 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 ${isSyncing ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'}`}
                    >
                        {isSyncing ? <RefreshCw size={16} className="animate-spin"/> : <CloudDownload size={16}/>}
                        {isSyncing ? '同步中...' : '開始匯入'}
                    </button>
                    
                    <div className="text-[10px] text-slate-400 text-center">
                        注意：匯入將會覆蓋此裝置上現有的所有部位資料。
                    </div>
                </div>
            )}
        </div>
        
        {status && !pendingSyncData && <div className="mt-4 p-2 bg-slate-800 text-white text-xs rounded text-center animate-in fade-in whitespace-pre-wrap">{status}</div>}
      </div>
    </div>
  );
};

// ... ShareLinkModal, ExportModal, ClientManagerModal ... (Unchanged logic, kept for context)
const ShareLinkModal = ({ isOpen, onClose, link, clientName }) => {
  const [copyStatus, setCopyStatus] = useState("複製連結");
  const inputRef = useRef(null);

  const handleCopy = (text) => {
      const success = copyToClipboard(link);
      if(success) { setCopyStatus("已複製！"); setTimeout(() => setCopyStatus("複製連結"), 2000); }
      else prompt("請手動複製：", link);
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
            
            <div className="space-y-4">
                <p className="text-xs text-slate-500 mb-3">
                    將此連結傳送給客戶，對方即可在手機上查看即時部位與損益（唯讀模式）。
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
            </div>
        </div>
    </div>
  );
};

const ClientManagerModal = ({ isOpen, onClose, clients, onAdd, onDelete, activeId, onGenerateShareLink }) => {
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
              <div className="flex gap-1">
                  <button onClick={() => onGenerateShareLink(c.id)} className="text-slate-300 hover:text-blue-500 p-1" title="產生分享連結"><Share2 size={14}/></button>
                  <button onClick={() => onDelete(c.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={14}/></button>
              </div>
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
                <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-lg"><Check size={16}/></button>
                <button type="button" onClick={()=>setIsAdding(false)} className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg"><X size={16}/></button>
            </form>
        ) : (
            <button onClick={()=>setIsAdding(true)} className="w-full border border-dashed border-slate-300 text-slate-500 py-2.5 rounded-lg text-sm hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300 transition flex items-center justify-center gap-2"><Plus size={14}/> 新增投資人</button>
        )}
      </div>
    </div>
  );
};

const AddPositionModal = ({ isOpen, onClose, onAdd, newPosition, setNewPosition, tempUnderlyings, setTempUnderlyings, isEdit }) => {
  const addU = () => setTempUnderlyings([...tempUnderlyings, { id: Date.now(), ticker: "", entryPrice: 100 }]);
  const removeU = (id) => setTempUnderlyings(tempUnderlyings.filter(u => u.id !== id));
  const updateU = (id, f, v) => setTempUnderlyings(tempUnderlyings.map(u => u.id === id ? { ...u, [f]: v } : u));

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-5 mb-10 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? '修改部位' : '新增部位'}</h2>
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

          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm">
            {isEdit ? '確認修改' : '建立部位'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- 4. App Component ---

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
  const [portfolioSheetUrl, setPortfolioSheetUrl] = useState(() => localStorage.getItem(KEY_PORTFOLIO_URL) || "");
  const [savedPassword, setSavedPassword] = useState(() => localStorage.getItem(KEY_PASSWORD) || "");
  const [isUnlocked, setIsUnlocked] = useState(() => !localStorage.getItem(KEY_PASSWORD)); 
  
  const [currentShareData, setCurrentShareData] = useState({ url: '', name: '' }); 
  const [pendingAction, setPendingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmbedSheet, setShowEmbedSheet] = useState(false);

  // UI States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDataSyncModalOpen, setIsDataSyncModalOpen] = useState(false); // Changed name
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [isShareLinkModalOpen, setIsShareLinkModalOpen] = useState(false); 

  // Form States
  const [editId, setEditId] = useState(null);
  const [formPosition, setFormPosition] = useState(DEFAULT_FORM_STATE);
  const [formUnderlyings, setFormUnderlyings] = useState([{ id: Date.now(), ticker: "", entryPrice: 0 }]);

  // --- Helper: Fetch with Fallback and Forced UTF-8 ---
  const fetchWithFallback = async (targetUrl) => {
      const decoder = new TextDecoder('utf-8');

      const fetchAndDecode = async (url) => {
          const res = await fetch(url, { cache: 'no-store' }); // Attempt to bypass browser cache
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const buffer = await res.arrayBuffer();
          return decoder.decode(buffer);
      };

      // Append timestamp to avoid caching
      const separator = targetUrl.includes('?') ? '&' : '?';
      const timedUrl = `${targetUrl}${separator}_t=${Date.now()}`;
      const encodedUrl = encodeURIComponent(timedUrl);

      // Strategy 1: AllOrigins
      try {
          return await fetchAndDecode(`https://api.allorigins.win/raw?url=${encodedUrl}`);
      } catch (e) { console.warn("AllOrigins failed", e); }

      // Strategy 2: CodeTabs
      try {
          return await fetchAndDecode(`https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`);
      } catch (e) { console.warn("CodeTabs failed", e); }
      
      // Strategy 3: CorsProxy
      try {
          return await fetchAndDecode(`https://corsproxy.io/?${encodedUrl}`);
      } catch (e) { console.warn("CorsProxy failed", e); }

      // Strategy 4: Direct
      try {
          return await fetchAndDecode(timedUrl);
      } catch (e) { 
          console.error("All fetch strategies failed", e);
          throw new Error("無法下載資料 (Network Error)\n\n可能原因：\n1. Google Sheet 未發布或連結權限不足\n2. 網路封鎖了代理服務\n3. 短時間內請求過多\n\n建議：請檢查連結是否為「公開/發布」，或稍後再試。"); 
      }
  };

  // --- Initialization (Hash Check) ---
  useEffect(() => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#share=')) {
          const shareCode = hash.replace('#share=', '');
          if(!shareCode) return;
          try {
              const decodedRaw = JSON.parse(base64UrlDecode(shareCode));
              const decoded = unminifyData(decodedRaw);
              setGuestData(decoded); setIsGuestMode(true);
              if (decoded.prices) setMarketPrices(decoded.prices);
              if (decoded.lastUpdated) setLastUpdated(decoded.lastUpdated);
              setViewMode('dashboard');
              window.history.replaceState(null, '', window.location.pathname);
          } catch (e) {
              console.error("Hash parse error", e);
              alert("連結無效或資料已損毀");
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
    sourcePositions.forEach(p => { if(p.underlyings) p.underlyings.forEach(u => tickers.add(u.ticker)); });
    return Array.from(tickers).sort();
  }, [allPositions, currentClientPositions, isGuestMode]);

  // --- Persistence ---
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); } catch(e){} }, [clients, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_POSITIONS, JSON.stringify(allPositions)); } catch(e){} }, [allPositions, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_PRICES, JSON.stringify(marketPrices)); } catch(e){} }, [marketPrices, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_SHEET_ID, googleSheetId); } catch(e){} }, [googleSheetId, isGuestMode]);
  useEffect(() => { if(!isGuestMode) try { localStorage.setItem(KEY_PORTFOLIO_URL, portfolioSheetUrl); } catch(e){} }, [portfolioSheetUrl, isGuestMode]);
  useEffect(() => { if(!isGuestMode) { if(savedPassword) localStorage.setItem(KEY_PASSWORD, savedPassword); else localStorage.removeItem(KEY_PASSWORD); } }, [savedPassword, isGuestMode]);

  // --- Logic ---
  const checkAuth = (action) => { if (isUnlocked) action(); else { setPendingAction(() => action); setIsPasswordPromptOpen(true); } };
  const handleUnlock = (inputPwd) => { if (inputPwd === savedPassword) { setIsUnlocked(true); setIsPasswordPromptOpen(false); if (pendingAction) { pendingAction(); setPendingAction(null); } } else { alert("密碼錯誤"); } };
  const handleAdminLogin = (inputPwd) => { if (!savedPassword || inputPwd === savedPassword) { setIsUnlocked(true); setIsGuestMode(false); setViewMode('dashboard'); return true; } else { alert("密碼錯誤"); return false; } };
  const handleManualLock = () => { if(savedPassword) setIsUnlocked(false); };

  const getPriceForTicker = (ticker) => {
    const cleanTarget = normalizeTicker(ticker);
    if (marketPrices[ticker] !== undefined) return marketPrices[ticker];
    const foundKey = Object.keys(marketPrices).find(k => normalizeTicker(k) === cleanTarget);
    if (foundKey) return marketPrices[foundKey];
    return undefined;
  };
  
  const normalizeTicker = (ticker) => {
    if (!ticker) return "";
    let normalized = toHalfWidth(ticker.toString()).toUpperCase();
    return normalized.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
  };

  const calculateRisk = (pos) => {
    let laggard = null; let minPerf = 99999;
    const underlyingDetails = (pos.underlyings || []).map(u => {
      const marketPrice = getPriceForTicker(u.ticker);
      const currentPrice = marketPrice !== undefined ? marketPrice : u.entryPrice;
      const performance = (currentPrice / u.entryPrice) * 100;
      const detail = { ...u, currentPrice, performance, kiPrice: u.entryPrice * (pos.kiLevel/100), koPrice: u.entryPrice * (pos.koLevel/100), strikePrice: u.entryPrice * (pos.strikeLevel/100) };
      if (performance < minPerf) { minPerf = performance; laggard = detail; }
      return detail;
    });
    const monthlyCoupon = Math.round((pos.nominal * (pos.couponRate / 100)) / 12);
    let riskStatus = "觀察中", statusColor = "bg-blue-100 text-blue-800";
    // Taiwan logic: Red = KO/Safe, Green = KI/Danger
    if (minPerf <= pos.kiLevel) { riskStatus = "已觸及 KI"; statusColor = "bg-green-100 text-green-800 font-bold border border-green-300"; } 
    else if (minPerf <= pos.kiLevel + 5) { riskStatus = "瀕臨 KI"; statusColor = "bg-orange-100 text-orange-800 font-bold"; } 
    else if (minPerf >= pos.koLevel) { riskStatus = "達成 KO"; statusColor = "bg-red-100 text-red-800 font-bold border border-red-300"; }
    return { ...pos, underlyingDetails, laggard, riskStatus, statusColor, monthlyCoupon };
  };

  const processedPositions = useMemo(() => currentClientPositions.map(calculateRisk), [currentClientPositions, marketPrices]);
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

  // --- Action Handlers ---
  // FIXED: Force Proxy via AllOrigins
  const handleSyncGoogleSheet = async () => {
    if(!googleSheetId) {
        setIsDataSyncModalOpen(true);
        return;
    }
    setIsLoading(true);
    
    // Construct export URL (Shared Link Safe)
    // Fix: If user pasted a full URL like /edit#gid=0, extract ID first.
    // But if googleSheetId is just the ID, then use this:
    const exportUrl = `https://docs.google.com/spreadsheets/d/${googleSheetId}/export?format=csv`;
    
    try {
      const text = await fetchWithFallback(exportUrl);
      
      // Check if we got an HTML error page instead of CSV
      if(text.includes("<!DOCTYPE html") || text.includes("google.com/accounts")) {
          // If HTML, try to parse as table directly if it's a pubhtml link
          if(googleSheetId.length > 20) { // likely full ID or bad ID
             const rows = parseRawDataToRows(text);
             if(rows.length > 0) {
                 // Convert rows to market prices
                 const newPrices = { ...marketPrices };
                 let count = 0;
                 rows.forEach(row => {
                     if(row.length >= 2) {
                         const t = row[0].toUpperCase().replace("TYO:","").replace("JP:","").replace(".T","");
                         const pStr = row[1].replace(/[¥$,JPY"\s]/g, '').replace(/,/g, '');
                         const p = parseFloat(pStr);
                         if(t && !isNaN(p)) { newPrices[t] = p; count++; }
                     }
                 });
                 if(count > 0) {
                     setMarketPrices(newPrices);
                     localStorage.setItem(KEY_PRICES, JSON.stringify(newPrices));
                     setLastUpdated(new Date().toLocaleString() + " (Web)");
                     alert(`同步成功！從網頁更新了 ${count} 筆報價。`);
                     return;
                 }
             }
          }
          throw new Error("權限錯誤：請確認連結設為「知道連結的人皆可檢視」");
      }

      const newPrices = { ...marketPrices };
      let count = 0;
      const lines = text.split(/\r?\n/);
      
      lines.forEach(row => {
          const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
          if(matches && matches.length >= 2) {
              let t = matches[0].replace(/^"|"$/g, '').trim().toUpperCase();
              t = t.replace("TYO:", "").replace("JP:", "").replace(".T", "");
              let pStr = matches[1].replace(/^"|"$/g, '').trim();
              pStr = pStr.replace(/[¥$,JPY"\s]/g, '').replace(/,/g, '');
              const p = parseFloat(pStr);
              if(t && !isNaN(p)) { newPrices[t] = p; count++; }
          }
      });
      
      if(count === 0) throw new Error("解析失敗：未找到有效股價");
      
      setMarketPrices(newPrices);
      localStorage.setItem(KEY_PRICES, JSON.stringify(newPrices));
      setLastUpdated(new Date().toLocaleString() + " (Sheet)");
      alert(`同步成功！更新了 ${count} 筆報價。`);
      
    } catch(e) {
      console.error(e);
      alert(`❌ 同步失敗：${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncPortfolio = (newClients, newPositions) => {
      setClients(newClients);
      setAllPositions(newPositions);
      
      // Set active client to first one if current one is invalid
      if(newClients.length > 0) {
          if(!newClients.find(c => c.id === activeClientId)) {
              setActiveClientId(newClients[0].id);
          }
      }
  };
  
  const handleSavePosition = (e) => {
    e.preventDefault();
    const validUnderlyings = formUnderlyings.filter(u => u.ticker.trim() !== "").map(u => ({ ticker: u.ticker.toUpperCase(), entryPrice: parseFloat(u.entryPrice) }));
    if (validUnderlyings.length === 0) return;
    const updatedPrices = { ...marketPrices };
    validUnderlyings.forEach(u => { if (getPriceForTicker(u.ticker) === undefined) updatedPrices[u.ticker] = u.entryPrice; });
    setMarketPrices(updatedPrices);
    const tickersStr = validUnderlyings.map(u => u.ticker).join('/');
    const entryData = {
      clientId: activeClientId, productName: formPosition.productName || `FCN ${tickersStr}`, issuer: formPosition.issuer || "Self", nominal: parseFloat(formPosition.nominal), currency: formPosition.currency, couponRate: parseFloat(formPosition.couponRate), strikeDate: formPosition.strikeDate, koObservationStartDate: formPosition.koObservationStartDate, maturityDate: formPosition.maturityDate, tenor: formPosition.tenor, koLevel: parseFloat(formPosition.koLevel), kiLevel: parseFloat(formPosition.kiLevel), strikeLevel: parseFloat(formPosition.strikeLevel), underlyings: validUnderlyings, status: "Active"
    };
    if (editId) setAllPositions(prev => prev.map(p => p.id === editId ? { ...entryData, id: editId } : p));
    else setAllPositions(prev => [...prev, { ...entryData, id: Date.now() }]);
    setIsAddModalOpen(false);
  };

  const deletePosition = (id) => { checkAuth(() => { if(confirm("確定刪除此部位？")) setAllPositions(allPositions.filter(p => p.id !== id)); }); };
  const handleAddClient = (name) => { checkAuth(() => { if (name) { const newId = `c${Date.now()}`; setClients(prev => [...prev, { id: newId, name }]); setActiveClientId(newId); } }); };
  const handleDeleteClient = (id) => { checkAuth(() => { if (clients.length <= 1) return alert("至少需保留一位"); if (confirm("確定刪除？")) { setClients(prev => prev.filter(c => c.id !== id)); setAllPositions(prev => prev.filter(p => p.clientId !== id)); if (activeClientId === id) setActiveClientId(clients[0].id); } }); };

  const handleGenerateShareLink = (clientId) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      const clientPositions = allPositions.filter(p => p.clientId === clientId);
      const relevantPrices = {};
      clientPositions.forEach(p => { p.underlyings.forEach(u => { const price = getPriceForTicker(u.ticker); if (price !== undefined) relevantPrices[u.ticker] = price; }); });
      const payload = { clientName: client.name, positions: clientPositions, prices: relevantPrices, lastUpdated: lastUpdated };
      try {
        const minified = minifyData(payload);
        const jsonString = JSON.stringify(minified);
        const encoded = base64UrlEncode(jsonString);
        const baseUrl = window.location.href.split(/[?#]/)[0];
        const url = `${baseUrl}#share=${encoded}`;
        setCurrentShareData({ url, name: client.name });
        setIsClientManagerOpen(false); 
        setIsShareLinkModalOpen(true);
      } catch (e) { alert("連結生成失敗"); }
  };

  const handleExitGuestMode = () => { if(confirm("確定要登出嗎？")) { setIsGuestMode(false); setGuestData(null); setViewMode('landing'); window.history.replaceState(null, '', window.location.pathname); } };
  const handleOpenAddModal = () => { checkAuth(() => { setEditId(null); setFormPosition(DEFAULT_FORM_STATE); setFormUnderlyings([{ id: Date.now(), ticker: "", entryPrice: 0 }]); setIsAddModalOpen(true); }); };
  const handleOpenEditModal = (pos) => { checkAuth(() => { setEditId(pos.id); setFormPosition({ productName: pos.productName, issuer: pos.issuer, nominal: pos.nominal, currency: pos.currency, couponRate: pos.couponRate, koLevel: pos.koLevel, kiLevel: pos.kiLevel, strikeLevel: pos.strikeLevel, strikeDate: pos.strikeDate, koObservationStartDate: pos.koObservationStartDate, tenor: pos.tenor, maturityDate: pos.maturityDate }); setFormUnderlyings(pos.underlyings.map((u, idx) => ({ ...u, id: Date.now() + idx }))); setIsAddModalOpen(true); }); };

  const handleExportCSV = () => {
    // UPDATED: Added Strike(%) and Strike Price to header
    const headers = ["投資人", "產品名稱", "發行商", "幣別", "名目本金", "年息(%)", "到期日", "KI(%)", "KO(%)", "履約(%)", "最差標的", "現價", "進場價", "履約價", "表現(%)", "狀態"];
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
          pos.strikeLevel, // Added
          calculated.laggard.ticker, 
          calculated.laggard.currentPrice, 
          calculated.laggard.entryPrice, 
          calculated.laggard.strikePrice.toFixed(2), // Added Strike Price
          calculated.laggard.performance.toFixed(2), 
          calculated.riskStatus
      ];
    });
    const csvString = [headers.join(','), ...rows.map(row => row.map(item => `"${String(item).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.setAttribute("download", `FCN_Portfolio.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (viewMode === 'landing') {
      return <LandingPage onAdminLogin={handleAdminLogin} hasPassword={!!savedPassword}/>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
      {isGuestMode && (
          <div className="bg-blue-600 text-white px-4 py-2 text-xs flex justify-between items-center sticky top-0 z-50 shadow-md">
              <div className="flex items-center gap-2"><Eye size={14} /><span className="font-bold">訪客檢視：{activeClient.name}</span></div>
              <button onClick={handleExitGuestMode} className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded flex items-center gap-1 transition"><X size={12}/> 登出</button>
          </div>
      )}
      <header className={`bg-white shadow-sm border-b border-slate-200 ${!isGuestMode ? 'sticky top-0 z-40' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <div className="flex items-center gap-2"><Activity className="text-blue-600 h-6 w-6" /><h1 className="text-lg font-bold text-slate-800 hidden sm:block">FCN 管理</h1>
                {!isGuestMode && (<button onClick={() => { if(savedPassword && isUnlocked) handleManualLock(); else if(savedPassword && !isUnlocked) setIsPasswordPromptOpen(true); else setIsSettingsModalOpen(true); }} className="ml-2 p-1.5 rounded-full transition-colors hover:bg-slate-100">{savedPassword ? (isUnlocked ? <Unlock size={16} className="text-green-600"/> : <Lock size={16} className="text-red-600"/>) : (<Settings size={16} className="text-slate-400 hover:text-slate-600"/>)}</button>)}
              </div>
              {!isGuestMode && (
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 pr-3 relative group">
                    <div className="bg-white p-1.5 rounded shadow-sm text-blue-600"><User size={16} /></div>
                    <select value={activeClientId} onChange={(e) => setActiveClientId(e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer appearance-none pr-6 min-w-[120px]">{clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}</select>
                    <ChevronDown size={14} className="absolute right-2 text-slate-400 pointer-events-none"/>
                    <button onClick={() => setIsClientManagerOpen(true)} className="ml-2 text-slate-400 hover:text-blue-600"><Edit3 size={14} /></button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end overflow-x-auto no-scrollbar">
               <button onClick={handleExportCSV} className="flex-none flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap"><FileText size={16} /><span className="hidden sm:inline">匯出</span><span className="sm:hidden">匯出</span></button>
               {!isGuestMode && (
                   <>
                    <button onClick={() => checkAuth(() => setIsDataSyncModalOpen(true))} className="flex-none flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white border border-purple-600 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap shadow-md">
                        <ArrowRightLeft size={16} />
                        <span>資料同步</span>
                    </button>
                    {googleSheetId && (
                        <button onClick={handleSyncGoogleSheet} className="flex-none flex items-center justify-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap">
                            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""}/>
                            <span className="hidden sm:inline">快刷報價</span>
                            <span className="sm:hidden">報價</span>
                        </button>
                    )}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* USD Asset Card */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <DollarSign size={48} className="text-slate-400"/>
                </div>
                <div className="relative z-10">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">USD 資產總覽</div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-1">
                            {/* Only integers for USD Nominal (e.g., 12萬) */}
                            <span className="text-2xl font-black text-slate-800">${(summary.usd.nominal/10000).toFixed(0)}</span>
                            <span className="text-sm font-bold text-slate-600">萬</span>
                            <span className="text-[10px] text-slate-400 ml-1 bg-slate-100 px-1.5 py-0.5 rounded">本金</span>
                        </div>
                        <div className="flex items-center gap-1 text-red-700 font-bold">
                             <Plus size={12} strokeWidth={4} />
                             {/* Explicit integer value for monthly coupon */}
                             <span className="text-lg">${summary.usd.monthly.toLocaleString()}</span>
                             <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded ml-1 border border-red-100">月息</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* JPY Asset Card */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Coins size={48} className="text-slate-400"/>
                </div>
                <div className="relative z-10">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">JPY 資產總覽</div>
                     <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-1">
                            {/* Only integers for JPY Nominal (e.g., 300萬) */}
                            <span className="text-2xl font-black text-slate-800">¥{(summary.jpy.nominal/10000).toFixed(0)}</span>
                            <span className="text-sm font-bold text-slate-600">萬</span>
                            <span className="text-[10px] text-slate-400 ml-1 bg-slate-100 px-1.5 py-0.5 rounded">本金</span>
                        </div>
                        <div className="flex items-center gap-1 text-red-700 font-bold">
                             <Plus size={12} strokeWidth={4} />
                             {/* Explicit integer value for monthly coupon */}
                             <span className="text-lg">¥{summary.jpy.monthly.toLocaleString()}</span>
                             <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded ml-1 border border-red-100">月息</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${summary.koCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">KO 機會</span>
              <div className="flex items-end justify-between mt-2">
                  <span className="text-3xl font-black text-red-600">{summary.koCount}</span>
                  <TrendingUp size={24} className="text-red-400 mb-1"/>
              </div>
            </div>
            
            <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${summary.kiCount > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">KI 風險</span>
              <div className="flex items-end justify-between mt-2">
                  <span className="text-3xl font-black text-green-600">{summary.kiCount}</span>
                  <AlertTriangle size={24} className="text-green-400 mb-1"/>
              </div>
            </div>

          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2"><Briefcase size={16} className="text-slate-400"/><h2 className="font-bold text-slate-700 text-sm">{activeClient.name} 的部位</h2></div>
              <span className="text-[10px] text-slate-400 bg-white border px-2 py-0.5 rounded-full">{currentClientPositions.length} 筆資料</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-slate-50/50 border-b border-slate-200">
                  <tr className="text-sm text-slate-600 font-bold">
                    <th className="px-4 py-3 min-w-[200px]">產品資訊</th>
                    <th className="px-4 py-3 text-right w-40">本金 / 月息</th>
                    <th className="px-4 py-3">連結標的情況</th>
                    <th className="px-4 py-3 text-right w-20">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processedPositions.map((pos) => {
                      const currencyLabel = pos.currency === 'USD' ? '美元' : (pos.currency === 'JPY' ? '日圓' : pos.currency);
                      return (
                        <tr key={pos.id} className="hover:bg-slate-50 transition group">
                          <td className="px-4 py-2 align-middle"> 
                            <div className="flex items-center gap-2 mb-2">
                               <span className={`text-[10px] px-1.5 rounded font-bold ${pos.currency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}> {pos.currency} </span>
                               <div className="text-sm font-black text-slate-800 whitespace-nowrap" title={pos.productName}>{pos.productName}</div>
                               <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ml-auto shrink-0 ${pos.statusColor}`}>{pos.riskStatus}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                 <div className="flex flex-wrap gap-2 items-center">
                                     <span className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 border border-slate-200 font-medium">{pos.issuer}</span>
                                     <span className="bg-blue-50 px-2 py-0.5 rounded text-xs text-blue-700 font-bold border border-blue-100">年息 {pos.couponRate}%</span>
                                 </div>
                                 
                                 <div className="flex flex-wrap gap-2 mt-2 text-[11px] font-bold">
                                     <span className="px-2 py-1 bg-red-50 text-red-700 rounded border border-red-100">KO {pos.koLevel}%</span>
                                     <span className="px-2 py-1 bg-slate-50 text-slate-600 rounded border border-slate-200">履約 {pos.strikeLevel}%</span>
                                     <span className="px-2 py-1 bg-green-50 text-green-700 rounded border border-green-100">KI {pos.kiLevel}%</span>
                                 </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-2"><Clock size={12}/> {pos.maturityDate} 到期</div>
                          </td>
                          
                          <td className="px-4 py-2 align-middle"> 
                            <div className="flex flex-col items-center justify-center h-full">
                                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-center items-center gap-2 w-28"> 
                                    <div className="text-center w-full border-b border-slate-100 pb-3">
                                        <span className="text-sm text-slate-600 font-bold tracking-widest block mb-1">本金</span>
                                        <div className="text-slate-800 font-black text-lg leading-tight truncate w-full">
                                           {formatToWan(pos.nominal)}<span className="text-xs ml-0.5">萬</span>
                                        </div>
                                    </div>
                                    <div className="text-center w-full pt-1">
                                        <span className="text-sm text-red-600 font-bold tracking-widest block mb-1">月息</span>
                                        <div className="text-red-700 font-black text-lg leading-tight truncate w-full">
                                           {pos.monthlyCoupon.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                          </td>

                          <td className="px-4 py-2 align-middle"> 
                            <div className="flex flex-col gap-1"> 
                              {/* Table Header */}
                              <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 font-bold border-b border-slate-200 pb-1 mb-1 px-1">
                                  <span className="text-left">標的</span>
                                  <span className="text-right">現價</span>
                                  <span className="text-right text-red-600">KO</span>
                                  <span className="text-right text-slate-500">履約</span>
                                  <span className="text-right text-green-600">KI</span>
                              </div>
                              {/* Table Rows */}
                              {(pos.underlyingDetails || []).map((u) => {
                                return (
                                  <div key={u.ticker} className="grid grid-cols-5 gap-2 items-center text-sm border-b border-slate-50 last:border-0 pb-1 px-1 hover:bg-slate-50 transition-colors rounded">
                                    <span className="font-black text-slate-800 text-sm">{u.ticker}</span>
                                    <span className={`font-mono font-black text-right text-base ${u.currentPrice < u.entryPrice ? 'text-green-600' : 'text-red-600'}`}>
                                        {u.currentPrice.toLocaleString()}
                                    </span>
                                    <span className="font-mono font-bold text-red-700 text-right text-sm">{u.koPrice.toFixed(0)}</span>
                                    <span className="font-mono text-slate-500 text-right text-sm">{u.strikePrice.toFixed(0)}</span>
                                    <span className="font-mono font-bold text-green-700 text-right text-sm">{u.kiPrice.toFixed(0)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right align-middle"> 
                            {!isGuestMode && (
                                <div className="flex flex-col items-end gap-2 h-full justify-center">
                                    <button onClick={() => handleOpenEditModal(pos)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition" title="編輯部位"><Pencil size={18} /></button>
                                    <button onClick={() => deletePosition(pos.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition" title="刪除部位"><Trash2 size={18} /></button>
                                </div>
                            )}
                          </td>
                        </tr>
                      );
                  })}
                  {processedPositions.length === 0 && (
                    <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-400">目前沒有部位，請點擊右上角「新增」</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {isDataSyncModalOpen && <DataSyncModal isOpen={isDataSyncModalOpen} onClose={() => setIsDataSyncModalOpen(false)} marketPrices={marketPrices} setMarketPrices={setMarketPrices} setLastUpdated={setLastUpdated} googleSheetId={googleSheetId} setGoogleSheetId={setGoogleSheetId} onSyncPortfolio={handleSyncPortfolio} portfolioSheetUrl={portfolioSheetUrl} setPortfolioSheetUrl={setPortfolioSheetUrl} fetchWithFallback={fetchWithFallback} />}
      {isAddModalOpen && <AddPositionModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleSavePosition} newPosition={formPosition} setNewPosition={setFormPosition} tempUnderlyings={formUnderlyings} setTempUnderlyings={setFormUnderlyings} isEdit={!!editId} />}
      {isClientManagerOpen && <ClientManagerModal isOpen={isClientManagerOpen} onClose={() => setIsClientManagerOpen(false)} clients={clients} onAdd={handleAddClient} onDelete={handleDeleteClient} activeId={activeClientId} onGenerateShareLink={handleGenerateShareLink} />}
      {isExportModalOpen && <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} allPositions={allPositions} clients={clients} marketPrices={marketPrices} calculateRisk={calculateRisk} />}
      {isSettingsModalOpen && <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} savedPassword={savedPassword} setSavedPassword={setSavedPassword} setIsUnlocked={setIsUnlocked} />}
      {isPasswordPromptOpen && <PasswordPromptModal isOpen={isPasswordPromptOpen} onConfirm={handleUnlock} onCancel={() => { setIsPasswordPromptOpen(false); setPendingAction(null); }} />}
      {isShareLinkModalOpen && <ShareLinkModal isOpen={isShareLinkModalOpen} onClose={() => setIsShareLinkModalOpen(false)} link={currentShareData.url} clientName={currentShareData.name} />}
    </div>
  );
};

export default App;