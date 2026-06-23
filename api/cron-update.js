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

// 🌟 純字串比對，徹底消除時差問題
const getDynamicKoLevel = (pos, targetDateStr) => {
    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
    if (targetDateStr <= pos.koObservationStartDate) return pos.koLevel;

    const [startYear, startMonth, startDay] = pos.koObservationStartDate.split('-').map(Number);
    const [year, month, day] = targetDateStr.split('-').map(Number);

    let stepDowns = (year - startYear) * 12 + (month - startMonth);
    if (day > startDay) stepDowns++;
    
    return pos.koLevel - (stepDowns * (pos.stepDownRate || 0));
};

const getNextObsDateStr = (pos, targetDateStr) => {
    if (pos.manualNextObsDate) return pos.manualNextObsDate;
    
    // 天天觀察：如果沒設起始日就是每天；有設就看是否過了起始日
    if (pos.koType !== 'Monthly') {
        if (!pos.koObservationStartDate) return targetDateStr;
        return targetDateStr >= pos.koObservationStartDate ? targetDateStr : pos.koObservationStartDate;
    }

    if (!pos.koObservationStartDate) return "未設定";

    const [sYear, sMonth, sDay] = pos.koObservationStartDate.split('-').map(Number);
    const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);

    let candidate = new Date(tYear, tMonth - 1, sDay);
    if (candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 2);
    else if (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);

    const toYYYYMMDD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let candidateStr = toYYYYMMDD(candidate);

    if (candidateStr < targetDateStr) {
        let nextMonth = new Date(tYear, tMonth, sDay);
        if (nextMonth.getDay() === 6) nextMonth.setDate(nextMonth.getDate() + 2);
        else if (nextMonth.getDay() === 0) nextMonth.setDate(nextMonth.getDate() + 1);
        return toYYYYMMDD(nextMonth);
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
        const evalDateStr = `${evalDate.getFullYear()}-${String(evalDate.getMonth()+1).padStart(2, '0')}-${String(evalDate.getDate()).padStart(2, '0')}`;

        let koAlerts = [];
        let successCount = 0;
        const updatedPrices = { ...data.marketPrices };

        for (const ticker of Object.keys(updatedPrices)) {
            const price = await fetchPrice(ticker);
            if (price) { updatedPrices[ticker] = price; successCount++; }
        }

        const updatedPositions = data.positions.map(pos => {
            const nextObsStr = getNextObsDateStr(pos, evalDateStr);
            const isObsDay = (evalDateStr === nextObsStr);
            const currentKoLevel = getDynamicKoLevel(pos, evalDateStr);
            const hasStarted = !pos.koObservationStartDate || evalDateStr >= pos.koObservationStartDate;
            
            let anyNewKO = false;
            
            const newUnderlyings = pos.underlyings.map(u => {
                if (u.memoryKO) return u; 
                const curPrice = updatedPrices[u.ticker] || u.entryPrice;
                const targetKoPrice = u.entryPrice * (currentKoLevel / 100);
                
                if (isObsDay && curPrice >= targetKoPrice && hasStarted) {
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