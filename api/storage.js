import { Redis } from '@upstash/redis';

// 自動抓取 .env.local 裡面的密碼建立連線
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    // 處理 GET 請求：讀取資料庫裡的部位資料
    if (req.method === 'GET') {
      const data = await redis.get('fcn-portfolio-data');
      return res.status(200).json(data || []);
    }
    
    // 處理 POST 請求：把新的部位資料寫入資料庫
    if (req.method === 'POST') {
      await redis.set('fcn-portfolio-data', req.body);
      return res.status(200).json({ success: true, message: '儲存成功' });
    }
    
    // 如果是其他請求方法，回傳錯誤
    return res.status(405).json({ error: '不允許的方法' });
  } catch (error) {
    console.error('資料庫連線錯誤:', error);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
}