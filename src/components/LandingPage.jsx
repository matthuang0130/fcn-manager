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
        // 🌟 最外層背景加上 dark:bg-slate-900，讓登入頁面也支援深色
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-4 transition-colors duration-300">
            {/* 🌟 卡片本身加上 dark:bg-slate-800 等深色屬性 */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 border border-transparent dark:border-slate-700 transition-colors duration-300">
                <div className="text-center mb-8">
                    <div className="bg-blue-600 dark:bg-blue-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 dark:shadow-blue-900/50">
                        <Activity size={32} className="text-white"/>
                    </div>
                    {/* 🌟 標題文字提亮 */}
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">FCN 投資組合管理</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">專業結構型商品監控系統</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wide">
                            {hasPassword ? "管理員解鎖" : "初次使用：請設定專屬密碼"}
                        </label>
                        <input 
                            type="password" 
                            className="w-full p-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" 
                            placeholder={hasPassword ? "請輸入密碼" : "請設定一個新密碼"} 
                            value={password} 
                            onChange={e=>setPassword(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="w-full bg-slate-800 dark:bg-blue-600 hover:bg-slate-900 dark:hover:bg-blue-700 text-white py-3.5 rounded-lg font-bold shadow-md transition transform active:scale-95">
                        {hasPassword ? "登入系統" : "設定並進入系統"}
                    </button>
                </form>
                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700 text-center">
                    <p className="text-sm text-slate-400 dark:text-slate-500">系統採強制加密連線，無密碼者無法查看資料。</p>
                </div>
            </div>
        </div>
    );
};