import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  // 強制設定回傳格式為 JSON
  res.setHeader('Content-Type', 'application/json');
  
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }

  try {
    // 智慧判斷日股 (.T) 與美股
    const isNumeric = /^\d+$/.test(ticker);
    const symbol = isNumeric ? `${ticker}.T` : ticker;

    // 直接使用預設導出的 yahooFinance 物件
    const result = await yahooFinance.quote(symbol);

    if (!result || !result.regularMarketPrice) {
      return res.status(404).json({ error: 'Price not found' });
    }

    return res.status(200).json({ price: result.regularMarketPrice });

  } catch (error) {
    console.error('Yahoo API Error:', error.message);
    // 即使失敗也回傳 JSON，避免前端噴出 SyntaxError
    return res.status(500).json({ 
      error: 'API Error', 
      message: error.message 
    });
  }
}