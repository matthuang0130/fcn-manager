export default async function handler(req, res) {
    const { ticker } = req.query;

    if (!ticker) {
        return res.status(400).json({ error: 'Missing ticker' });
    }

    try {
        // 1. 清理與標準化代碼
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        const isJP = /^\d[A-Za-z0-9]{3}$/.test(cleanTicker); // 判斷是否為 4 碼日股

        let finalPrice = null;

        // 🚀 雙引擎策略 A：針對日股，優先強制爬取 Google Finance (最準確、零延遲)
        if (isJP) {
            try {
                const gfUrl = `https://www.google.com/finance/quote/${cleanTicker}:TYO`;
                const gfRes = await fetch(gfUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                const html = await gfRes.text();
                
                // 使用正則表達式精準抓取 Google 財經網頁中的大字體報價
                const match = html.match(/class="YMlKec fxKbKc"[^>]*>[¥$]?([\d,.]+)/);
                if (match && match[1]) {
                    finalPrice = parseFloat(match[1].replace(/,/g, ''));
                }
            } catch (e) {
                console.log(`Google Finance 抓取 ${cleanTicker} 失敗，準備降級備用方案`);
            }
        }

        // 🚀 雙引擎策略 B：美股，或 Google 財經失敗時的 Yahoo API 備用方案
        if (finalPrice === null) {
            let fetchTicker = cleanTicker;
            if (isJP) fetchTicker = `${cleanTicker}.T`; 

            const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`;
            const yfRes = await fetch(yfUrl);
            const data = await yfRes.json();
            
            if (data.chart && data.chart.result && data.chart.result[0].meta.regularMarketPrice) {
                finalPrice = data.chart.result[0].meta.regularMarketPrice;
            }
        }

        // 回傳最終結果
        if (finalPrice !== null) {
            return res.status(200).json({ price: finalPrice });
        } else {
            return res.status(404).json({ error: '查無報價' });
        }

    } catch (error) {
        console.error(`Quote API 錯誤 (${ticker}):`, error);
        return res.status(500).json({ error: '報價伺服器錯誤' });
    }
}