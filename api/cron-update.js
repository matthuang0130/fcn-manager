import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function fetchPrice(ticker) {
    try {
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        let fetchTicker = cleanTicker;
        if (/^\d[A-Za-z0-9]{3}$/.test(cleanTicker)) fetchTicker = `${cleanTicker}.T`; 
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`);
        const data = await res.json();
        return data.chart.result[0].meta.regularMarketPrice;
    } catch (e) {
        return null;
    }
}

// 🌟 修正：跨越觀察日即刻降階邏輯 (避免時差問題)
const getDynamicKoLevel = (pos, targetDateObj) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
    
    const year = targetDateObj.getFullYear();
    const month = targetDateObj.getMonth() + 1;
    const day = targetDateObj.getDate();
    const targetStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // 1. 在第一次觀察日(含)之前，絕對不降，維持首期 KO
    if (targetStr <= pos.koObservationStartDate) return pos.koLevel;

    // 2. 開始計算降階次數
    const [startYear, startMonth, startDay] = pos.koObservationStartDate.split('-').map(Number);
    let stepDowns = (year - startYear) * 12 + (month - startMonth);
    
    // 如果今天的日期數字「大於」起始日的日期數字，代表本月的觀察點已過，進入下一個遞減週期
    if (day > startDay) {
        stepDowns++;
    }
    
    return pos.koLevel - (stepDowns * (pos.stepDownRate || 0));
};

const getNextObsDateStr = (pos, targetDate) => {
    if (pos.manualNextObsDate) return pos.manualNextObsDate;
    if (!pos.koObservationStartDate) return null;
    if (pos.koType === 'Daily') {
        const start = new Date(pos.koObservationStartDate);
        return targetDate >= start ? targetDate.toISOString().split('T')[0] : pos.koObservationStartDate;
    }

    const start = new Date(pos.koObservationStartDate);
    const targetDD = start.getDate();
    let candidate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDD);
    
    if (candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 2);
    else if (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);

    const targetStr = targetDate.toISOString().split('T')[0];
    const candidateStr = candidate.toISOString().split('T')[0];

    if (candidateStr < targetStr) {
        let nextMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, targetDD);
        if (nextMonth.getDay() === 6) nextMonth.setDate(nextMonth.getDate() + 2);
        else if (nextMonth.getDay() === 0) nextMonth.setDate(nextMonth.getDate() + 1);
        return nextMonth.toISOString().split('T')[0];
    }
    return candidateStr;
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
        await sendLineMessage("🤖 【系統測試】FCN 監控系統測試警報！");
        return res.status(200).json({ success: true, message: "測試成功" });
    }

    try {
        const dbKey = process.env.DB_NAMESPACE || 'fcn-portfolio-data';
        const data = await redis.get(dbKey);
        if (!data || !data.positions) return res.status(200).json({ message: '無資料' });

        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
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
            const nextObsStr = getNextObsDateStr(pos, evalDate);
            const isObsDay = (evalDateStr === nextObsStr);
            const currentKoLevel = getDynamicKoLevel(pos, evalDate);
            
            let anyNewKO = false;
            
            const newUnderlyings = pos.underlyings.map(u => {
                if (u.memoryKO) return u; 
                const curPrice = updatedPrices[u.ticker] || u.entryPrice;
                const targetKoPrice = u.entryPrice * (currentKoLevel / 100);
                
                if (isObsDay && curPrice >= targetKoPrice && pos.koObservationStartDate && evalDateStr >= pos.koObservationStartDate) {
                    anyNewKO = true;
                    return { ...u, memoryKO: true };
                }
                return u;
            });

            if (anyNewKO) {
                const isFullyKO = newUnderlyings.every(u => u.memoryKO);
                const clientName = data.clients.find(c => c.id === pos.clientId)?.name || '未知客戶';
                
                if (isFullyKO) {
                    koAlerts.push(`🎉 FCN 提早結算 (全數 KO)！\n客戶：${clientName}\n產品：${pos.productName}\n狀態：組合內所有標的皆已觸價。`);
                } else {
                    const newlyKod = newUnderlyings.filter((u, i) => u.memoryKO && !pos.underlyings[i].memoryKO).map(u => u.ticker).join(', ');
                    koAlerts.push(`🔔 FCN 個股觸價紀錄\n客戶：${clientName}\n產品：${pos.productName}\n本次達標：${newlyKod}\n當月門檻：${currentKoLevel}%`);
                }
            }

            let updatedPos = { ...pos, underlyings: newUnderlyings };
            
            if (pos.manualNextObsDate && evalDateStr >= pos.manualNextObsDate) {
                updatedPos.manualNextObsDate = "";
            }
            
            return updatedPos;
        });

        data.marketPrices = updatedPrices;
        data.positions = updatedPositions;
        data.lastUpdated = today.toLocaleString('zh-TW') + " (系統自動更新)";
        await redis.set(dbKey, data);

        if (koAlerts.length > 0) {
            await sendLineMessage(`【FCN 觸價總結報】\n今日共有 ${koAlerts.length} 筆達標紀錄：\n\n` + koAlerts.join('\n---\n'));
        }

        return res.status(200).json({ success: true, updatedPricesCount: successCount, koAlertsSent: koAlerts.length });
    } catch (error) {
        return res.status(500).json({ error: '執行失敗', details: error.message });
    }
}