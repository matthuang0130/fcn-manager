export default async function handler(req, res) {
    const { ticker } = req.query;

    if (!ticker) {
        return res.status(400).json({ error: 'Missing ticker' });
    }

    try {
        const cleanTicker = ticker.replace("TYO:", "").replace("JP:", "").replace(".T", "").trim();
        const isJP = /^\d[A-Za-z0-9]{3}$/.test(cleanTicker); // 判斷是否為 4 碼日股

        let finalPrice = null;

        // 1. 若為日股，優先強制爬取 Google Finance (TYO) 避開延遲
        if (isJP) {
            try {
                const gfRes = await fetch(`https://www.google.com/finance/quote/${cleanTicker}:TYO`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                const html = await gfRes.text();
                const match = html.match(/class="YMlKec fxKbKc"[^>]*>[¥$]?([\d,.]+)/);
                if (match && match[1]) {
                    finalPrice = parseFloat(match[1].replace(/,/g, ''));
                }
            } catch (e) {
                console.log(`Google Finance 日股抓取失敗，準備降級`);
            }
        }

        // 2. 通用主力：Yahoo Finance API (支援多數美股與備用日股)
        if (finalPrice === null) {
            try {
                let fetchTicker = cleanTicker;
                if (isJP) fetchTicker = `${cleanTicker}.T`; 

                const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${fetchTicker}?interval=1d`;
                const yfRes = await fetch(yfUrl);
                const data = await yfRes.json();
                
                if (data.chart && data.chart.result && data.chart.result[0].meta.regularMarketPrice) {
                    finalPrice = data.chart.result[0].meta.regularMarketPrice;
                }
            } catch (e) {
                console.log(`Yahoo API 抓取失敗`);
            }
        }

        // 3. 🌟 新增終極備援：如果 Yahoo API 抓不到美股 (如 SNDK)，啟動美股 Google Finance 爬蟲！
        if (finalPrice === null && !isJP) {
            try {
                // 盲測 NASDAQ 與 NYSE 兩大交易所
                const exchanges = ['NASDAQ', 'NYSE'];
                for (const ex of exchanges) {
                    const gfRes = await fetch(`https://www.google.com/finance/quote/${cleanTicker}:${ex}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    if (gfRes.ok) {
                        const html = await gfRes.text();
                        const match = html.match(/class="YMlKec fxKbKc"[^>]*>[¥$]?([\d,.]+)/);
                        if (match && match[1]) {
                            finalPrice = parseFloat(match[1].replace(/,/g, ''));
                            break; // 找到了就跳出迴圈
                        }
                    }
                }
            } catch (e) {
                console.log(`Google Finance 美股備援抓取失敗`);
            }
        }

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