import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  const { ticker } = req.query; 
  if (!ticker) return res.status(400).json({ error: '請提供股票代號' });

  try {
    // 💡 新增智慧判斷：如果是純數字(日股)就加 .T，如果是英文(美股)就保持原樣
    const isNumeric = /^\d+$/.test(ticker);
    const symbol = isNumeric ? `${ticker}.T` : ticker; 
    
    const quote = await yahooFinance.quote(symbol);
    
    res.status(200).json({ price: quote.regularMarketPrice });
  } catch (error) {
    res.status(500).json({ error: '抓取失敗' });
  }
}