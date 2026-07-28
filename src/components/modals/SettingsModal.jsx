// src/components/modals/SettingsModal.jsx
import React from 'react';
import { X, RefreshCcw } from 'lucide-react';
import { DEFAULT_CLIENTS, INITIAL_POSITIONS, DEFAULT_MARKET_PRICES } from '../../utils/constants';
import { PasswordInput } from './PasswordPromptModal';

export const SettingsModal = ({ isOpen, onClose, savedPassword, setSavedPassword, setIsUnlocked }) => {
    if(!isOpen) return null;

    const handleFactoryReset = async () => {
        if(confirm("確定要重置所有資料嗎？\n\n這將會清空雲端資料庫的所有投資部位、報價與設定，且無法復原。\n請確認您已備份或匯出資料。")) {
            try {
                await fetch('/api/storage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clients: DEFAULT_CLIENTS,
                        positions: INITIAL_POSITIONS,
                        marketPrices: DEFAULT_MARKET_PRICES,
                        lastUpdated: "尚無紀錄",
                        googleSheetId: "",
                        portfolioSheetUrl: "",
                        savedPassword: "",
                        lockedTickers: []
                    })
                });
                window.location.reload();
            } catch (err) {
                alert("重置失敗，請檢查網路連線");
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800">安全性設定</h3><button onClick={onClose}><X size={20}/></button></div>
                
                <div className="mb-6 border-b border-slate-100 pb-4">
                    <h4 className="text-sm font-bold text-slate-500 mb-2 uppercase">管理員密碼</h4>
                    {savedPassword ? (
                        <div className="space-y-2">
                            <p className="text-sm text-slate-600">目前已設定密碼。</p>
                            <button onClick={() => { if(confirm("確定移除密碼？\n移除後下次登入系統將會要求您重新設定。")) { setSavedPassword(""); setIsUnlocked(true); }}} className="w-full bg-red-50 text-red-600 py-2 rounded font-bold text-sm border border-red-100">
                                移除密碼
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2"><p className="text-sm text-slate-500 mb-2">設定密碼後，系統將強制上鎖。</p><PasswordInput onConfirm={(pwd) => { setSavedPassword(pwd); setIsUnlocked(true); alert("密碼設定成功！"); }} btnText="設定"/></div>
                    )}
                </div>

                <div>
                    <h4 className="text-sm font-bold text-slate-500 mb-2 uppercase">系統維護</h4>
                    <button 
                        onClick={handleFactoryReset} 
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition"
                    >
                        <RefreshCcw size={16}/> 清空雲端資料並重置
                    </button>
                    <p className="text-xs text-slate-400 mt-2 text-center">如果介面出現亂碼或錯誤，請嘗試此操作</p>
                </div>
            </div>
        </div>
    );
};