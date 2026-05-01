import * as yf from 'yahoo-finance2';

// 針對 v3 版本最穩健的實例化方式
const yahooFinance = new yf.YahooFinance();

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker' });
  }

  try {
    const isNumeric = /^\d+$/.test(ticker);
    const symbol = isNumeric ? `${ticker}.T` : ticker;

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