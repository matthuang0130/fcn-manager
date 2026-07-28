import React, { useState, useRef } from 'react';
import { X, Share2, Link as LinkIcon, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/helpers';

export const ShareLinkModal = ({ isOpen, onClose, link, clientName }) => {
  const [copyStatus, setCopyStatus] = useState("複製連結");
  const inputRef = useRef(null);

  const handleCopy = () => {
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
                <p className="text-sm text-slate-500 mb-3">
                    將此連結傳送給客戶，對方即可在手機上查看即時部位與損益（唯讀模式）。
                </p>

                <div className="relative mb-4">
                    <input 
                        ref={inputRef}
                        readOnly 
                        value={link} 
                        onClick={(e) => e.target.select()}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-sm text-slate-600 break-all pr-10 focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="flex gap-2">
                    <a href={link} target="_blank" rel="noreferrer" className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50">
                        <LinkIcon size={16}/> 測試開啟
                    </a>
                    <button onClick={handleCopy} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <Copy size={16}/> {copyStatus}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};