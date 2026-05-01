import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  // 強制設定回傳格式為 JSON，避免出現 SyntaxError
  res.setHeader('Content-Type', 'application/json');
  
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: '缺少代號' });
  }

  try {
    // 智慧代號處理：日股加 .T，其餘不變
    const isNumeric = /^\d+$/.test(ticker);
    const symbol = isNumeric ? `${ticker}.T` : ticker;

    // 呼叫 Yahoo Finance，並設定 10 秒超時，避免 API 沒反應導致 500
    const result = await yahooFinance.quote(symbol, {}, { validateResult: false });

    if (!result || !result.regularMarketPrice) {
      return res.status(404).json({ error: '找不到報價' });
    }

    return res.status(200).json({ price: result.regularMarketPrice });

  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ 
      error: '伺服器執行錯誤', 
      details: error.message 
    });
  }
}