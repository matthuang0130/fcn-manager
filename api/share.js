import { Redis } from '@upstash/redis';

// 自動抓取連線密碼
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const shareId = Math.random().toString(36).substring(2, 10);
      
      // ★ 已經移除過期時間限制，現在資料會永久保存
      await redis.set(`share_${shareId}`, req.body);
      
      return res.status(200).json({ shareId });
    }
    
    if (req.method === 'GET') {
      const { id } = req.query;
      const data = await redis.get(`share_${id}`);
      
      if (!data) return res.status(404).json({ error: '找不到資料或連結已失效' });
      return res.status(200).json(data);
    }
    
    return res.status(405).json({ error: '不允許的方法' });
  } catch (error) {
    console.error('分享 API 錯誤:', error);
    return res.status(500).json({ error: '伺服器內部錯誤' });
  }
}