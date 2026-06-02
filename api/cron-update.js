import { Redis } from '@upstash/redis';

// 初始化連接 KV 資料庫
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function fetchPrice(ticker) {
    try {
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        let fetchTicker = cleanTicker;
        
        // 🌟 升級版日股雷達：只要是 4 個字元且開頭是數字 (如 7203 或 285A)，就自動補 .T
        if (/^\d[A-Za-z0-9]{3}$/.test(cleanTicker)) {
            fetchTicker = `${cleanTicker}.T`; 
        }
        
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`);
        const data = await res.json();
        return data.chart.result[0].meta.regularMarketPrice;
    } catch (e) {
        return null;
    }
}

const getDynamicKoLevel = (pos, today) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
    const start = new Date(pos.koObservationStartDate);
    let monthsPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    if (today.getDate() < start.getDate()) monthsPassed--;
    if (monthsPassed <= 0) return pos.koLevel;
    return pos.koLevel - (monthsPassed * (pos.stepDownRate || 0));
};

const checkIsObservationDay = (pos, today) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return true;
    const start = new Date(pos.koObservationStartDate);
    const targetDD = start.getDate();
    let expectedThisMonth = new Date(today.getFullYear(), today.getMonth(), targetDD);
    if (expectedThisMonth.getDay() === 6) expectedThisMonth.setDate(expectedThisMonth.getDate() + 2);
    else if (expectedThisMonth.getDay() === 0) expectedThisMonth.setDate(expectedThisMonth.getDate() + 1);
    return today.toDateString() === expectedThisMonth.toDateString();
};

async function sendLineMessage(message) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const userId = process.env.LINE_ADMIN_USER_ID;
    if (!token || !userId) return;
    await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: message }] })
    });
}

export default async function handler(req, res) {
    // 秘密測試通道
    if (req.query.test === 'true') {
        await sendLineMessage("🤖 【系統測試】您好！這是來自 FCN 監控系統的測試訊息，代表您的 LINE 警報功能已成功開通！系統將會在每個工作日早上 7 點為您執行自動監控。🎉");
        return res.status(200).json({ success: true, message: "測試訊息已成功發射！請檢查您的手機 LINE 訊息。" });
    }

    try {
        const dbKey = process.env.DB_NAMESPACE || 'fcn-portfolio-data';
        const data = await redis.get(dbKey);
        if (!data || !data.positions) return res.status(200).json({ message: '目前無資料' });

        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
        const todayStr = today.toISOString().split('T')[0];
        let koAlerts = [];
        let successCount = 0;
        const updatedPrices = { ...data.marketPrices };

        for (const ticker of Object.keys(updatedPrices)) {
            const price = await fetchPrice(ticker);
            if (price) { updatedPrices[ticker] = price; successCount++; }
        }

        const updatedPositions = data.positions.map(pos => {
            const isObsDay = checkIsObservationDay(pos, today);
            const currentKoLevel = getDynamicKoLevel(pos, today);
            const newUnderlyings = pos.underlyings.map(u => {
                const curPrice = updatedPrices[u.ticker] || u.entryPrice;
                const targetKoPrice = u.entryPrice * (currentKoLevel / 100);
                if (!u.memoryKO && isObsDay && curPrice >= targetKoPrice && pos.koObservationStartDate && todayStr >= pos.koObservationStartDate) {
                    const clientName = data.clients.find(c => c.id === pos.clientId)?.name || '未知客戶';
                    koAlerts.push(`🔔 KO 觸價通知\n客戶：${clientName}\n產品：${pos.productName}\n標的：${u.ticker}\n收盤價：$${curPrice.toFixed(2)}\n門檻：${currentKoLevel}% ($${targetKoPrice.toFixed(2)})`);
                    return { ...u, memoryKO: true };
                }
                return u;
            });
            return { ...pos, underlyings: newUnderlyings };
        });

        data.marketPrices = updatedPrices;
        data.positions = updatedPositions;
        data.lastUpdated = today.toLocaleString('zh-TW') + " (系統自動更新)";
        await redis.set(dbKey, data);

        if (koAlerts.length > 0) {
            await sendLineMessage(`【FCN 結算警報】\n今日共有 ${koAlerts.length} 筆標的達成 KO 出場條件：\n\n` + koAlerts.join('\n---\n'));
        }

        return res.status(200).json({ success: true, updatedPricesCount: successCount, koAlertsSent: koAlerts.length });
    } catch (error) {
        return res.status(500).json({ error: '伺服器執行失敗', details: error.message });
    }
}