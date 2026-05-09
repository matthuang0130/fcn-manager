import { Redis } from '@upstash/redis';

// 初始化連接 KV 資料庫
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- 輔助函數：抓取 Yahoo Finance 股價 ---
async function fetchPrice(ticker) {
    try {
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        // 如果是四碼數字（日股），自動補上 .T
        let fetchTicker = cleanTicker;
        if (/^\d{4}$/.test(cleanTicker)) fetchTicker = `${cleanTicker}.T`; 
        
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`);
        const data = await res.json();
        return data.chart.result[0].meta.regularMarketPrice;
    } catch (e) {
        console.error(`Fetch price failed for ${ticker}:`, e);
        return null;
    }
}

// --- 輔助函數：計算動態遞減 KO 門檻 ---
const getDynamicKoLevel = (pos, today) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
    const start = new Date(pos.koObservationStartDate);
    let monthsPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    
    // 如果日期還沒到該月的觀察日，經過月數要減 1
    if (today.getDate() < start.getDate()) monthsPassed--;
    
    // 如果經過月數為 0 或負數，維持原有的 KO Level
    if (monthsPassed <= 0) return pos.koLevel;
    
    return pos.koLevel - (monthsPassed * (pos.stepDownRate || 0));
};

// --- 輔助函數：判斷今天是否為觀察日 (含假日順延邏輯) ---
const checkIsObservationDay = (pos, today) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return true; // Daily 隨時可觀察
    
    const start = new Date(pos.koObservationStartDate);
    const targetDD = start.getDate();
    
    // 預期這個月的觀察日
    let expectedThisMonth = new Date(today.getFullYear(), today.getMonth(), targetDD);
    
    // 假日順延：0是週日，6是週六
    if (expectedThisMonth.getDay() === 6) {
        expectedThisMonth.setDate(expectedThisMonth.getDate() + 2); // 六延到一
    } else if (expectedThisMonth.getDay() === 0) {
        expectedThisMonth.setDate(expectedThisMonth.getDate() + 1); // 日延到一
    }

    return today.toDateString() === expectedThisMonth.toDateString();
};

// --- 輔助函數：發送 LINE 訊息 ---
async function sendLineMessage(message) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const userId = process.env.LINE_ADMIN_USER_ID;
    
    if (!token || !userId) {
        console.warn("LINE 憑證未設定，跳過通知發送。");
        return;
    }
    
    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ 
                to: userId, 
                messages: [{ type: 'text', text: message }] 
            })
        });
        
        if (!response.ok) {
            const errBody = await response.text();
            console.error("LINE 發送失敗:", errBody);
        }
    } catch (e) {
        console.error("LINE API 請求錯誤:", e);
    }
}

// --- 主要 API 執行邏輯 ---
export default async function handler(req, res) {
    try {
        // 1. 從 KV 資料庫讀取投資組合資料
        const dbKey = process.env.DB_NAMESPACE || 'fcn-portfolio-data';
        const data = await redis.get(dbKey);
        
        if (!data || !data.positions) {
            return res.status(200).json({ message: '目前無資料可更新或監控' });
        }

        // 以台灣時間作為判定基準
        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
        const todayStr = today.toISOString().split('T')[0];
        
        let koAlerts = [];
        let successCount = 0;
        const updatedPrices = { ...data.marketPrices };

        // 2. 爬取所有現有標的之最新報價
        for (const ticker of Object.keys(updatedPrices)) {
            const price = await fetchPrice(ticker);
            if (price) {
                updatedPrices[ticker] = price;
                successCount++;
            }
        }

        // 3. 掃描所有部位，檢查是否達成 KO 條件
        const updatedPositions = data.positions.map(pos => {
            const isObsDay = checkIsObservationDay(pos, today);
            const currentKoLevel = getDynamicKoLevel(pos, today);

            const newUnderlyings = pos.underlyings.map(u => {
                const curPrice = updatedPrices[u.ticker] || u.entryPrice;
                const targetKoPrice = u.entryPrice * (currentKoLevel / 100);
                
                // 觸發條件：尚未被標記 KO + 今天是觀察日 + 現價大於等於門檻 + 已過起始觀察日
                if (!u.memoryKO && isObsDay && curPrice >= targetKoPrice && pos.koObservationStartDate && todayStr >= pos.koObservationStartDate) {
                    
                    const clientName = data.clients.find(c => c.id === pos.clientId)?.name || '未知客戶';
                    
                    // 組合要發送的 LINE 訊息內容
                    koAlerts.push(
                        `🔔 KO 觸價通知\n` +
                        `客戶：${clientName}\n` +
                        `產品：${pos.productName}\n` +
                        `標的：${u.ticker}\n` +
                        `當前收盤價：$${curPrice.toFixed(2)}\n` +
                        `當月門檻：${currentKoLevel}% ($${targetKoPrice.toFixed(2)})`
                    );
                    
                    // 標記為已 KO
                    return { ...u, memoryKO: true };
                }
                return u;
            });
            return { ...pos, underlyings: newUnderlyings };
        });

        // 4. 更新狀態與時間，寫回 KV 資料庫
        data.marketPrices = updatedPrices;
        data.positions = updatedPositions;
        data.lastUpdated = today.toLocaleString('zh-TW') + " (系統自動更新)";
        
        await redis.set(dbKey, data);

        // 5. 如果有部位達標，發送 LINE 總結訊息
        if (koAlerts.length > 0) {
            const lineSummaryMessage = `【FCN 結算警報】\n今日共有 ${koAlerts.length} 筆標的達成 KO 出場條件：\n\n` + koAlerts.join('\n---\n');
            await sendLineMessage(lineSummaryMessage);
        }

        // 6. 回傳執行結果給 Vercel
        return res.status(200).json({ 
            success: true, 
            updatedPricesCount: successCount, 
            koAlertsSent: koAlerts.length 
        });

    } catch (error) {
        console.error('API 執行失敗:', error);
        return res.status(500).json({ error: '伺服器執行失敗', details: error.message });
    }
}