// src/components/modals/DataSyncModal.jsx
import React, { useState } from 'react';
import { X, ArrowRightLeft, Check, RefreshCw, CloudDownload, Database } from 'lucide-react';
import { parseRawDataToRows, parsePortfolioRows } from '../../utils/helpers';

export const DataSyncModal = ({ isOpen, onClose, marketPrices, setMarketPrices, setLastUpdated, googleSheetId, setGoogleSheetId, onSyncPortfolio, portfolioSheetUrl, setPortfolioSheetUrl, fetchWithFallback, lockedTickers, setLockedTickers }) => {
  const [activeTab, setActiveTab] = useState('market'); 
  const [pasteContent, setPasteContent] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [status, setStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncData, setPendingSyncData] = useState(null);
  
  if (!isOpen) return null;

  const parseSheetId = (url) => { 
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); 
      return match ? match[1] : (url.length > 20 && !url.includes('/') ? url : null); 
  };

  const handlePasteMarket = () => {
    const lines = pasteContent.split('\n'); 
    const newPrices = { ...marketPrices }; 
    let newLocked = [...(lockedTickers || [])];
    let count = 0;
    let lockCount = 0;
    let unlockCount = 0;
    
    lines.forEach(line => { 
        const cleanLine = line.replace(/[¥$,JPY"]/gi, '').trim();
        if (!cleanLine) return;
        
        const parts = cleanLine.split(/\s+/);
        if (parts.length >= 2) {
            const t = parts[0].toUpperCase().replace("TYO:","").replace("JP:","").replace(".T",""); 
            const valStr = parts[parts.length - 1].toLowerCase();
            
            if (valStr === 'auto' || valStr === '0') {
                newLocked = newLocked.filter(k => k !== t);
                unlockCount++;
            } else {
                const p = parseFloat(valStr); 
                if (!isNaN(p) && t) { 
                    newPrices[t] = p; 
                    if (!newLocked.includes(t)) newLocked.push(t); 
                    lockCount++;
                    count++; 
                } 
            }
        } 
    });
    
    setMarketPrices(newPrices); 
    setLockedTickers(newLocked);
    setLastUpdated(new Date().toLocaleString('zh-TW') + " (手動覆蓋上鎖)"); 
    setStatus(`✅ 成功賦價並鎖定 ${lockCount} 檔標的，解除鎖定 ${unlockCount} 檔！`); 
    setTimeout(() => setStatus(''), 3500);
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
          if(text.includes("google.com/accounts")) throw new Error("權限錯誤：請確認連結為「發布到網路」的公開連結");
          
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
                <button onClick={()=>setActiveTab('market')} className={`flex-1 py-2 text-sm rounded-md transition ${activeTab==='market'?'bg-white text-blue-600 font-bold shadow-sm':'text-slate-500'}`}>1. 市場報價</button>
                <button onClick={()=>setActiveTab('portfolio')} className={`flex-1 py-2 text-sm rounded-md transition ${activeTab==='portfolio'?'bg-white text-purple-600 font-bold shadow-sm':'text-slate-500'}`}>2. 匯入投資組合</button>
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
                            <span className="text-sm text-slate-500">筆部位資料</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-200">
                            <span className="block text-2xl font-bold text-slate-800">{pendingSyncData.clients.length}</span>
                            <span className="text-sm text-slate-500">位投資人</span>
                        </div>
                    </div>
                    <div className="w-full space-y-3 mt-auto">
                        <button onClick={handleConfirmSync} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-md transition transform active:scale-95">確認覆蓋並匯入</button>
                        <button onClick={handleCancelSync} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-lg font-bold transition">取消</button>
                    </div>
                </div>
            ) : activeTab === 'market' ? (
                <div className="space-y-4">
                     <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 space-y-1">
                        <p className="font-bold">自動同步與強制鎖定規則：</p>
                        <p>1. 輸入網址可進行一鍵總同步。</p>
                        <p>2. 下方直接貼上 <code>代碼 價格</code>（例如 <code>6525 2450</code>）可手動覆蓋並<span className="text-red-600 font-bold">強制上鎖</span>，自動更新將會安全跳過此代碼。</p>
                        <p>3. 貼上 <code>代碼 auto</code>（例如 <code>6525 auto</code>）即可解鎖並重接回自動報價。</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">Google Sheet 連結 (CSV/HTML)</label>
                        <input className="w-full border p-2 text-sm rounded" placeholder="https://docs.google.com/.../pub?output=csv" value={inputUrl} onChange={e=>setInputUrl(e.target.value)}/>
                        <button onClick={handleSaveMarketId} className="w-full bg-blue-600 text-white py-2 rounded text-sm font-bold">儲存設定</button>
                        {googleSheetId && <p className="text-sm text-green-600 flex items-center gap-1"><Check size={14}/> 已連結 ID: {googleSheetId.substring(0,8)}...</p>}
                    </div>
                    <hr className="border-slate-100"/>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">直接貼上 (代碼 價格/auto)</label>
                        <textarea className="w-full h-24 border p-2 text-sm font-mono rounded" placeholder="6525 2450&#10;NVDA auto" value={pasteContent} onChange={e=>setPasteContent(e.target.value)}/>
                        <button onClick={handlePasteMarket} className="w-full bg-slate-600 text-white py-2 rounded text-sm font-bold">執行覆蓋 / 解鎖</button>
                    </div>
                    {lockedTickers && lockedTickers.length > 0 && (
                        <div className="text-xs bg-slate-50 p-2 rounded border border-slate-200">
                            <span className="font-bold text-slate-600 block mb-1">🔒 目前處於手動鎖定清單（不受自動股價干擾）：</span>
                            <div className="flex flex-wrap gap-1">{lockedTickers.map(t => <span key={t} className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-100 font-mono font-bold">{t}</span>)}</div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="bg-purple-50 p-3 rounded text-sm text-purple-800 space-y-2">
                        <p className="font-bold flex items-center gap-1"><Database size={14}/> 如何運作？</p>
                        <p>您可以在 Google Sheet 上管理所有投資部位，然後在此處貼上連結匯入。</p>
                        <p className="font-bold">支援格式：</p>
                        <ul className="list-disc list-inside opacity-80 pl-2">
                            <li>CSV 連結 (<code>output=csv</code>)</li>
                            <li>網頁發布連結 (<code>/pubhtml</code>)</li>
                        </ul>
                        <p className="opacity-80 mt-2">支援欄位：產品名稱, 本金, 年息, 到期日, KI, KO, 履約, KO觀察日, <span className="font-bold text-purple-700">觀察頻率</span>, <span className="font-bold text-purple-700">遞減率</span></p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">Google Sheet 連結 (CSV/HTML)</label>
                        <input className="w-full border p-2 text-sm rounded focus:ring-2 focus:ring-purple-500 outline-none" placeholder="https://docs.google.com/.../pubhtml" value={portfolioSheetUrl} onChange={e=>setPortfolioSheetUrl(e.target.value)} />
                    </div>
                    <button onClick={handleSyncPortfolioAction} disabled={isSyncing || !portfolioSheetUrl} className={`w-full py-3 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 ${isSyncing ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'}`}>
                        {isSyncing ? <RefreshCw size={16} className="animate-spin"/> : <CloudDownload size={16}/>}
                        {isSyncing ? '同步中...' : '開始匯入'}
                    </button>
                    <div className="text-xs text-slate-400 text-center">注意：匯入將會覆蓋此裝置上現有的所有部位資料。</div>
                </div>
            )}
        </div>
        
        {status && !pendingSyncData && <div className="mt-4 p-2 bg-slate-800 text-white text-sm rounded text-center animate-in fade-in whitespace-pre-wrap">{status}</div>}
      </div>
    </div>
  );
};