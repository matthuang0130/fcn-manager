import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function fetchPrice(ticker) {
    try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d`);
        const data = await res.json();
        return data.chart.result[0].meta.regularMarketPrice;
    } catch (e) {
        return null;
    }
}

export default async function handler(req, res) {
    try {
        // 抓取雲端資料庫內容
        const dbKey = process.env.DB_NAMESPACE || 'fcn-portfolio-data';
        const data = await redis.get(dbKey);
        
        if (!data || !data.marketPrices) {
            return res.status(200).json({ message: '無資料可更新' });
        }

        const updatedPrices = { ...data.marketPrices };
        let successCount = 0;

        // 輪詢所有現有標的抓取最新報價
        for (const ticker of Object.keys(updatedPrices)) {
            const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
            // 判斷是否為四碼日股，自動加上 .T
            let fetchTicker = cleanTicker;
            if (/^\d{4}$/.test(cleanTicker)) fetchTicker = `${cleanTicker}.T`; 
            
            const price = await fetchPrice(fetchTicker);
            if (price) {
                updatedPrices[ticker] = price;
                successCount++;
            }
        }

        // 寫入最新報價與更新時間
        data.marketPrices = updatedPrices;
        data.lastUpdated = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) + " (上午 10:00 系統自動更新)";
        
        await redis.set(dbKey, data);

        return res.status(200).json({ success: true, updatedCount: successCount, time: data.lastUpdated });
    } catch (error) {
        console.error('排程更新失敗:', error);
        return res.status(500).json({ error: '排程執行失敗' });
    }
}