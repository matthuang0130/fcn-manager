import React, { useState } from 'react';
import { X, RefreshCw, User, Share2, Trash2, Check, Plus } from 'lucide-react';

export const ClientManagerModal = ({ isOpen, onClose, clients, onAdd, onDelete, activeId, onGenerateShareLink, isGeneratingShareLink }) => { 
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleConfirmAdd = (e) => {
    e.preventDefault();
    if(newName.trim()) {
        onAdd(newName.trim());
        setNewName('');
        setIsAdding(false);
    }
  };

  if(!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 relative overflow-hidden">
        {isGeneratingShareLink && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm animate-in fade-in">
                <div className="animate-spin text-blue-600 mb-2"><RefreshCw size={24} /></div>
                <span className="text-sm font-bold text-slate-600">正在產生專屬網址...</span>
            </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">管理投資人</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {clients.map(c => (
            <div key={c.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 group">
              <div className="flex items-center gap-2">
                <User size={16} className={c.id === activeId ? "text-blue-600" : "text-slate-400"}/>
                <span className={`text-sm ${c.id === activeId ? "font-bold text-blue-700" : "text-slate-700"}`}>{c.name}</span>
                {c.id === activeId && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 rounded">當前</span>}
              </div>
              <div className="flex gap-1">
                  <button onClick={() => onGenerateShareLink(c.id)} className="text-slate-400 hover:text-blue-600 p-1" title="產生分享連結"><Share2 size={14}/></button>
                  <button onClick={() => onDelete(c.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>

        {isAdding ? (
            <form onSubmit={handleConfirmAdd} className="flex gap-2 animate-in fade-in zoom-in duration-200">
                <input 
                    autoFocus
                    type="text" 
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="輸入名稱..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-lg"><Check size={16}/></button>
                <button type="button" onClick={()=>setIsAdding(false)} className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg"><X size={16}/></button>
            </form>
        ) : (
            <button onClick={()=>setIsAdding(true)} className="w-full border border-dashed border-slate-300 text-slate-500 py-2.5 rounded-lg text-sm hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300 transition flex items-center justify-center gap-2"><Plus size={14}/> 新增投資人</button>
        )}
      </div>
    </div>
  );
};