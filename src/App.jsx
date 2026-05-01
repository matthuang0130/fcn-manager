import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Activity, ChevronDown, RefreshCw, X, Clock, Edit3, List, Eye, EyeOff, Coins, AlertCircle, User, Briefcase, Check, Download, Copy, FileText, Pencil, Lock, Unlock, Settings, Share2, Link as LinkIcon, LogIn, FileJson, CloudDownload, ExternalLink, Database, ArrowRightLeft, RefreshCcw, Loader } from 'lucide-react';

/**
 * FCN 投資組合管理系統 (Final Production Version)
 */

// --- 1. Constants ---
const DEFAULT_CLIENTS = [{ id: 'c1', name: '預設投資人' }];
const INITIAL_POSITIONS = [
  {
    id: 1, clientId: 'c1', productName: "FCN Tech SNMSELN02384", issuer: "GS", nominal: 100000, currency: "USD", couponRate: 12.5,
    strikeDate: "2024-01-15", koObservationStartDate: "2024-04-15", tenor: "6 個月", maturityDate: "2024-07-15",
    koLevel: 105, kiLevel: 70, strikeLevel: 100,
    underlyings: [{ ticker: "NVDA", entryPrice: 550, memoryKO: false }, { ticker: "AMD", entryPrice: 140, memoryKO: false }, { ticker: "TSLA", entryPrice: 200 }, { ticker: "MSFT", entryPrice: 400, memoryKO: false }], status: "Active"
  }
];
const DEFAULT_MARKET_PRICES = { "NVDA": 610.50, "AMD": 135.20, "TSLA": 190.00, "RIVN": 11.50, "AAPL": 175.00, "MSFT": 405.00, "7203": 3550, "7267": 1700, "COIN": 165.00 };
const DEFAULT_FORM_STATE = { productName: "", issuer: "", nominal: 10000, currency: "USD", couponRate: 10, koLevel: 103, kiLevel: 70, strikeLevel: 100, strikeDate: new Date().toISOString().split('T')[0], koObservationStartDate: "", tenor: "6 個月", maturityDate: "" };

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
        const isCorrupted = parsed.some(c => c.name && (c.name.includes('function') || c.name.includes('var ')));
        if (isCorrupted) return defaultValue;
    }
    return parsed;
  } catch (e) { return defaultValue; }
};
const toHalfWidth = (str) => str ? str.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ') : "";
const base64UrlEncode = (str) => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64UrlDecode = (str) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
};
const copyToClipboard = (text) => {
    try {
        const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.left = "-9999px";
        document.body.appendChild(textArea); textArea.focus(); textArea.select();
        const successful = document.execCommand('copy'); document.body.removeChild(textArea); return successful;
    } catch (err) { return false; }
};
const formatToWan = (val) => val ? parseFloat((val / 10000).toFixed(2)).toString() : "0";
const minifyData = (payload) => ({ v: 1, n: payload.clientName, t: payload.lastUpdated, s: payload.sheetId, p: payload.positions.map(p => [p.productName, p.issuer, p.nominal, p.currency, p.couponRate, p.koLevel, p.kiLevel, p.strikeLevel, p.strikeDate, p.koObservationStartDate, p.maturityDate, p.tenor, p.underlyings.map(u => [u.ticker, u.entryPrice, u.memoryKO ? 1 : 0])]), m: payload.prices });
const unminifyData = (minified) => {
    if (!minified.v) return minified; 
    return {
        clientName: minified.n, lastUpdated: minified.t, prices: minified.m, sheetId: minified.s, 
        positions: minified.p.map((arr, index) => ({ id: index, productName: arr[0], issuer: arr[1], nominal: arr[2], currency: arr[3], couponRate: arr[4], koLevel: arr[5], kiLevel: arr[6], strikeLevel: arr[7], strikeDate: arr[8], koObservationStartDate: arr[9], maturityDate: arr[10], tenor: arr[11], underlyings: arr[12].map(u => ({ ticker: u[0], entryPrice: u[1], memoryKO: !!u[2] })), status: "Active", clientId: 'guest' }))
    };
};

