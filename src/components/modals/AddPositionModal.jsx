import React from 'react';
import { X, Trash2 } from 'lucide-react';

export const AddPositionModal = ({ isOpen, onClose, onAdd, newPosition, setNewPosition, tempUnderlyings, setTempUnderlyings, isEdit }) => {
  if (!isOpen) return null;

  const addU = () => setTempUnderlyings([...tempUnderlyings, { id: Date.now(), ticker: "", entryPrice: 100 }]);
  const removeU = (id) => setTempUnderlyings(tempUnderlyings.filter(u => u.id !== id));
  const updateU = (id, f, v) => setTempUnderlyings(tempUnderlyings.map(u => u.id === id ? { ...u, [f]: v } : u));

  const addCS = () => setNewPosition({ ...newPosition, customSchedule: [...(newPosition.customSchedule || []), { id: Date.now(), date: "", koLevel: 100 }] });
  const removeCS = (id) => setNewPosition({ ...newPosition, customSchedule: (newPosition.customSchedule || []).filter(s => s.id !== id) });
  const updateCS = (id, f, v) => setNewPosition({ ...newPosition, customSchedule: (newPosition.customSchedule || []).map(s => s.id === id ? { ...s, [f]: v } : s) });

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex justify-center z-50 p-4 overflow-y-auto items-start pt-10 sm:items-center sm:pt-0 transition-colors duration-300">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full p-5 mb-10 animate-in fade-in zoom-in duration-200 border border-transparent dark:border-slate-700">
        <div className="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{isEdit ? '修改部位' : '新增部位'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><X size={20}/></button>
        </div>
        <form onSubmit={onAdd} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="sm:col-span-2 md:col-span-4">
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-300 mb-1">產品名稱</label>
              <input type="text" required className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newPosition.productName} onChange={e => setNewPosition({...newPosition, productName: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-300 mb-1">發行商</label>
              <input type="text" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newPosition.issuer} onChange={e => setNewPosition({...newPosition, issuer: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-300 mb-1">幣別</label>
              <select className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newPosition.currency} onChange={e => setNewPosition({...newPosition, currency: e.target.value})}>
                <option value="USD">USD (美元)</option>
                <option value="JPY">JPY (日圓)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-300 mb-1">本金</label>
              <input type="number" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newPosition.nominal} onChange={e => setNewPosition({...newPosition, nominal: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-300 mb-1">年息(%)</label>
              <input type="number" step="0.01" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newPosition.couponRate} onChange={e => setNewPosition({...newPosition, couponRate: e.target.value})} />
            </div>
          </div>
          
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
             <div><label className="text-sm font-bold text-slate-500 dark:text-slate-300">KI%</label><input type="number" step="0.1" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded px-2 py-1 text-sm font-bold text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.kiLevel} onChange={e=>setNewPosition({...newPosition, kiLevel:e.target.value})}/></div>
             <div><label className="text-sm font-bold text-slate-500 dark:text-slate-300">Strike%</label><input type="number" step="0.1" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded px-2 py-1 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.strikeLevel} onChange={e=>setNewPosition({...newPosition, strikeLevel:e.target.value})}/></div>
             <div><label className="text-sm font-bold text-slate-500 dark:text-slate-300">首期 KO%</label><input type="number" step="0.1" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded px-2 py-1 text-sm font-bold text-green-600 dark:text-green-400 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.koLevel} onChange={e=>setNewPosition({...newPosition, koLevel:e.target.value})}/></div>
             
             <div className="flex gap-2">
                 <div className="flex-1">
                     <label className="text-sm font-bold text-slate-500 dark:text-slate-300">觀察頻率</label>
                     <select className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded px-2 py-1 text-sm font-bold text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.koType || "Daily"} onChange={e=>setNewPosition({...newPosition, koType:e.target.value})}>
                        <option value="Daily">天天觀察</option>
                        <option value="Monthly">每月遞減 (自動推算)</option>
                        <option value="Custom">完全自訂 (手動排程)</option>
                     </select>
                 </div>
                 {newPosition.koType === 'Monthly' && (
                     <div className="w-16">
                         <label className="text-sm font-bold text-slate-500 dark:text-slate-300">降幅%</label>
                         <input type="number" step="0.1" className="w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.stepDownRate !== undefined ? newPosition.stepDownRate : 5} onChange={e=>setNewPosition({...newPosition, stepDownRate:e.target.value})}/>
                     </div>
                 )}
             </div>

             {newPosition.koType === 'Custom' && (
                 <div className="col-span-1 sm:col-span-2 md:col-span-4 mt-2 p-3 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800/50 rounded-lg shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-sm font-bold text-purple-700 dark:text-purple-400">自訂觀察日排程 (對照條件書)</label>
                       <button type="button" onClick={addCS} className="text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-1 rounded hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors">+ 新增觀察日</button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                       {(newPosition.customSchedule || []).map((item, idx) => (
                          <div key={item.id} className="flex gap-2 items-center">
                             <span className="text-xs text-slate-400 dark:text-slate-500 w-4">{idx + 1}.</span>
                             <input type="date" value={item.date} onChange={e => updateCS(item.id, 'date', e.target.value)} className="w-1/2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-purple-500 outline-none" required/>
                             <div className="w-1/2 flex gap-2 items-center">
                                <input type="number" step="0.1" value={item.koLevel} onChange={e => updateCS(item.id, 'koLevel', e.target.value)} placeholder="KO 門檻 %" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded px-2 py-1 text-sm font-bold text-red-600 dark:text-red-400 focus:ring-2 focus:ring-purple-500 outline-none" required/>
                                <button type="button" onClick={() => removeCS(item.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-1 transition-colors"><Trash2 size={16}/></button>
                             </div>
                          </div>
                       ))}
                       {(!newPosition.customSchedule || newPosition.customSchedule.length === 0) && (
                           <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">尚未新增任何觀察日，請點擊右上方新增。</p>
                       )}
                    </div>
                 </div>
             )}
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div>
                <label className="text-sm text-slate-500 dark:text-slate-300">{newPosition.koType === 'Custom' ? '商品生效日' : 'KO 觀察(起)日'}</label>
                <input type="date" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.koObservationStartDate} onChange={e=>setNewPosition({...newPosition, koObservationStartDate:e.target.value})}/>
             </div>
             <div><label className="text-sm text-slate-500 dark:text-slate-300">到期日</label><input type="date" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.maturityDate} onChange={e=>setNewPosition({...newPosition, maturityDate:e.target.value})}/></div>
             <div><label className="text-sm text-slate-500 dark:text-slate-300">存續期</label><input type="text" className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={newPosition.tenor} onChange={e=>setNewPosition({...newPosition, tenor:e.target.value})}/></div>
          </div>

          <div>
            <div className="flex justify-between mb-2"><label className="text-sm font-bold text-slate-800 dark:text-slate-200">連結標的</label><button type="button" onClick={addU} className="text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">+ 新增</button></div>
            {tempUnderlyings.map(u => (
              <div key={u.id} className="flex gap-2 mb-2">
                <input type="text" placeholder="代碼" className="w-1/2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" value={u.ticker} onChange={e=>updateU(u.id, 'ticker', e.target.value)}/>
                <input type="number" step="0.001" placeholder="進場價" className="w-1/2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={u.entryPrice} onChange={e=>updateU(u.id, 'entryPrice', e.target.value)}/>
                <button type="button" onClick={()=>removeU(u.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
              </div>
            ))}
          </div>

          <button type="submit" className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white py-3 rounded-lg font-bold text-sm shadow-md active:scale-95 transition">
            {isEdit ? '確認修改' : '建立部位'}
          </button>
        </form>
      </div>
    </div>
  );
};