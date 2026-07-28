// src/components/modals/PasswordPromptModal.jsx
import React, { useState } from 'react';

// 我們順便把 PasswordInput 匯出，這樣設定視窗也可以共用它
export const PasswordInput = ({ onConfirm, onCancel, btnText }) => {
    const [val, setVal] = useState("");
    return (
        <form onSubmit={(e) => { e.preventDefault(); if(val) onConfirm(val); }} className="space-y-3">
            <input type="password" autoFocus className="w-full border rounded px-3 py-2 text-sm" placeholder="密碼" value={val} onChange={e=>setVal(e.target.value)} />
            <div className="flex gap-2">
                {onCancel && <button type="button" onClick={onCancel} className="flex-1 bg-slate-100 py-2 rounded text-sm">取消</button>}
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded font-bold text-sm">{btnText}</button>
            </div>
        </form>
    );
};

export const PasswordPromptModal = ({ isOpen, onConfirm, onCancel }) => {
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