const parseRawDataToRows = (text) => {
    let rows = [];
    if (text.trim().startsWith('<') && text.includes('<table')) {
        try {
            const parser = new DOMParser(); const doc = parser.parseFromString(text, 'text/html');
            const scripts = doc.querySelectorAll('script, style, noscript, iframe'); scripts.forEach(n => n.remove());
            const trs = Array.from(doc.querySelectorAll('tr'));
            rows = trs.map(tr => Array.from(tr.querySelectorAll('td, th')).map(cell => cell.innerText.trim())).filter(row => row.some(cell => cell.length > 0));
        } catch (e) { throw new Error("HTML 解析失敗"); }
    } else {
        rows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
            const res = []; let entry = []; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '"') inQuotes = !inQuotes;
                else if (line[i] === ',' && !inQuotes) { res.push(entry.join('').trim().replace(/^"|"$/g, '').replace(/""/g, '"')); entry = []; }
                else entry.push(line[i]);
            }
            res.push(entry.join('').trim().replace(/^"|"$/g, '').replace(/""/g, '"')); return res;
        });
    }
    return rows;
};

const parsePortfolioRows = (rows) => {
    const garbageCheck = rows.slice(0, 5).some(r => r.some(c => c && (c.includes('function') || c.includes('var ') || c.includes('<!DOCTYPE'))));
    if (garbageCheck) throw new Error("匯入失敗：資料包含程式碼片段。");
    if (rows.length < 2) throw new Error("資料內容為空");
    const headerMap = { 'client': ['client', '投資人'], 'product': ['product', 'name', '產品'], 'issuer': ['issuer', '發行商'], 'currency': ['currency', '幣別'], 'nominal': ['nominal', '本金'], 'coupon': ['coupon', '年息'], 'maturity': ['maturity', '到期'], 'ki': ['ki', '下限'], 'ko': ['ko', '上限'], 'strike': ['strike', '履約'], 'underlyings': ['underlying', '標的'], 'koObservation': ['observation', '觀察'] };
    let headerIdx = -1; let idx = {};
    const getIndex = (row, keys, excludeKeys = []) => row.map(c => c.toLowerCase()).findIndex(h => keys.some(k => h.includes(k)) && !excludeKeys.some(ek => h.includes(ek)));
    for(let i=0; i<Math.min(rows.length, 20); i++) {
        const pIdx = getIndex(rows[i], headerMap.product);
        if (pIdx > -1) { headerIdx = i; idx = { client: getIndex(rows[i], headerMap.client), product: pIdx, issuer: getIndex(rows[i], headerMap.issuer), currency: getIndex(rows[i], headerMap.currency), nominal: getIndex(rows[i], headerMap.nominal), coupon: getIndex(rows[i], headerMap.coupon), maturity: getIndex(rows[i], headerMap.maturity), ki: getIndex(rows[i], headerMap.ki), ko: getIndex(rows[i], headerMap.ko, ['observation', 'date']), strike: getIndex(rows[i], headerMap.strike), underlyings: getIndex(rows[i], headerMap.underlyings), koObservation: getIndex(rows[i], headerMap.koObservation) }; break; }
    }
    if (headerIdx === -1) throw new Error("找不到產品欄位");
    const newClientsMap = new Map(); const newPositions = [];
    const parsePercent = (val, d) => { if (!val) return d; const n = parseFloat(val.toString().replace(/[%]/g, '')); return isNaN(n) ? d : (n < 5 ? n * 100 : n); };
    const normalizeDate = (v) => { if (!v) return ""; const d = v.toString().trim().replace(/[\/\.]/g, '-'); const p = d.split('-'); return p.length === 3 && p[0].length === 4 ? `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}` : d; };
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i]; if (row.length < 3 || !row[idx.product]) continue;
        const cName = idx.client > -1 ? (row[idx.client] || '預設投資人') : '預設投資人';
        if (!newClientsMap.has(cName)) newClientsMap.set(cName, `c_${Date.now()}_${Math.floor(Math.random()*1000)}`);
        const cId = newClientsMap.get(cName);
        const uRaw = idx.underlyings > -1 ? row[idx.underlyings] : ""; const underlyings = [];
        if (uRaw) { uRaw.split(/[\/;|\n]+/).forEach(p => { const parts = p.trim().split(/[:\s]+/).filter(Boolean); if (parts.length >= 1) underlyings.push({ ticker: parts[0].toUpperCase(), entryPrice: parseFloat(parts[parts.length-1].replace(/,/g, '')) || 100, name: parts.length > 2 ? parts.slice(1, parts.length - 1).join(' ') : "", memoryKO: false }); }); }
        newPositions.push({ id: Date.now() + i, clientId: cId, productName: row[idx.product], issuer: idx.issuer > -1 ? row[idx.issuer] : "", currency: idx.currency > -1 ? row[idx.currency].toUpperCase() : "USD", nominal: idx.nominal > -1 ? (parseFloat(row[idx.nominal].replace(/,/g, '')) || 0) : 0, couponRate: idx.coupon > -1 ? (parseFloat(row[idx.coupon].replace(/[%]/g, '')) || 0) : 0, maturityDate: idx.maturity > -1 ? normalizeDate(row[idx.maturity]) : "", kiLevel: idx.ki > -1 ? parsePercent(row[idx.ki], 60) : 60, koLevel: idx.ko > -1 ? parsePercent(row[idx.ko], 100) : 100, strikeLevel: idx.strike > -1 ? parsePercent(row[idx.strike], 100) : 100, underlyings: underlyings.length ? underlyings : [{ ticker: "UNKNOWN", entryPrice: 100, memoryKO: false }], strikeDate: "", koObservationStartDate: idx.koObservation > -1 ? normalizeDate(row[idx.koObservation]) : "", tenor: "", status: "Active" });
    }
    return { clients: Array.from(newClientsMap.entries()).map(([name, id]) => ({ id, name })), positions: newPositions };
};

