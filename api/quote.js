export default async function handler(req, res) {
    const { ticker } = req.query;
    
    if (!ticker) {
        return res.status(400).json({ error: '缺少標的代碼參數' });
    }

    try {
        const cleanTicker = ticker.toString().toUpperCase().replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        let fetchTicker = cleanTicker;

        // 🌟 升級版日股雷達：只要是 4 個字元且開頭是數字 (如 7203 或 285A)，就自動補 .T
        if (/^\d[A-Za-z0-9]{3}$/.test(cleanTicker)) {
            fetchTicker = `${cleanTicker}.T`;
        }

        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`);
        
        if (!response.ok) {
            throw new Error('Yahoo Finance API 發生錯誤');
        }
        
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error('找不到該標的報價');
        }
        
        const price = data.chart.result[0].meta.regularMarketPrice;

        if (price !== undefined && price !== null) {
            return res.status(200).json({ price });
        } else {
            throw new Error('回傳資料中沒有價格');
        }
    } catch (error) {
        console.error(`抓取 ${ticker} 報價失敗:`, error);
        return res.status(500).json({ error: '無法取得報價' });
    }
}