import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
    const { cid } = req.query; // 接收客戶專屬 ID

    if (!cid) {
        return res.status(400).json({ error: '缺少客戶驗證碼' });
    }

    try {
        const dbKey = process.env.DB_NAMESPACE || 'fcn-portfolio-data';
        const data = await redis.get(dbKey);
        
        if (!data || !data.clients || !data.positions) {
            return res.status(404).json({ error: '查無雲端資料' });
        }

        // 1. 尋找該客戶是否存在
        const client = data.clients.find(c => c.id === cid);
        if (!client) {
            return res.status(404).json({ error: '無效的專屬連結或客戶已移除' });
        }

        // 2. 只過濾出該客戶的部位
        const clientPositions = data.positions.filter(p => p.clientId === cid);

        // 3. 只挑出該客戶部位有連結到的標的報價，避免回傳整包市場報價
        const relevantPrices = {};
        const clientTickers = new Set();
        clientPositions.forEach(p => {
            if (p.underlyings) {
                p.underlyings.forEach(u => clientTickers.add(u.ticker));
            }
        });

        clientTickers.forEach(ticker => {
            // 嘗試找到對應的報價 (處理 .T 或純代碼)
            const cleanTarget = ticker.toString().toUpperCase().replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
            let foundPrice = data.marketPrices[ticker];
            
            if (foundPrice === undefined) {
                const foundKey = Object.keys(data.marketPrices).find(k => 
                    k.toString().toUpperCase().replace("TYO:", "").replace("JP:", "").replace(".T", "").trim() === cleanTarget
                );
                if (foundKey) foundPrice = data.marketPrices[foundKey];
            }
            
            if (foundPrice !== undefined) {
                relevantPrices[ticker] = foundPrice;
            }
        });

        // 4. 回傳精簡且最新的動態資料庫
        return res.status(200).json({
            clientName: client.name,
            positions: clientPositions,
            prices: relevantPrices,
            lastUpdated: data.lastUpdated,
            sheetId: data.googleSheetId // 若有串接即時報價需求
        });

    } catch (error) {
        console.error("Client view API 錯誤:", error);
        return res.status(500).json({ error: '伺服器讀取失敗' });
    }
}