// --- 3. Sub-Components ---
const LandingPage = ({ onAdminLogin, hasPassword }) => {
    const [password, setPassword] = useState("");
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6">
                <div className="text-center mb-8">
                    <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200"><Activity size={32} className="text-white"/></div>
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
    const handleFactoryReset = () => { if(confirm("確定要重置所有資料嗎？")) { localStorage.clear(); window.location.reload(); } };
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
                <div><h4 className="text-xs font-bold text-slate-500 mb-2 uppercase">系統維護</h4><button onClick={handleFactoryReset} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition"><RefreshCcw size={16}/> 重置所有資料</button></div>
            </div>
        </div>
    );
};

const ExportModal = ({ isOpen, onClose, allPositions, clients, marketPrices, calculateRisk }) => {
  const [csvContent, setCsvContent] = useState(''); const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => {
    if (isOpen) {
      const h = ["投資人", "產品名稱", "發行商", "幣別", "名目本金", "年息(%)", "到期日", "KO觀察日", "KI(%)", "KO(%)", "履約(%)", "連結標的 (代碼 進場價)", "最差標的", "現價", "進場價", "履約價", "表現(%)", "狀態"];
      const r = allPositions.map(p => {
        const c = calculateRisk(p); const cName = clients.find(cl => cl.id === p.clientId)?.name || "未知";
        return [cName, p.productName, p.issuer, p.currency, p.nominal, p.couponRate, p.maturityDate, p.koObservationStartDate || "", p.kiLevel, p.koLevel, p.strikeLevel, p.underlyings.map(u => `${u.ticker} ${u.entryPrice}`).join(' / '), c.laggard?.ticker || "", c.laggard?.currentPrice || 0, c.laggard?.entryPrice || 0, c.laggard?.strikePrice?.toFixed(2) || "0.00", c.laggard?.performance?.toFixed(2) || "0.00", c.riskStatus];
      });
      setCsvContent([h.join(','), ...r.map(row => row.map(i => `"${String(i).replace(/"/g, '""')}"`).join(','))].join('\n'));
    }
  }, [isOpen, allPositions, clients, marketPrices]);
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-center">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5">
        <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="font-bold text-slate-800">匯出資料</h3><button onClick={onClose}><X size={20}/></button></div>
        <textarea readOnly className="w-full h-32 border p-2 text-xs font-mono rounded bg-slate-50 mb-4" value={csvContent} />
        <div className="flex gap-3"><button onClick={() => { if(copyToClipboard(csvContent)) { setCopyStatus('已複製'); setTimeout(()=>setCopyStatus(''),2000); } }} className="flex-1 bg-slate-100 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Copy size={16}/> {copyStatus || "複製內容"}</button></div>
      </div>
    </div>
  );
};

