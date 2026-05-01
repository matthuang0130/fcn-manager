import { YahooFinance } from 'yahoo-finance2';

// 建立實例 (v3 必須這樣寫)
const yahooFinance = new YahooFinance();

export default async function handler(req, res) {
  // 設定回傳格式，確保前端不會解析失敗
  res.setHeader('Content-Type', 'application/json');
  
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }

  try {
    // 智慧判斷日股與美股
    const isNumeric = /^\d+$/.test(ticker);
    const symbol = isNumeric ? `${ticker}.T` : ticker;

    // 呼叫報價
    const result = await yahooFinance.quote(symbol);

    if (!result || !result.regularMarketPrice) {
      return res.status(404).json({ error: 'Price not found' });
    }

    return res.status(200).json({ price: result.regularMarketPrice });

  } catch (error) {
    console.error('Yahoo API Error:', error.message);
    return res.status(500).json({ 
      error: 'API Error', 
      message: error.message 
    });
  }
}