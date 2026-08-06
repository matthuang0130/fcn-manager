import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function fetchPrice(ticker) {
    try {
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        const isJP = /^\d[A-Za-z0-9]{3}$/.test(cleanTicker);
        let finalPrice = null;

        if (isJP) {
            try {
                const gfRes = await fetch(`https://www.google.com/finance/quote/${cleanTicker}:TYO`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const html = await gfRes.text();
                const match = html.match(/class="YMlKec fxKbKc"[^>]*>[¥$]?([\d,.]+)/);
                if (match && match[1]) finalPrice = parseFloat(match[1].replace(/,/g, ''));
            } catch (e) {}
        }
        if (finalPrice === null) {
            try {
                let fetchTicker = isJP ? `${cleanTicker}.T` : cleanTicker;
                const yfRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`);
                const data = await yfRes.json();
                if (data.chart && data.chart.result && data.chart.result[0].meta.regularMarketPrice) finalPrice = data.chart.result[0].meta.regularMarketPrice;
            } catch (e) {}
        }
        if (finalPrice === null && !isJP) {
            try {
                for (const ex of ['NASDAQ', 'NYSE']) {
                    const gfRes = await fetch(`https://www.google.com/finance/quote/${cleanTicker}:${ex}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (gfRes.ok) {
                        const html = await gfRes.text();
                        const match = html.match(/class="YMlKec fxKbKc"[^>]*>[¥$]?([\d,.]+)/);
                        if (match && match[1]) { finalPrice = parseFloat(match[1].replace(/,/g, '')); break; }
                    }
                }
            } catch (e) {}
        }
        return finalPrice;
    } catch (e) { return null; }
}

const getDynamicKoLevel = (pos, targetDateStr) => {
    if (pos.manualNextObsDate && pos.manualKoLevel) return pos.manualKoLevel;

    if (pos.koType === 'Custom') {
        if (!pos.customSchedule || pos.customSchedule.length === 0) return pos.koLevel;
        const upcoming = pos.customSchedule.find(s => s.date >= targetDateStr);
        if (upcoming) return upcoming.koLevel;
        return pos.customSchedule[pos.customSchedule.length - 1].koLevel;
    }

    if (pos.koType !== 'Monthly' || !pos.koObservationStartDate) return pos.koLevel;
    if (targetDateStr <= pos.koObservationStartDate) return pos.koLevel;

    const [sYear, sMonth, sDay] = pos.koObservationStartDate.split('-').map(Number);
    let stepDowns = 0;

    for (let i = 0; i < 120; i++) { 
        let candidate = new Date(sYear, sMonth - 1 + i, sDay);
        if (candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 2);
        else if (candidate.getDay() === 0) candidate.setDate(candidate.getDate() + 1);
        
        const candidateStr = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
        if (targetDateStr <= candidateStr) { stepDowns = i; break; }
    }
    return pos.koLevel - (stepDowns * (pos.stepDownRate || 0));
};

const getNextObsDateStr = (pos, targetDateStr) => {
    if (pos.manualNextObsDate) return pos.manualNextObsDate;
    
    if (pos.koType === 'Custom') {
        if (!pos.customSchedule || pos.customSchedule.length === 0) return "未設定";
        const upcoming = pos.customSchedule.find(s => s.date >= targetDateStr);
        return upcoming ? upcoming.date : "已結束";
    }

    if (pos.koType !== 'Monthly') return targetDateStr >= pos.koObservationStartDate ? targetDateStr : pos.koObservationStartDate;
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
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
        const lockedTickers = data.lockedTickers || []; 

        for (const ticker of Object.keys(updatedPrices)) {
            if (lockedTickers.includes(ticker)) continue;
            const price = await fetchPrice(ticker);
            if (price) { updatedPrices[ticker] = price; successCount++; }
        }

        const updatedPositions = data.positions.map(pos => {
            const currentDynamicKoLevel = getDynamicKoLevel(pos, evalDateStr);
            const nextObsStr = getNextObsDateStr(pos, evalDateStr);
            const isObsDay = (evalDateStr === nextObsStr);
            const hasStarted = !pos.koObservationStartDate || evalDateStr >= pos.koObservationStartDate;
            
            let anyNewKO = false;
            const newUnderlyings = pos.underlyings.map(u => {
                if (u.memoryKO) return u; 
                const curPrice = updatedPrices[u.ticker] || u.entryPrice;
                const targetKoPrice = u.entryPrice * (currentDynamicKoLevel / 100);
                if (isObsDay && curPrice >= targetKoPrice && hasStarted) {
                    anyNewKO = true; return { ...u, memoryKO: true };
                }
                return u;
            });

            if (anyNewKO) {
                const isFullyKO = newUnderlyings.every(u => u.memoryKO);
                const clientName = data.clients.find(c => c.id === pos.clientId)?.name || '未知客戶';
                if (isFullyKO) koAlerts.push(`🎉 FCN 提早結算 (全數 KO)！\n客戶：${clientName}\n產品：${pos.productName}\n本次門檻：${currentDynamicKoLevel}%`);
                else {
                    const newlyKod = newUnderlyings.filter((u, i) => u.memoryKO && !pos.underlyings[i].memoryKO).map(u => u.ticker).join(', ');
                    koAlerts.push(`🔔 FCN 個股觸價紀錄\n客戶：${clientName}\n產品：${pos.productName}\n本次達標：${newlyKod}\n當次門檻：${currentDynamicKoLevel}%`);
                }
            }

            let updatedPos = { ...pos, underlyings: newUnderlyings };
            if (pos.manualNextObsDate && evalDateStr >= pos.manualNextObsDate) {
                updatedPos.manualNextObsDate = "";
                updatedPos.manualKoLevel = null;
            }
            return updatedPos;
        });

        data.marketPrices = updatedPrices;
        data.positions = updatedPositions;
        data.lastUpdated = today.toLocaleString('zh-TW') + " (系統自動更新)";
        await redis.set(dbKey, data);

        if (koAlerts.length > 0) await sendLineMessage(`【FCN 觸價總結報】\n今日共有 ${koAlerts.length} 筆達標紀錄：\n\n` + koAlerts.join('\n---\n'));

        return res.status(200).json({ success: true, updatedPricesCount: successCount, koAlertsSent: koAlerts.length });
    } catch (error) { return res.status(500).json({ error: '執行失敗', details: error.message }); }
}