const DataSyncModal = ({ isOpen, onClose, marketPrices, setMarketPrices, setLastUpdated, googleSheetId, setGoogleSheetId, onSyncPortfolio, portfolioSheetUrl, setPortfolioSheetUrl, fetchWithFallback }) => {
  const [activeTab, setActiveTab] = useState('market'); const [pasteContent, setPasteContent] = useState(''); const [inputUrl, setInputUrl] = useState(''); const [status, setStatus] = useState(''); const [isSyncing, setIsSyncing] = useState(false); const [pendingSyncData, setPendingSyncData] = useState(null);
  const parseSheetId = (url) => { const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : (url.length > 20 && !url.includes('/') ? url : null); };
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-center">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 h-[500px] flex flex-col">
        <div className="flex justify-between mb-4 border-b pb-2"><h3 className="font-bold flex items-center gap-2"><ArrowRightLeft size={18} className="text-blue-600"/> 資料同步中心</h3><button onClick={onClose}><X size={20}/></button></div>
        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
          <button onClick={()=>setActiveTab('market')} className={`flex-1 py-2 text-xs rounded-md ${activeTab==='market'?'bg-white text-blue-600 font-bold shadow-sm':'text-slate-500'}`}>1. 市場報價</button>
          <button onClick={()=>setActiveTab('portfolio')} className={`flex-1 py-2 text-xs rounded-md ${activeTab==='portfolio'?'bg-white text-purple-600 font-bold shadow-sm':'text-slate-500'}`}>2. 匯入投資組合</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'market' ? (
            <div className="space-y-4">
              <input className="w-full border p-2 text-xs rounded" placeholder="Google Sheet 連結" value={inputUrl} onChange={e=>setInputUrl(e.target.value)}/>
              <button onClick={()=>{const id=parseSheetId(inputUrl); if(id){setGoogleSheetId(id); setStatus("已儲存");}else setStatus("無效連結");}} className="w-full bg-blue-600 text-white py-2 rounded text-sm font-bold">儲存設定</button>
              <textarea className="w-full h-24 border p-2 text-xs font-mono rounded" placeholder="或直接貼上 (代碼 價格)" value={pasteContent} onChange={e=>setPasteContent(e.target.value)}/>
              <button onClick={()=>{const n={...marketPrices}; pasteContent.split('\n').forEach(l=>{const m=l.match(/([A-Za-z0-9.:]+)[^\d-]*([\d.,]+)/); if(m)n[m[1].toUpperCase().replace(".T","")]=parseFloat(m[2].replace(/,/g,''));}); setMarketPrices(n); setStatus("更新成功");}} className="w-full bg-slate-600 text-white py-2 rounded text-sm">手動更新</button>
            </div>
          ) : (
            <div className="space-y-4">
              <input className="w-full border p-2 text-xs rounded" placeholder="CSV/HTML 連結" value={portfolioSheetUrl} onChange={e=>setPortfolioSheetUrl(e.target.value)}/>
              <button onClick={async ()=>{setIsSyncing(true); setStatus("讀取中..."); try{const t=await fetchWithFallback(portfolioSheetUrl); const {clients,positions}=parsePortfolioRows(parseRawDataToRows(t)); setPendingSyncData({clients,positions}); setStatus("解析成功");}catch(e){setStatus(`錯誤: ${e.message}`);}finally{setIsSyncing(false);}} className="w-full bg-purple-600 text-white py-2 rounded text-sm font-bold flex items-center justify-center gap-2">{isSyncing && <RefreshCw className="animate-spin" size={14}/>}開始匯入</button>
              {pendingSyncData && <button onClick={()=>{onSyncPortfolio(pendingSyncData.clients, pendingSyncData.positions); onClose();}} className="w-full bg-blue-600 text-white py-2 rounded font-bold">確認覆蓋並匯入 ({pendingSyncData.positions.length} 筆)</button>}
            </div>
          )}
        </div>
        {status && <div className="mt-4 p-2 bg-slate-800 text-white text-xs rounded text-center">{status}</div>}
      </div>
    </div>
  );
};

const ShareLinkModal = ({ isOpen, onClose, link, clientName }) => {
  const [copyStatus, setCopyStatus] = useState("複製連結");
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-2 mb-4"><Share2 size={18} className="text-blue-600"/> 分享給 {clientName}</h3>
        <input readOnly value={link} onClick={e=>e.target.select()} className="w-full bg-slate-50 border rounded-lg px-3 py-3 text-xs mb-4" />
        <button onClick={()=>{if(copyToClipboard(link)){setCopyStatus("已複製"); setTimeout(()=>setCopyStatus("複製連結"),2000);}}} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2"><Copy size={16}/> {copyStatus}</button>
      </div>
    </div>
  );
};

