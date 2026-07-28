// src/components/LandingPage.jsx
import React, { useState } from 'react';
import { Activity } from 'lucide-react';

export const LandingPage = ({ onAdminLogin, hasPassword, onSetPassword }) => {
    const [password, setPassword] = useState("");
    
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!hasPassword) {
            if (!password.trim()) return alert("請輸入您想設定的新密碼");
            onSetPassword(password.trim());
            onAdminLogin(password.trim(), true); 
        } else {
            onAdminLogin(password);
        }
    };

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
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                            {hasPassword ? "管理員解鎖" : "初次使用：請設定專屬密碼"}
                        </label>
                        <input 
                            type="password" 
                            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" 
                            placeholder={hasPassword ? "請輸入密碼" : "請設定一個新密碼"} 
                            value={password} 
                            onChange={e=>setPassword(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-lg font-bold shadow-md transition transform active:scale-95">
                        {hasPassword ? "登入系統" : "設定並進入系統"}
                    </button>
                </form>
                <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                    <p className="text-sm text-slate-400">系統採強制加密連線，無密碼者無法查看資料。</p>
                </div>
            </div>
        </div>
    );
};