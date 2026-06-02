import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function fetchPrice(ticker) {
    try {
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        let fetchTicker = cleanTicker;
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

const getDynamicKoLevel = (pos, targetDate) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
    const start = new Date(pos.koObservationStartDate);
    let monthsPassed = (targetDate.getFullYear() - start.getFullYear()) * 12 + (targetDate.getMonth() - start.getMonth());
    if (targetDate.getDate() < start.getDate()) monthsPassed--;
    if (monthsPassed <= 0) return pos.koLevel;
    return pos.koLevel - (monthsPassed * (pos.stepDownRate || 0));
};

const checkIsObservationDay = (pos, targetDate) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return true;
    const start = new Date(pos.koObservationStartDate);
    const targetDD = start.getDate();
    let expectedThisMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDD);
    if (expectedThisMonth.getDay() === 6) expectedThisMonth.setDate(expectedThisMonth.getDate() + 2);
    else if (expectedThisMonth.getDay() === 0) expectedThisMonth.setDate(expectedThisMonth.getDate() + 1);
    return targetDate.toDateString() === expectedThisMonth.toDateString();
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
    if (req.query.test === 'true') {
        await sendLineMessage("🤖 【系統測試】您好！這是來自 FCN 監控系統的測試訊息，代表您的 LINE 警報功能已成功開通！");
        return res.status(200).json({ success: true, message: "測試訊息已成功發射！請檢查您的手機 LINE 訊息。" });
    }

    try {
        const dbKey = process.env.DB_NAMESPACE || 'fcn-portfolio-data';
        const data = await redis.get(dbKey);
        if (!data || !data.positions) return res.status(200).json({ message: '目前無資料' });

        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
        
        // 🌟 核心修正 1：評價基準日往前推一天 (T-1)
        // 早上 7 點排程時，使用的是「昨天」的美國收盤價與觀察日
        const evalDate = new Date(today);
        evalDate.setDate(evalDate.getDate() - 1);
        const evalDateStr = evalDate.toISOString().split('T')[0];

        let koAlerts = [];
        let successCount = 0;
        const updatedPrices = { ...data.marketPrices };

        for (const ticker of Object.keys(updatedPrices)) {
            const price = await fetchPrice(ticker);
            if (price) { updatedPrices[ticker] = price; successCount++; }
        }

        const updatedPositions = data.positions.map(pos => {
            const isObsDay = checkIsObservationDay(pos, evalDate);
            const currentKoLevel = getDynamicKoLevel(pos, evalDate);
            
            // 🌟 核心修正 2：改為「整個產品組合」一起判斷 (Worst-of Basket 邏輯)
            let allMeetKo = true;
            let worstPerf = 9999;
            let worstTicker = '';

            pos.underlyings.forEach(u => {
                const curPrice = updatedPrices[u.ticker] || u.entryPrice;
                const targetKoPrice = u.entryPrice * (currentKoLevel / 100);
                
                const perf = curPrice / u.entryPrice;
                if (perf < worstPerf) {
                    worstPerf = perf;
                    worstTicker = u.ticker;
                }

                if (curPrice < targetKoPrice) {
                    allMeetKo = false; // 只要有一檔沒達標，整個產品就不能 KO
                }
            });

            // 檢查是否尚未被標記過 KO
            const alreadyKnockedOut = pos.underlyings.every(u => u.memoryKO);

            if (allMeetKo && !alreadyKnockedOut && isObsDay && pos.koObservationStartDate && evalDateStr >= pos.koObservationStartDate) {
                const clientName = data.clients.find(c => c.id === pos.clientId)?.name || '未知客戶';
                
                koAlerts.push(
                    `🔔 FCN 提前出場 (KO) 通知\n` +
                    `客戶：${clientName}\n` +
                    `產品：${pos.productName}\n` +
                    `最差標的：${worstTicker} (${(worstPerf * 100).toFixed(2)}%)\n` +
                    `當月門檻：${currentKoLevel}%`
                );
                
                // 產品確定 KO，將組合內所有標的一併打上標記
                const newUnderlyings = pos.underlyings.map(u => ({ ...u, memoryKO: true }));
                return { ...pos, underlyings: newUnderlyings };
            }
            
            return pos;
        });

        data.marketPrices = updatedPrices;
        data.positions = updatedPositions;
        data.lastUpdated = today.toLocaleString('zh-TW') + " (系統自動更新)";
        await redis.set(dbKey, data);

        if (koAlerts.length > 0) {
            await sendLineMessage(`【FCN 結算警報】\n今日共有 ${koAlerts.length} 筆組合達成 KO 出場條件：\n\n` + koAlerts.join('\n---\n'));
        }

        return res.status(200).json({ success: true, updatedPricesCount: successCount, koAlertsSent: koAlerts.length });
    } catch (error) {
        return res.status(500).json({ error: '伺服器執行失敗', details: error.message });
    }
}