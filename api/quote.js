// 使用最穩定的匯入方式
import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }

  try {
    const isNumeric = /^\d+$/.test(ticker);
    const symbol = isNumeric ? `${ticker}.T` : ticker;

    // 💡 嘗試直接呼叫，如果失敗則自動嘗試實例化呼叫
    let result;
    try {
        result = await yahooFinance.quote(symbol);
    } catch (err) {
        if (err.message.includes('YahooFinance')) {
            // 如果報錯說要 new，就在這裡現場 new 一個
            const YF = yahooFinance.YahooFinance || yahooFinance;
            const liveYF = new YF();
            result = await liveYF.quote(symbol);
        } else {
            throw err;
        }
    }

    if (!result || !result.regularMarketPrice) {
      return res.status(404).json({ error: 'Price not found' });
    }

    return res.status(200).json({ price: result.regularMarketPrice });

  } catch (error) {
    console.error('Final API Error:', error.message);
    return res.status(500).json({ 
      error: 'API Error', 
      message: error.message 
    });
  }
}