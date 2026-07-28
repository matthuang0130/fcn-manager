import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Download } from 'lucide-react';
import { copyToClipboard } from '../../utils/helpers';

export const ExportModal = ({ isOpen, onClose, allPositions, clients, marketPrices, calculateRisk }) => {
  const [csvContent, setCsvContent] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const textAreaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const headers = ["投資人", "產品名稱", "發行商", "幣別", "名目本金", "年息(%)", "到期日", "KO觀察日", "觀察頻率", "KI(%)", "KO(%)", "遞減率(%)", "履約(%)", "連結標的 (代碼 進場價)", "最差標的", "現價", "進場價", "表現(%)", "狀態"];
      const rows = (allPositions || []).map(pos => {
        const calculated = calculateRisk(pos);
        const clientName = clients.find(c => c.id === pos.clientId)?.name || "未知";
        
        const allUnderlyingsClean = pos.underlyings.map(u => 
            `${u.ticker} ${u.entryPrice}`
        ).join(' / ');

        return [
          clientName, 
          pos.productName, 
          pos.issuer, 
          pos.currency, 
          pos.nominal, 
          pos.couponRate, 
          pos.maturityDate, 
          pos.koObservationStartDate || "", 
          pos.koType === 'Monthly' ? "每月" : "天天",
          pos.kiLevel, 
          pos.koLevel, 
          pos.koType === 'Monthly' ? (pos.stepDownRate || 0) : 0,
          pos.strikeLevel,
          allUnderlyingsClean, 
          calculated.laggard?.ticker || "", 
          calculated.laggard?.currentPrice || 0, 
          calculated.laggard?.entryPrice || 0, 
          calculated.laggard?.performance?.toFixed(2) || "0.00", 
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
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
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
          <p className="text-sm text-slate-500">如果下載失敗，請點擊「複製」並貼到 Excel。</p>
          <textarea ref={textAreaRef} readOnly className="w-full h-32 border p-2 text-sm font-mono rounded bg-slate-50" value={csvContent} />
          <div className="flex gap-3"><button onClick={handleCopy} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Copy size={16}/> {copyStatus || "複製內容"}</button><button onClick={handleDownload} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Download size={16}/> 下載 CSV</button></div>
        </div>
      </div>
    </div>
  );
};