const ClientManagerModal = ({ isOpen, onClose, clients, onAdd, onDelete, activeId, onGenerateShareLink }) => { 
  const [newName, setNewName] = useState('');
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
        <div className="flex justify-between items-center mb-4 font-bold text-slate-800"><h3>管理投資人</h3><button onClick={onClose}><X size={20}/></button></div>
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {clients.map(c => (
            <div key={c.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
              <span className={`text-sm ${c.id === activeId ? "font-bold text-blue-700" : ""}`}>{c.name}</span>
              <div className="flex gap-2"><button onClick={()=>onGenerateShareLink(c.id)} className="text-slate-400 hover:text-blue-600"><Share2 size={14}/></button><button onClick={()=>onDelete(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button></div>
            </div>
          ))}
        </div>
        <div className="flex gap-2"><input className="flex-1 border rounded px-3 py-2 text-sm" placeholder="新投資人..." value={newName} onChange={e=>setNewName(e.target.value)}/><button onClick={()=>{if(newName){onAdd(newName);setNewName('');}}} className="bg-blue-600 text-white px-3 py-2 rounded"><Plus size={16}/></button></div>
      </div>
    </div>
  );
};

const AddPositionModal = ({ isOpen, onClose, onAdd, newPosition, setNewPosition, tempUnderlyings, setTempUnderlyings, isEdit }) => {
  const addU = () => setTempUnderlyings([...tempUnderlyings, { id: Date.now(), ticker: "", entryPrice: 100 }]);
  const updateU = (id, f, v) => setTempUnderlyings(tempUnderlyings.map(u => u.id === id ? { ...u, [f]: v } : u));
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-5">
        <div className="flex justify-between mb-4 font-bold border-b pb-2"><h2>{isEdit ? '修改部位' : '新增部位'}</h2><button onClick={onClose}><X size={20}/></button></div>
        <form onSubmit={onAdd} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2 md:col-span-4"><label className="text-xs text-slate-500">產品名稱</label><input required className="w-full border rounded px-3 py-2 text-sm" value={newPosition.productName} onChange={e=>setNewPosition({...newPosition, productName:e.target.value})}/></div>
            <div><label className="text-xs text-slate-500">本金</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={newPosition.nominal} onChange={e=>setNewPosition({...newPosition, nominal:e.target.value})}/></div>
            <div><label className="text-xs text-slate-500">年息%</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={newPosition.couponRate} onChange={e=>setNewPosition({...newPosition, couponRate:e.target.value})}/></div>
            <div><label className="text-xs text-slate-500">KI%</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={newPosition.kiLevel} onChange={e=>setNewPosition({...newPosition, kiLevel:e.target.value})}/></div>
            <div><label className="text-xs text-slate-500">KO%</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={newPosition.koLevel} onChange={e=>setNewPosition({...newPosition, koLevel:e.target.value})}/></div>
          </div>
          <div>
            <div className="flex justify-between mb-2"><label className="text-sm font-bold">標的</label><button type="button" onClick={addU} className="text-xs text-blue-600">+ 新增</button></div>
            {tempUnderlyings.map(u => (
              <div key={u.id} className="flex gap-2 mb-2">
                <input className="w-1/2 border rounded px-2 py-1 text-sm uppercase" placeholder="代碼" value={u.ticker} onChange={e=>updateU(u.id, 'ticker', e.target.value)}/>
                <input className="w-1/2 border rounded px-2 py-1 text-sm" placeholder="進場價" type="number" value={u.entryPrice} onChange={e=>updateU(u.id, 'entryPrice', e.target.value)}/>
              </div>
            ))}
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">{isEdit ? '修改' : '建立'}</button>
        </form>
      </div>
    </div>
  );
};

// --- 4. Main App ---
const App = () => {
  const [viewMode, setViewMode] = useState('landing');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestData, setGuestData] = useState(null);
  const [clients, setClients] = useState(() => safeGetStorage(KEY_CLIENTS, DEFAULT_CLIENTS));
  const [activeClientId, setActiveClientId] = useState(() => (safeGetStorage(KEY_CLIENTS, DEFAULT_CLIENTS))[0]?.id || 'c1');
  const [allPositions, setAllPositions] = useState(() => safeGetStorage(KEY_POSITIONS, INITIAL_POSITIONS));
  const [marketPrices, setMarketPrices] = useState(() => safeGetStorage(KEY_PRICES, DEFAULT_MARKET_PRICES));
  const [lastUpdated, setLastUpdated] = useState(() => localStorage.getItem(KEY_UPDATE_DATE) || "尚無紀錄");
  const [googleSheetId, setGoogleSheetId] = useState(() => localStorage.getItem(KEY_SHEET_ID) || "");
  const [portfolioSheetUrl, setPortfolioSheetUrl] = useState(() => localStorage.getItem(KEY_PORTFOLIO_URL) || "");
  const [savedPassword, setSavedPassword] = useState(() => localStorage.getItem(KEY_PASSWORD) || "");
  const [isUnlocked, setIsUnlocked] = useState(() => !localStorage.getItem(KEY_PASSWORD));
  const [currentShareData, setCurrentShareData] = useState({ url: '', name: '' });
  const [pendingAction, setPendingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDataSyncModalOpen, setIsDataSyncModalOpen] = useState(false);
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [isShareLinkModalOpen, setIsShareLinkModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formPosition, setFormPosition] = useState(DEFAULT_FORM_STATE);
  const [formUnderlyings, setFormUnderlyings] = useState([{ id: Date.now(), ticker: "", entryPrice: 0 }]);

  const fetchWithFallback = async (u) => {
    const dec = new TextDecoder('utf-8'); const ep = encodeURIComponent(`${u}${u.includes('?')?'&':'?'}t=${Date.now()}`);
    try { const r = await fetch(`https://api.allorigins.win/raw?url=${ep}`); const b = await r.arrayBuffer(); return dec.decode(b); } catch (e) { throw new Error("下載失敗"); }
  };

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]; let hasU = false;
    const nextP = allPositions.map(p => {
      let pU = false; const nextU = p.underlyings.map(u => {
        const curr = marketPrices[u.ticker] || u.entryPrice;
        if (!u.memoryKO && curr >= u.entryPrice * (p.koLevel/100) && p.koObservationStartDate && today >= p.koObservationStartDate) { pU = true; hasU = true; return { ...u, memoryKO: true }; }
        return u;
      });
      return pU ? { ...p, underlyings: nextU } : p;
    });
    if (hasU) setAllPositions(nextP);
  }, [marketPrices, allPositions]);

  useEffect(() => { const h = window.location.hash; if (h.startsWith('#share=')) { try { const d = unminifyData(JSON.parse(base64UrlDecode(h.replace('#share=', '')))); setGuestData(d); setIsGuestMode(true); setMarketPrices(d.prices); setLastUpdated(d.lastUpdated); setViewMode('dashboard'); window.history.replaceState(null, '', window.location.pathname); } catch (e) {} } }, []);
  useEffect(() => { if(!isGuestMode) { localStorage.setItem(KEY_CLIENTS, JSON.stringify(clients)); localStorage.setItem(KEY_POSITIONS, JSON.stringify(allPositions)); localStorage.setItem(KEY_PRICES, JSON.stringify(marketPrices)); localStorage.setItem(KEY_SHEET_ID, googleSheetId); localStorage.setItem(KEY_PORTFOLIO_URL, portfolioSheetUrl); if(savedPassword) localStorage.setItem(KEY_PASSWORD, savedPassword); else localStorage.removeItem(KEY_PASSWORD); } }, [clients, allPositions, marketPrices, googleSheetId, portfolioSheetUrl, savedPassword]);

  const checkAuth = (a) => { if (isUnlocked) a(); else { setPendingAction(()=>a); setIsPasswordPromptOpen(true); } };
  const calculateRisk = (pos) => {
    let laggard = null; let minP = 999; const allKO = pos.underlyings.every(u => u.memoryKO);
    const details = pos.underlyings.map(u => {
      const curr = marketPrices[u.ticker] || u.entryPrice; const perf = (curr/u.entryPrice)*100;
      const d = { ...u, currentPrice: curr, performance: perf, kiPrice: u.entryPrice*(pos.kiLevel/100), koPrice: u.entryPrice*(pos.koLevel/100), strikePrice: u.entryPrice*(pos.strikeLevel/100) };
      if (perf < minP) { minP = perf; laggard = d; } return d;
    });
    let s = "觀察中", col = "bg-blue-100 text-blue-800";
    if (allKO) { s = "達成 KO"; col = "bg-red-600 text-white font-bold animate-pulse"; }
    else if (minP <= pos.kiLevel) { s = "已觸及 KI"; col = "bg-green-100 text-green-800 font-bold"; }
    return { ...pos, underlyingDetails: details, laggard, riskStatus: s, statusColor: col, isProductKO: allKO, monthlyCoupon: Math.round((pos.nominal * (pos.couponRate/100))/12) };
  };

  const processed = useMemo(() => (isGuestMode ? (guestData?.positions || []) : allPositions.filter(p => p.clientId === activeClientId)).map(calculateRisk), [allPositions, activeClientId, isGuestMode, guestData, marketPrices]);
  
  const handleSyncLivePrices = async () => {
    setIsLoading(true); const next = { ...marketPrices }; let count = 0; const tks = new Set();
    (isGuestMode ? (guestData?.positions || []) : allPositions).forEach(p => p.underlyings.forEach(u => tks.add(u.ticker)));
    for (const t of Array.from(tks)) { try { const r = await fetch(`/api/quote?ticker=${t.replace(".T","")}`); const d = await r.json(); if (d.price) { next[t] = d.price; count++; } } catch (e) {} }
    if (count > 0) { setMarketPrices(next); setLastUpdated(new Date().toLocaleString() + " (即時 API)"); alert(`更新成功 ${count} 檔`); }
    setIsLoading(false);
  };

  if (viewMode === 'landing') return <LandingPage onAdminLogin={(p) => { if (!savedPassword || p === savedPassword) { setIsUnlocked(true); setIsGuestMode(false); setViewMode('dashboard'); } else alert("錯誤"); }} hasPassword={!!savedPassword}/>;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="bg-white shadow-sm border-b sticky top-0 z-40 px-4 py-3 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><Activity className="text-blue-600"/><h1 className="font-bold hidden sm:block text-lg">FCN 管理</h1></div>
          {!isGuestMode && <select value={activeClientId} onChange={e=>setActiveClientId(e.target.value)} className="bg-slate-100 border-none text-sm font-bold rounded-lg px-2 py-1">{clients.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}</select>}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => setIsExportModalOpen(true)} className="bg-slate-100 p-2 rounded-lg text-slate-700 border whitespace-nowrap text-sm flex items-center gap-1"><FileText size={16}/>匯出</button>
          
          {/* 更新即時報價按鈕 */}
          <button onClick={handleSyncLivePrices} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-md whitespace-nowrap">
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""}/>
            <span>更新即時報價</span>
          </button>

          {!isGuestMode && (
            <>
              <button onClick={()=>checkAuth(()=>setIsDataSyncModalOpen(true))} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 whitespace-nowrap shadow-md"><ArrowRightLeft size={16}/>同步</button>
              <button onClick={()=>{checkAuth(()=>{setEditId(null); setFormPosition(DEFAULT_FORM_STATE); setFormUnderlyings([{id:Date.now(),ticker:"",entryPrice:0}]); setIsAddModalOpen(true);})}} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-md"><Plus size={16}/>新增</button>
            </>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center text-sm font-bold text-slate-600">
            <span>客戶：{isGuestMode ? guestData.clientName : clients.find(c=>c.id===activeClientId)?.name}</span>
            <span className="text-slate-400">更新：{lastUpdated}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b">
                <tr><th className="p-4">產品資訊</th><th className="p-4 text-center">本金 / 月息</th><th className="p-4">標的情況</th><th className="p-4 text-right">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processed.map(p => (
                  <tr key={p.id} className={`${p.isProductKO ? "bg-red-50" : "hover:bg-slate-50"}`}>
                    <td className="p-4"><div className="font-black text-slate-800">{p.productName}</div><div className="text-[10px] text-slate-400 mt-1">{p.maturityDate} 到期</div></td>
                    <td className="p-4 text-center">
                      <div className="inline-block border rounded-lg p-2 bg-white shadow-sm">
                        <div className="text-xs font-bold text-slate-500 border-b pb-1 mb-1">{formatToWan(p.nominal)}萬</div>
                        <div className="text-red-700 font-black">{p.monthlyCoupon.toLocaleString()}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-slate-400 border-b pb-1 font-bold"><span>標的</span><span>現價 / KI</span></div>
                        {p.underlyingDetails.map(u => (
                          <div key={u.ticker} className={`flex justify-between text-xs p-1 rounded ${u.memoryKO ? 'bg-red-100' : ''}`}>
                            <span className="font-bold">{u.ticker}</span>
                            <span className="font-mono">
                              <span className={u.currentPrice < u.entryPrice ? "text-green-600" : "text-red-600"}>{u.currentPrice.toLocaleString()}</span>
                              <span className="mx-1 text-slate-300">|</span>
                              <span className="text-slate-400">{u.kiPrice.toFixed(0)}</span>
                            </span>
                          </div>
                        ))}
                        <div className={`text-[10px] font-black p-1 rounded inline-block ${p.statusColor}`}>{p.riskStatus}</div>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      {!isGuestMode && (
                        <div className="flex flex-col items-end gap-1">
                          <button onClick={()=>{setEditId(p.id); setFormPosition({...p}); setFormUnderlyings(p.underlyings.map((u,i)=>({...u,id:Date.now()+i}))); setIsAddModalOpen(true);}} className="text-slate-400 hover:text-blue-600"><Pencil size={16}/></button>
                          <button onClick={()=>checkAuth(()=>{if(confirm("刪除？"))setAllPositions(allPositions.filter(pos=>pos.id!==p.id));})} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <DataSyncModal isOpen={isDataSyncModalOpen} onClose={()=>setIsDataSyncModalOpen(false)} marketPrices={marketPrices} setMarketPrices={setMarketPrices} setLastUpdated={setLastUpdated} googleSheetId={googleSheetId} setGoogleSheetId={setGoogleSheetId} onSyncPortfolio={(c,p)=>{setClients(c); setAllPositions(p); if(c.length) setActiveClientId(c[0].id);}} portfolioSheetUrl={portfolioSheetUrl} setPortfolioSheetUrl={setPortfolioSheetUrl} fetchWithFallback={fetchWithFallback} />
      <AddPositionModal isOpen={isAddModalOpen} onClose={()=>setIsAddModalOpen(false)} onAdd={(e)=>{e.preventDefault(); const vU=formUnderlyings.filter(u=>u.ticker.trim()).map(u=>({...u,ticker:u.ticker.toUpperCase(),entryPrice:parseFloat(u.entryPrice)})); const d={...formPosition, nominal:parseFloat(formPosition.nominal), couponRate:parseFloat(formPosition.couponRate), koLevel:parseFloat(formPosition.koLevel), kiLevel:parseFloat(formPosition.kiLevel), strikeLevel:parseFloat(formPosition.strikeLevel), underlyings:vU, clientId:activeClientId}; if(editId)setAllPositions(allPositions.map(p=>p.id===editId?{...d,id:editId}:p)); else setAllPositions([...allPositions,{...d,id:Date.now()}]); setIsAddModalOpen(false);}} newPosition={formPosition} setNewPosition={setFormPosition} tempUnderlyings={formUnderlyings} setTempUnderlyings={setFormUnderlyings} isEdit={!!editId} />
      <ClientManagerModal isOpen={isClientManagerOpen} onClose={()=>setIsClientManagerOpen(false)} clients={clients} onAdd={n=>{const id=`c${Date.now()}`; setClients([...clients,{id,name:n}]); setActiveClientId(id);}} onDelete={id=>{if(clients.length>1 && confirm("確定？")){setClients(clients.filter(c=>c.id!==id)); setAllPositions(allPositions.filter(p=>p.clientId!==id)); if(activeClientId===id)setActiveClientId(clients[0].id);}}} activeId={activeClientId} onGenerateShareLink={async (id)=>{const c=clients.find(cl=>cl.id===id); const p=allPositions.filter(pos=>pos.clientId===id); const rP={}; p.forEach(pos=>pos.underlyings.forEach(u=>{if(marketPrices[u.ticker])rP[u.ticker]=marketPrices[u.ticker];})); const l=`${window.location.href.split(/[?#]/)[0]}#share=${base64UrlEncode(JSON.stringify(minifyData({clientName:c.name,positions:p,prices:rP,lastUpdated,sheetId:googleSheetId}))) }`; setCurrentShareData({url:l,name:c.name}); setIsShareLinkModalOpen(true);}} />
      <ExportModal isOpen={isExportModalOpen} onClose={()=>setIsExportModalOpen(false)} allPositions={allPositions} clients={clients} marketPrices={marketPrices} calculateRisk={calculateRisk} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={()=>setIsSettingsModalOpen(false)} savedPassword={savedPassword} setSavedPassword={setSavedPassword} setIsUnlocked={setIsUnlocked} />
      <PasswordPromptModal isOpen={isPasswordPromptOpen} onConfirm={p=>{if(p===savedPassword){setIsUnlocked(true);setIsPasswordPromptOpen(false);if(pendingAction){pendingAction();setPendingAction(null);}}else alert("密碼錯誤");}} onCancel={()=>setIsPasswordPromptOpen(false)} />
      <ShareLinkModal isOpen={isShareLinkModalOpen} onClose={()=>setIsShareLinkModalOpen(false)} link={currentShareData.url} clientName={currentShareData.name} />
    </div>
  );
};

export default App;