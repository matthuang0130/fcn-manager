import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, TrendingUp, AlertTriangle, DollarSign, Activity, ChevronDown, RefreshCw, X, Clock, Edit3, Eye, Coins, User, Briefcase, Check, FileText, Pencil, Lock, Unlock, Settings as SettingsIcon, Share2, ArrowRightLeft, Loader, Moon, Sun } from 'lucide-react';

import { DEFAULT_CLIENTS, INITIAL_POSITIONS, DEFAULT_MARKET_PRICES, DEFAULT_FORM_STATE } from './utils/constants';
import { normalizeTicker, formatToWan } from './utils/helpers';

import { LandingPage } from './components/LandingPage';
import { AddPositionModal } from './components/modals/AddPositionModal';
import { DataSyncModal } from './components/modals/DataSyncModal';
import { ExportModal } from './components/modals/ExportModal';
import { ShareLinkModal } from './components/modals/ShareLinkModal';
import { ClientManagerModal } from './components/modals/ClientManagerModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { PasswordPromptModal } from './components/modals/PasswordPromptModal';

const App = () => {
  const [viewMode, setViewMode] = useState('landing');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestData, setGuestData] = useState(null);
  
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [isInitializing, setIsInitializing] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [clients, setClients] = useState(DEFAULT_CLIENTS);
  const [activeClientId, setActiveClientId] = useState('c1');
  const [allPositions, setAllPositions] = useState(INITIAL_POSITIONS);
  const [marketPrices, setMarketPrices] = useState(DEFAULT_MARKET_PRICES);
  const [lastUpdated, setLastUpdated] = useState("尚無紀錄");
  const [googleSheetId, setGoogleSheetId] = useState("");
  const [portfolioSheetUrl, setPortfolioSheetUrl] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(true); 
  const [lockedTickers, setLockedTickers] = useState([]);

  const [currentShareData, setCurrentShareData] = useState({ url: '', name: '' }); 
  const [pendingAction, setPendingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDataSyncModalOpen, setIsDataSyncModalOpen] = useState(false); 
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [isShareLinkModalOpen, setIsShareLinkModalOpen] = useState(false); 

  const [editId, setEditId] = useState(null);
  const [formPosition, setFormPosition] = useState({ ...DEFAULT_FORM_STATE, customSchedule: [] });
  const [formUnderlyings, setFormUnderlyings] = useState([{ id: Date.now(), ticker: "", entryPrice: 0 }]);

  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedMode);
    if (savedMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
        const newMode = !prev;
        localStorage.setItem('darkMode', newMode);
        if (newMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return newMode;
    });
  };

  const getPriceForTicker = (ticker) => {
    const cleanTarget = normalizeTicker(ticker);
    if (marketPrices[ticker] !== undefined) return marketPrices[ticker];
    const foundKey = Object.keys(marketPrices).find(k => normalizeTicker(k) === cleanTarget);
    if (foundKey) return marketPrices[foundKey];
    return undefined;
  };

  const getDynamicKoLevel = (pos, targetDateStr) => {
      if (pos.manualNextObsDate && pos.manualKoLevel) return pos.manualKoLevel;

      if (pos.koType === 'Custom') {
          if (!pos.customSchedule || pos.customSchedule.length === 0) return pos.koLevel;
          const upcoming = pos.customSchedule.find(s => s.date >= targetDateStr);
          if (upcoming) return upcoming.koLevel;
          return pos.customSchedule[pos.customSchedule.length - 1].koLevel;
      }

      if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
      if (targetDateStr <= pos.koObservationStartDate) return pos.koLevel;

      const [sYear, sMonth, sDay] = pos.koObservationStartDate.split('-').map(Number);
      let stepDowns = 0;

      for (let i = 0; i < 120; i++) { 
          let candidate = new Date(sYear, sMonth - 1 + i, sDay);
          if (candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 2);
          else if (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);
          
          const candidateStr = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
          if (targetDateStr <= candidateStr) { stepDowns = i; break; }
      }
      return pos.koLevel - (stepDowns * (pos.stepDownRate || 0));
  };

  const getNextObsDateStr = (pos, targetDateStr) => {
      if (pos.manualNextObsDate) return pos.manualNextObsDate;
      
      if (pos.koType === 'Custom') {
          if (!pos.customSchedule || pos.customSchedule.length === 0) return "未設定";
          const upcoming = pos.customSchedule.find(s => s.date >= targetDateStr);
          return upcoming ? upcoming.date : "已結束";
      }

      if (pos.koType !== 'Monthly') return targetDateStr >= pos.koObservationStartDate ? targetDateStr : pos.koObservationStartDate;
      if (!pos.koObservationStartDate) return "未設定";

      const [sYear, sMonth, sDay] = pos.koObservationStartDate.split('-').map(Number);
      const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);

      let candidate = new Date(tYear, tMonth - 1, sDay);
      if (candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 2);
      else if (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);

      const toYYYYMMDD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      let candidateStr = toYYYYMMDD(candidate);

      if (candidateStr < targetDateStr) {
          let nextMonth = new Date(tYear, tMonth, sDay);
          if (nextMonth.getDay() === 6) nextMonth.setDate(nextMonth.getDate() + 2);
          else if (nextMonth.getDay() === 0) nextMonth.setDate(nextMonth.getDate() + 1);
          return toYYYYMMDD(nextMonth);
      }
      return candidateStr;
  };

  useEffect(() => {
    const loadCloudData = async () => {
      try {
        const res = await fetch(`/api/storage?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && Object.keys(data).length > 0) {
            if (data.clients && data.clients.length > 0) {
                setClients(data.clients);
                setActiveClientId(data.clients[0].id);
            }
            if (data.positions) setAllPositions(data.positions);
            if (data.marketPrices) setMarketPrices(data.marketPrices);
            if (data.lastUpdated) setLastUpdated(data.lastUpdated);
            if (data.googleSheetId) setGoogleSheetId(data.googleSheetId);
            if (data.portfolioSheetUrl) setPortfolioSheetUrl(data.portfolioSheetUrl);
            if (data.savedPassword !== undefined) {
                setSavedPassword(data.savedPassword);
                setIsUnlocked(!data.savedPassword);
            }
            if (data.lockedTickers) setLockedTickers(data.lockedTickers);
          }
        }
      } catch (err) {
        console.error("Cloud load failed", err);
      } finally {
        setIsInitializing(false);
        setIsDataLoaded(true);
      }
    };

    const hash = window.location.hash;
    if (hash && hash.startsWith('#c=')) {
        const clientId = hash.replace('#c=', '');
        const fetchClientDynamicData = async () => {
            try {
                const res = await fetch(`/api/client-view?cid=${clientId}&t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error('無法讀取');
                const decoded = await res.json();
                setGuestData(decoded); 
                setIsGuestMode(true);
                if (decoded.sheetId) setGoogleSheetId(decoded.sheetId); 
                if (decoded.prices) setMarketPrices(decoded.prices);
                if (decoded.lastUpdated) setLastUpdated(decoded.lastUpdated);
                setViewMode('dashboard');
                window.history.replaceState(null, '', window.location.pathname);
            } catch (e) {
                alert("此專屬連結已失效。");
            } finally { setIsInitializing(false); setIsDataLoaded(false); }
        };
        fetchClientDynamicData();
        return;
    }
    else if (hash && hash.startsWith('#s=')) {
        const shareId = hash.replace('#s=', '');
        const fetchShareData = async () => {
            try {
                const res = await fetch(`/api/share?id=${shareId}`);
                if (!res.ok) throw new Error('無法讀取');
                const decoded = await res.json();
                setGuestData(decoded); 
                setIsGuestMode(true);
                if (decoded.sheetId) setGoogleSheetId(decoded.sheetId); 
                if (decoded.prices) setMarketPrices(decoded.prices);
                if (decoded.lastUpdated) setLastUpdated(decoded.lastUpdated);
                setViewMode('dashboard');
                window.history.replaceState(null, '', window.location.pathname);
            } catch (e) {
                alert("此連結已過期。");
            } finally { setIsInitializing(false); setIsDataLoaded(false); }
        };
        fetchShareData();
        return;
    } else {
        loadCloudData();
    }
  }, []);

  useEffect(() => {
    if (!isDataLoaded || isGuestMode) return;
    const saveCloudData = async () => {
      const payload = { clients, positions: allPositions, marketPrices, lastUpdated, googleSheetId, portfolioSheetUrl, savedPassword, lockedTickers };
      try {
        await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } catch (e) { console.error('Save failed', e); }
    };
    const timeoutId = setTimeout(saveCloudData, 500);
    return () => clearTimeout(timeoutId);
  }, [clients, allPositions, marketPrices, lastUpdated, googleSheetId, portfolioSheetUrl, savedPassword, isDataLoaded, isGuestMode, lockedTickers]);

  const fetchWithFallback = async (targetUrl) => {
      const decoder = new TextDecoder('utf-8');
      const fetchAndDecode = async (url) => {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const buffer = await res.arrayBuffer();
          return decoder.decode(buffer);
      };
      const separator = targetUrl.includes('?') ? '&' : '?';
      const timedUrl = `${targetUrl}${separator}_t=${Date.now()}`;
      const encodedUrl = encodeURIComponent(timedUrl);

      try { return await fetchAndDecode(`https://api.allorigins.win/raw?url=${encodedUrl}`); } catch (e) {}
      try { return await fetchAndDecode(`https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`); } catch (e) {}
      try { return await fetchAndDecode(`https://corsproxy.io/?${encodedUrl}`); } catch (e) {}
      try { return await fetchAndDecode(timedUrl); } catch (e) { 
          throw new Error("無法下載資料，請檢查連結是否公開"); 
      }
  };

  // 🌟 核心修正：加入舊日期自動補零與過期強制重置邏輯
  useEffect(() => {
      const todayObj = new Date();
      const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
      let hasUpdates = false;
      
      const updatedPositions = allPositions.map(pos => {
          let posUpdated = false;
          let finalPos = { ...pos };

          // 防呆：自動幫使用者過去輸入缺少 0 的日期補零 (例如 2026-08-7 轉為 2026-08-07)
          if (finalPos.manualNextObsDate) {
              const p = finalPos.manualNextObsDate.split('-');
              if (p.length === 3) finalPos.manualNextObsDate = `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
          }

          const currentDynamicKoLevel = getDynamicKoLevel(finalPos, todayStr);
          const nextObsStr = getNextObsDateStr(finalPos, todayStr);
          
          // 修正判斷：當天或是「卡在過去的手動日期」都應該觸發檢查
          const isObsDay = (todayStr === nextObsStr) || (finalPos.manualNextObsDate && todayStr >= finalPos.manualNextObsDate);
          const hasStarted = !finalPos.koObservationStartDate || todayStr >= finalPos.koObservationStartDate;

          const newUnderlyings = finalPos.underlyings.map(u => {
              if (u.memoryKO) return u; 
              const marketPrice = getPriceForTicker(u.ticker);
              const currentPrice = marketPrice !== undefined ? marketPrice : u.entryPrice;
              const currentKoPrice = u.entryPrice * (currentDynamicKoLevel / 100);
              
              if (isObsDay && currentPrice >= currentKoPrice && hasStarted) {
                  posUpdated = true; hasUpdates = true;
                  return { ...u, memoryKO: true }; 
              }
              return u;
          });

          finalPos.underlyings = newUnderlyings;

          // 核心修復：只要今天已經超過了手動日期，無論有沒有發生 KO，都要強制清空手動日期，讓系統回歸自動排程！
          if (finalPos.manualNextObsDate && todayStr > finalPos.manualNextObsDate) {
              finalPos.manualNextObsDate = "";
              finalPos.manualKoLevel = null;
              posUpdated = true;
              hasUpdates = true;
          }

          return posUpdated ? finalPos : pos;
      });

      if (hasUpdates) setAllPositions(updatedPositions);
  }, [marketPrices, allPositions]);

  const toggleMemoryKO = (positionId, ticker) => {
      checkAuth(() => {
          setAllPositions(prev => prev.map(p => {
              if(p.id !== positionId) return p;
              return { ...p, underlyings: p.underlyings.map(u => u.ticker === ticker ? { ...u, memoryKO: !u.memoryKO } : u) };
          }));
      });
  };

  const handleOverrideObsDate = (id, currentStr, currentLevel) => {
      checkAuth(() => {
          const dateVal = prompt("✏️ 請設定下一次觀察日 (格式: YYYY-MM-DD)\n若要恢復系統自動計算，請清空內容並按確認。", currentStr);
          if (dateVal !== null) {
              let cleanDate = dateVal.trim();
              
              // 🌟 防呆：在使用者輸入時主動幫單數月、單數日補上 '0'
              if (cleanDate) {
                  const parts = cleanDate.split('-');
                  if (parts.length === 3) cleanDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
              }

              const levelVal = cleanDate !== "" ? prompt(`✏️ 請設定 ${cleanDate} 的 KO 門檻 (%)\n(目前自動推算為 ${currentLevel}%)`, currentLevel) : "";
              setAllPositions(prev => prev.map(p => p.id === id ? { 
                  ...p, 
                  manualNextObsDate: cleanDate,
                  manualKoLevel: levelVal && levelVal.trim() !== "" ? parseFloat(levelVal) : null
              } : p));
          }
      });
  };

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

  const handleAdminLogin = (inputPwd, isNewSetup = false) => { 
      if (isNewSetup || (savedPassword && inputPwd === savedPassword)) { 
          setIsUnlocked(true); setIsGuestMode(false); setViewMode('dashboard'); return true; 
      } else { alert("登入失敗，密碼錯誤"); return false; } 
  };
  
  const checkAuth = (action) => { if (isUnlocked) action(); else { setPendingAction(() => action); setIsPasswordPromptOpen(true); } };
  const handleUnlock = (inputPwd) => { if (inputPwd === savedPassword) { setIsUnlocked(true); setIsPasswordPromptOpen(false); if (pendingAction) { pendingAction(); setPendingAction(null); } } else { alert("密碼錯誤"); } };
  const handleManualLock = () => { if(savedPassword) { setIsUnlocked(false); setViewMode('landing'); } };

  const calculateRisk = (pos) => {
    let laggard = null; let minPerf = 99999;
    const allTouchedKO = pos.underlyings.every(u => u.memoryKO);
    
    const todayRenderObj = new Date();
    const todayRenderStr = `${todayRenderObj.getFullYear()}-${String(todayRenderObj.getMonth() + 1).padStart(2, '0')}-${String(todayRenderObj.getDate()).padStart(2, '0')}`;
    const currentDynamicKoLevel = getDynamicKoLevel(pos, todayRenderStr);

    const underlyingDetails = (pos.underlyings || []).map(u => {
      const marketPrice = getPriceForTicker(u.ticker);
      const currentPrice = marketPrice !== undefined ? marketPrice : u.entryPrice;
      const performance = (currentPrice / u.entryPrice) * 100;
      
      const detail = { 
          ...u, currentPrice, performance, 
          kiPrice: u.entryPrice * (pos.kiLevel/100), koPrice: u.entryPrice * (currentDynamicKoLevel/100), strikePrice: u.entryPrice * (pos.strikeLevel/100) 
      };
      if (performance < minPerf) { minPerf = performance; laggard = detail; }
      return detail;
    });
    const monthlyCoupon = Math.round((pos.nominal * (pos.couponRate / 100)) / 12);
    
    let riskStatus = "觀察中", statusColor = "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800/50"; 
    
    if (allTouchedKO) { riskStatus = "達成 KO"; statusColor = "bg-red-600 dark:bg-red-600 text-white font-bold border border-red-700 shadow-sm animate-pulse"; } 
    else if (minPerf <= pos.kiLevel) { riskStatus = "已觸及 KI"; statusColor = "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 font-bold border border-green-300 dark:border-green-800/50"; } 
    else if (minPerf <= pos.kiLevel + 5) { riskStatus = "瀕臨 KI"; statusColor = "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 font-bold border border-orange-300 dark:border-orange-800/50"; } 
    
    return { ...pos, underlyingDetails, laggard, riskStatus, statusColor, monthlyCoupon, isProductKO: allTouchedKO, currentDynamicKoLevel };
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

  const handleSyncLivePrices = async () => {
    setIsLoading(true);
    const updatedPrices = { ...marketPrices };
    let successCount = 0; let skipCount = 0;

    for (const ticker of activeTickers) {
        if (lockedTickers && lockedTickers.includes(ticker)) { skipCount++; continue; }
        try {
            const cleanTicker = ticker.toString().replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
            const response = await fetch(`/api/quote?ticker=${cleanTicker}`);
            const data = await response.json();
            if (data.price) { updatedPrices[ticker] = data.price; successCount++; }
        } catch (error) {}
    }
    setMarketPrices(updatedPrices);
    setLastUpdated(new Date().toLocaleString() + " (部分標的手動鎖定中)");
    alert(`✅ 報價更新完成！\n• 成功更新: ${successCount} 檔\n• 智慧鎖定維持不變: ${skipCount} 檔`);
    setIsLoading(false);
  };

  const handleAllUnlockMarket = () => {
      if (confirm("確定解除所有標的的手動鎖定，全面回歸 API 自動抓取價格嗎？")) { setLockedTickers([]); alert("已全部解鎖！您可以按「更新即時報價」重新刷新全盤股價。"); }
  };

  const handleSyncPortfolio = (newClients, newPositions) => {
      setClients(newClients); setAllPositions(newPositions);
      if(newClients.length > 0 && !newClients.find(c => c.id === activeClientId)) setActiveClientId(newClients[0].id);
  };

  const handleSavePosition = (e) => {
    e.preventDefault();
    const validUnderlyings = formUnderlyings.filter(u => u.ticker.trim() !== "").map(u => ({ ticker: u.ticker.toUpperCase(), entryPrice: parseFloat(u.entryPrice), memoryKO: u.memoryKO || false }));
    if (validUnderlyings.length === 0) return;
    const updatedPrices = { ...marketPrices };
    validUnderlyings.forEach(u => { if (getPriceForTicker(u.ticker) === undefined) updatedPrices[u.ticker] = u.entryPrice; });
    setMarketPrices(updatedPrices);
    const tickersStr = validUnderlyings.map(u => u.ticker).join('/');
    
    const validCustomSchedule = (formPosition.customSchedule || [])
      .filter(s => s.date && s.koLevel !== "")
      .map(s => ({ id: s.id || Date.now(), date: s.date, koLevel: parseFloat(s.koLevel) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const entryData = {
      clientId: activeClientId, productName: formPosition.productName || `FCN ${tickersStr}`, issuer: formPosition.issuer || "Self", 
      nominal: parseFloat(formPosition.nominal), currency: formPosition.currency, couponRate: parseFloat(formPosition.couponRate), 
      strikeDate: formPosition.strikeDate, koObservationStartDate: formPosition.koObservationStartDate, maturityDate: formPosition.maturityDate, tenor: formPosition.tenor, 
      koLevel: parseFloat(formPosition.koLevel), kiLevel: parseFloat(formPosition.kiLevel), strikeLevel: parseFloat(formPosition.strikeLevel), koType: formPosition.koType || "Daily", stepDownRate: parseFloat(formPosition.stepDownRate || 0), 
      underlyings: validUnderlyings, status: "Active", customSchedule: validCustomSchedule
    };
    if (editId) setAllPositions(prev => prev.map(p => p.id === editId ? { ...entryData, id: editId } : p));
    else setAllPositions(prev => [...prev, { ...entryData, id: Date.now() }]);
    setIsAddModalOpen(false);
  };

  const deletePosition = (id) => { checkAuth(() => { if(confirm("確定刪除此部位？")) setAllPositions(allPositions.filter(p => p.id !== id)); }); };
  const handleAddClient = (name) => { checkAuth(() => { if (name) { const newId = `c${Date.now()}`; setClients(prev => [...prev, { id: newId, name }]); setActiveClientId(newId); } }); };
  const handleDeleteClient = (id) => { checkAuth(() => { if (clients.length <= 1) return alert("至少需保留一位"); if (confirm("確定刪除？")) { setClients(prev => prev.filter(c => c.id !== id)); setAllPositions(prev => prev.filter(p => p.clientId !== id)); if (activeClientId === id) setActiveClientId(clients[0].id); } }); };

  const handleGenerateShareLink = async (clientId) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      const baseUrl = window.location.href.split(/[?#]/)[0];
      const liveUrl = `${baseUrl}#c=${clientId}`;
      setCurrentShareData({ url: liveUrl, name: client.name });
      setIsClientManagerOpen(false); setIsShareLinkModalOpen(true);
  };

  const handleExitGuestMode = () => { if(confirm("確定要登出嗎？")) { setIsGuestMode(false); setGuestData(null); setViewMode('landing'); window.history.replaceState(null, '', window.location.pathname); } };
  
  const handleOpenAddModal = () => { checkAuth(() => { setEditId(null); setFormPosition({ ...DEFAULT_FORM_STATE, customSchedule: [] }); setFormUnderlyings([{ id: Date.now(), ticker: "", entryPrice: 0 }]); setIsAddModalOpen(true); }); };
  const handleOpenEditModal = (pos) => { checkAuth(() => { 
      setEditId(pos.id); 
      setFormPosition({ 
          productName: pos.productName || "", issuer: pos.issuer || "", nominal: pos.nominal || 0, currency: pos.currency || "USD", couponRate: pos.couponRate || 0, 
          koLevel: pos.koLevel || 100, kiLevel: pos.kiLevel || 70, strikeLevel: pos.strikeLevel || 100, strikeDate: pos.strikeDate || "", 
          koObservationStartDate: pos.koObservationStartDate || "", tenor: pos.tenor || "", maturityDate: pos.maturityDate || "", koType: pos.koType || "Daily", stepDownRate: pos.stepDownRate || 0, manualNextObsDate: pos.manualNextObsDate || "",
          customSchedule: (pos.customSchedule || []).map(s => ({ ...s, id: s.id || Date.now() + Math.random() }))
      }); 
      setFormUnderlyings((pos.underlyings || []).map((u, idx) => ({ ticker: u.ticker || "", entryPrice: u.entryPrice || 0, memoryKO: u.memoryKO || false, id: Date.now() + idx }))); 
      setIsAddModalOpen(true); 
  }); };

  if (isInitializing) {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
              <Loader className="animate-spin text-blue-600 dark:text-blue-400 mb-4" size={48} />
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">正在讀取最新雲端資產狀態...</h2>
          </div>
      );
  }

  if (viewMode === 'landing') {
      return <LandingPage onAdminLogin={handleAdminLogin} hasPassword={!!savedPassword} onSetPassword={setSavedPassword} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans pb-10 transition-colors duration-300">
      {isGuestMode && (
          <div className="bg-blue-600 dark:bg-blue-800 text-white px-4 py-2 text-sm flex justify-between items-center sticky top-0 z-50 shadow-md">
              <div className="flex items-center gap-2"><Eye size={14} /><span className="font-bold">投資人資產看板（唯讀）：{activeClient.name}</span></div>
              <button onClick={handleExitGuestMode} className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded flex items-center gap-1 transition"><X size={12}/> 登出</button>
          </div>
      )}
      <header className={`bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 transition-colors duration-300 ${!isGuestMode ? 'sticky top-0 z-40' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <div className="flex items-center gap-2"><Activity className="text-blue-600 dark:text-blue-400 h-6 w-6" /><h1 className="text-lg font-bold text-slate-800 dark:text-white hidden sm:block">FCN 管理</h1>
                {!isGuestMode && (<button onClick={() => { if(savedPassword && isUnlocked) handleManualLock(); else if(savedPassword && !isUnlocked) setIsPasswordPromptOpen(true); else setIsSettingsModalOpen(true); }} className="ml-2 p-1.5 rounded-full transition-colors hover:bg-slate-100 dark:hover:bg-slate-700">{savedPassword ? (isUnlocked ? <Unlock size={16} className="text-green-600 dark:text-green-400"/> : <Lock size={16} className="text-red-600 dark:text-red-400"/>) : (<SettingsIcon size={16} className="text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white"/>)}</button>)}
                
                <button onClick={toggleDarkMode} className="ml-1 p-1.5 rounded-full transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white">
                    {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
              {!isGuestMode && (
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/50 rounded-lg p-1 pr-3 relative group">
                    <div className="bg-white dark:bg-slate-700 p-1.5 rounded shadow-sm text-blue-600 dark:text-blue-400"><User size={16} /></div>
                    <select value={activeClientId} onChange={(e) => setActiveClientId(e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-700 dark:text-slate-100 focus:ring-0 cursor-pointer appearance-none pr-6 min-w-[120px]">
                        {clients.map(c => (<option key={c.id} value={c.id} className="dark:bg-slate-800">{c.name}</option>))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 text-slate-400 pointer-events-none"/>
                    <button onClick={() => handleGenerateShareLink(activeClientId)} className="ml-2 text-slate-400 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400" title="生成最新動態連結"><Share2 size={16} /></button>
                    <button onClick={() => setIsClientManagerOpen(true)} className="ml-1 text-slate-400 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"><Edit3 size={14} /></button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end overflow-x-auto no-scrollbar">
               {!isGuestMode && lockedTickers && lockedTickers.length > 0 && (
                   <button onClick={handleAllUnlockMarket} className="flex-none flex items-center justify-center gap-1 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-3 py-2 rounded-lg text-sm transition font-bold"><Unlock size={14}/> 全盤解鎖</button>
               )}
               <button onClick={()=>setIsExportModalOpen(true)} className="flex-none flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap"><FileText size={16} /><span>匯出</span></button>

               {!isGuestMode && (
                   <>
                    <button onClick={handleSyncLivePrices} disabled={isLoading} className={`flex-none flex items-center justify-center gap-1 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-500 text-white border border-blue-600 dark:border-blue-500 px-3 py-2 rounded-lg text-sm transition shadow-sm whitespace-nowrap ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <RefreshCw size={16} className={isLoading ? "animate-spin" : ""}/>
                        <span className="hidden sm:inline">更新即時報價</span>
                        <span className="sm:hidden">更新報價</span>
                    </button>
                    <button onClick={() => checkAuth(() => setIsDataSyncModalOpen(true))} className="flex-none flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white border border-purple-600 px-3 py-2 rounded-lg text-sm transition whitespace-nowrap shadow-md">
                        <ArrowRightLeft size={16} /><span>資料同步</span>
                    </button>
                    <button onClick={handleOpenAddModal} className="flex-none flex items-center justify-center gap-1 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm transition shadow-md whitespace-nowrap"><Plus size={16} /><span>新增</span></button>
                   </>
               )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-opacity"><DollarSign size={48} className="text-slate-400"/></div>
                <div className="relative z-10">
                    <div className="text-sm font-bold text-slate-500 dark:text-slate-200 uppercase tracking-wider mb-1">USD 資產總覽</div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-1"><span className="text-2xl font-black text-slate-800 dark:text-white">${(summary.usd.nominal/10000).toFixed(0)}</span><span className="text-sm font-bold text-slate-600 dark:text-slate-200">萬</span><span className="text-xs text-slate-400 dark:text-slate-300 ml-1 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">本金</span></div>
                        <div className="flex items-center gap-1 text-red-700 dark:text-red-400 font-bold"><Plus size={12} strokeWidth={4} /><span className="text-lg">${summary.usd.monthly.toLocaleString()}</span><span className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/40 px-1.5 py-0.5 rounded ml-1 border border-red-100 dark:border-red-900/50">月息</span></div>
                    </div>
                </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-opacity"><Coins size={48} className="text-slate-400"/></div>
                <div className="relative z-10">
                    <div className="text-sm font-bold text-slate-500 dark:text-slate-200 uppercase tracking-wider mb-1">JPY 資產總覽</div>
                     <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-1"><span className="text-2xl font-black text-slate-800 dark:text-white">¥{(summary.jpy.nominal/10000).toFixed(0)}</span><span className="text-sm font-bold text-slate-600 dark:text-slate-200">萬</span><span className="text-xs text-slate-400 dark:text-slate-300 ml-1 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">本金</span></div>
                        <div className="flex items-center gap-1 text-red-700 dark:text-red-400 font-bold"><Plus size={12} strokeWidth={4} /><span className="text-lg">¥{summary.jpy.monthly.toLocaleString()}</span><span className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/40 px-1.5 py-0.5 rounded ml-1 border border-red-100 dark:border-red-900/50">月息</span></div>
                    </div>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${summary.koCount > 0 ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/60' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
              <span className="text-sm font-bold text-slate-500 dark:text-slate-200 uppercase tracking-wider">KO 機會</span>
              <div className="flex items-end justify-between mt-2"><span className="text-3xl font-black text-red-600 dark:text-red-400">{summary.koCount}</span><TrendingUp size={24} className="text-red-400 dark:text-red-500 mb-1"/></div>
            </div>
            
            <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${summary.kiCount > 0 ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800/60' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
              <span className="text-sm font-bold text-slate-500 dark:text-slate-200 uppercase tracking-wider">KI 風險</span>
              <div className="flex items-end justify-between mt-2"><span className="text-3xl font-black text-green-600 dark:text-green-400">{summary.kiCount}</span><AlertTriangle size={24} className="text-green-400 dark:text-green-500 mb-1"/></div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors duration-300">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 flex justify-between items-center">
              <div className="flex items-center gap-2"><Briefcase size={16} className="text-slate-400 dark:text-slate-300"/><h2 className="font-bold text-slate-700 dark:text-slate-100 text-sm">{activeClient.name} 的部位</h2></div>
              <span className="text-xs text-slate-400 dark:text-slate-300 bg-white dark:bg-slate-700 border dark:border-slate-600 px-2 py-0.5 rounded-full">{currentClientPositions.length} 筆資料</span>
            </div>
            
            <div className="w-full p-3 md:p-0 overflow-x-auto">
              <table className="w-full text-left border-collapse block md:table">
                <thead className="hidden md:table-header-group bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr className="text-sm text-slate-600 dark:text-slate-200 font-bold">
                    <th className="px-4 py-3 w-[25%]">產品資訊</th>
                    <th className="px-4 py-3 text-center w-[15%]">本金 / 月息</th>
                    <th className="px-4 py-3 w-[50%]">連結標的情況</th>
                    <th className="px-4 py-3 text-right w-[10%]">操作</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group md:divide-y md:divide-slate-100 dark:md:divide-slate-700/50">
                  {processedPositions.map((pos) => {
                      const rowClass = pos.isProductKO ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-900/60 md:border-l-4 md:border-l-red-500" : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/40 border-slate-200 dark:border-slate-700";
                      const todayRenderObj = new Date();
                      const todayRenderStr = `${todayRenderObj.getFullYear()}-${String(todayRenderObj.getMonth() + 1).padStart(2, '0')}-${String(todayRenderObj.getDate()).padStart(2, '0')}`;
                      const nextObsStr = getNextObsDateStr(pos, todayRenderStr);

                      return (
                        <tr key={pos.id} className={`${rowClass} transition group block md:table-row w-full border md:border-0 rounded-xl md:rounded-none mb-4 md:mb-0 shadow-sm md:shadow-none overflow-hidden`}>
                          <td className="block md:table-cell px-4 py-3 md:py-2 align-middle border-b md:border-0 border-slate-100 dark:border-slate-700 w-full md:w-auto"> 
                            <div className="flex items-center gap-2 mb-2">
                               <span className={`text-xs px-2 py-0.5 rounded font-bold shrink-0 ${pos.currency === 'USD' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'}`}> {pos.currency} </span>
                               <div className="text-sm md:text-base font-black text-slate-800 dark:text-white break-words md:whitespace-normal" title={pos.productName}>{pos.productName}</div>
                               <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ml-auto shrink-0 ${pos.statusColor}`}>{pos.riskStatus}</span>
                            </div>
                            <div className="flex flex-col md:flex-row gap-1.5 md:gap-3">
                                 <div className="flex flex-wrap gap-2 items-center">
                                     <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs md:text-sm text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-medium">{pos.issuer}</span>
                                     <span className="bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded text-xs md:text-sm text-blue-700 dark:text-blue-200 font-bold border border-blue-100 dark:border-blue-800/50">年息 {pos.couponRate}%</span>
                                 </div>
                            </div>
                            <div className="flex flex-col gap-1 mt-2 text-xs text-slate-400 dark:text-slate-300">
                                <div className="flex items-center justify-between gap-1 w-full max-w-[200px]">
                                    <span className="flex items-center gap-1"><Clock size={12}/> {pos.maturityDate} 到期</span>
                                    {pos.koType !== 'Daily' && (
                                        <div onClick={() => handleOverrideObsDate(pos.id, nextObsStr, pos.currentDynamicKoLevel)} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-600 hover:text-blue-600 dark:hover:text-blue-200 transition" title="點擊手動修改下次觀察日與門檻">
                                            <span className="font-bold text-slate-700 dark:text-slate-200">下次: {nextObsStr}</span>{!isGuestMode && <Pencil size={10} className="dark:text-slate-300"/>}
                                        </div>
                                    )}
                                </div>
                            </div>
                          </td>
                          
                          <td className="block md:table-cell px-4 py-3 md:py-2 align-middle border-b md:border-0 border-slate-100 dark:border-slate-700 w-full md:w-auto bg-slate-50/50 dark:bg-transparent"> 
                            <div className="flex flex-row md:flex-col items-center justify-between md:justify-center h-full gap-2 w-full">
                                <span className="md:hidden text-sm font-bold text-slate-500 dark:text-slate-300">本金與月息</span>
                                <div className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-sm flex flex-row md:flex-col justify-between md:justify-center items-center gap-4 md:gap-2 w-full md:w-auto h-auto py-2 md:py-3 px-4 md:px-2"> 
                                    <div className="text-left md:text-center flex-1 md:w-full md:border-b border-slate-100 dark:border-slate-700 md:pb-2 flex flex-col md:block"> 
                                        <span className="text-xs text-slate-500 dark:text-slate-300 font-bold tracking-widest mb-0.5">本金</span> 
                                        <div className="text-slate-800 dark:text-white font-black text-sm md:text-base lg:text-lg leading-tight whitespace-nowrap">{formatToWan(pos.nominal)}<span className="text-xs ml-0.5 font-bold text-slate-600 dark:text-slate-300">萬</span></div>
                                    </div>
                                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 md:hidden"></div>
                                    <div className="text-right md:text-center flex-1 md:w-full md:pt-1 flex flex-col md:block">
                                        <span className="text-xs text-red-600 dark:text-red-400 font-bold tracking-widest mb-0.5">月息</span> 
                                        <div className="text-red-700 dark:text-red-400 font-black text-sm md:text-base lg:text-lg leading-tight whitespace-nowrap">{pos.currency === 'JPY' ? '¥' : '$'}{pos.monthlyCoupon.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                          </td>

                          <td className="block md:table-cell px-4 py-3 md:py-2 align-middle border-b md:border-0 border-slate-100 dark:border-slate-700 w-full md:w-auto"> 
                            <div className="flex flex-col gap-1 w-full min-w-0"> 
                              <span className="md:hidden text-sm font-bold text-slate-500 dark:text-slate-200 mb-1">連結標的情況</span>
                              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1 md:gap-2 text-xs md:text-sm text-slate-400 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 px-1 whitespace-nowrap">
                                  <span className="col-span-2 text-left">標的</span><span className="text-right hidden sm:block">現價</span><span className="text-right text-red-600 dark:text-red-400">KO ({pos.currentDynamicKoLevel}%)</span><span className="text-right text-slate-500 dark:text-slate-200">履約</span><span className="text-right text-green-600 dark:text-green-400">KI</span>
                              </div>
                              {(pos.underlyingDetails || []).map((u) => {
                                const isTickerLocked = lockedTickers && lockedTickers.includes(u.ticker);
                                return (
                                  <div key={u.ticker} className={`grid grid-cols-5 sm:grid-cols-6 gap-1 md:gap-2 items-center border-b border-slate-50 dark:border-slate-700/50 last:border-0 pb-1 px-1 transition-colors rounded ${u.memoryKO ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-800' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                                    <div className="col-span-2 flex flex-col justify-center min-w-0">
                                        <div className="flex items-center gap-1">
                                            {!isGuestMode && (<button onClick={() => toggleMemoryKO(pos.id, u.ticker)} className={`shrink-0 w-3 h-3 rounded border flex items-center justify-center transition-colors ${u.memoryKO ? 'bg-red-500 dark:bg-red-500 border-red-500 dark:border-red-500' : 'border-slate-300 dark:border-slate-500 hover:border-blue-400 dark:hover:border-blue-400'}`} title="手動標記/取消 KO">{u.memoryKO && <Check size={8} className="text-white" strokeWidth={4} />}</button>)}
                                            {isGuestMode && u.memoryKO && <div className="shrink-0 w-3 h-3 bg-red-500 dark:bg-red-500 rounded-full flex items-center justify-center" title="已觸價"><Check size={8} className="text-white"/></div>}
                                            <span className={`font-black text-sm md:text-base truncate flex items-center gap-1 ${u.memoryKO ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>{u.ticker}{isTickerLocked && !isGuestMode && <span className="text-amber-500 text-[10px]" title="此標的已強制手動鎖定報價，不受 API 自動干擾">🔒</span>}</span>
                                        </div>
                                        <span className={`sm:hidden font-mono font-black text-xs whitespace-nowrap ${u.currentPrice < u.entryPrice ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{pos.currency === 'JPY' ? '¥' : '$'}{u.currentPrice.toLocaleString()}</span>
                                        {u.name && <span className="text-xs text-slate-400 dark:text-slate-300 truncate hidden sm:block -mt-0.5">{u.name}</span>}
                                    </div>
                                    <span className={`hidden sm:block font-mono font-black text-right text-sm md:text-base whitespace-nowrap ${u.currentPrice < u.entryPrice ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{u.currentPrice.toLocaleString()}</span>
                                    <span className="font-mono font-bold text-red-700 dark:text-red-400 text-right text-sm md:text-base whitespace-nowrap">{Math.round(u.koPrice).toLocaleString()}</span>
                                    <span className="font-mono text-slate-500 dark:text-slate-300 text-right text-sm md:text-base whitespace-nowrap">{Math.round(u.strikePrice).toLocaleString()}</span>
                                    <span className="font-mono font-bold text-green-700 dark:text-green-400 text-right text-sm md:text-base whitespace-nowrap">{Math.round(u.kiPrice).toLocaleString()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          <td className="block md:table-cell px-4 py-3 md:py-2 text-right align-middle bg-slate-50 dark:bg-transparent w-full md:w-auto"> 
                            {!isGuestMode && (
                                <div className="flex md:flex-col items-center justify-end gap-2 md:h-full w-full md:w-auto">
                                    <button onClick={() => handleOpenEditModal(pos)} className="flex items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 md:p-2 border md:border-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg md:rounded-full transition text-xs font-bold flex-1 md:flex-none" title="編輯部位"><Pencil size={14} className="md:w-[18px] md:h-[18px]"/> <span className="md:hidden">編輯</span></button>
                                    <button onClick={() => deletePosition(pos.id)} className="flex items-center justify-center gap-1 text-slate-500 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 px-3 py-2 md:p-2 border md:border-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg md:rounded-full transition text-xs font-bold flex-1 md:flex-none" title="刪除部位"><Trash2 size={14} className="md:w-[18px] md:h-[18px]"/> <span className="md:hidden">刪除</span></button>
                                </div>
                            )}
                          </td>
                        </tr>
                      );
                  })}
                  {processedPositions.length === 0 && (<tr className="block md:table-row"><td colSpan="6" className="block md:table-cell px-6 py-12 text-center text-slate-400 dark:text-slate-300 w-full">目前沒有部位，請點擊右上角「新增」</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <DataSyncModal isOpen={isDataSyncModalOpen} onClose={() => setIsDataSyncModalOpen(false)} marketPrices={marketPrices} setMarketPrices={setMarketPrices} setLastUpdated={setLastUpdated} googleSheetId={googleSheetId} setGoogleSheetId={setGoogleSheetId} onSyncPortfolio={handleSyncPortfolio} portfolioSheetUrl={portfolioSheetUrl} setPortfolioSheetUrl={setPortfolioSheetUrl} fetchWithFallback={fetchWithFallback} lockedTickers={lockedTickers} setLockedTickers={setLockedTickers} />
      <AddPositionModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleSavePosition} newPosition={formPosition} setNewPosition={setFormPosition} tempUnderlyings={formUnderlyings} setTempUnderlyings={setFormUnderlyings} isEdit={!!editId} />
      <ClientManagerModal isOpen={isClientManagerOpen} onClose={() => setIsClientManagerOpen(false)} clients={clients} onAdd={handleAddClient} onDelete={handleDeleteClient} activeId={activeClientId} onGenerateShareLink={handleGenerateShareLink} isGeneratingShareLink={isGeneratingShareLink} />
      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} allPositions={allPositions} clients={clients} marketPrices={marketPrices} calculateRisk={calculateRisk} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} savedPassword={savedPassword} setSavedPassword={setSavedPassword} setIsUnlocked={setIsUnlocked} />
      <PasswordPromptModal isOpen={isPasswordPromptOpen} onConfirm={handleUnlock} onCancel={() => { setIsPasswordPromptOpen(false); setPendingAction(null); }} />
      <ShareLinkModal isOpen={isShareLinkModalOpen} onClose={() => setIsShareLinkModalOpen(false)} link={currentShareData.url} clientName={currentShareData.name} />
    </div>
  );
};

export default App;