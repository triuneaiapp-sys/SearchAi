import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, jobId } = req.body;

    if (message && message.toLowerCase().includes('workflow was finished')) {
      if (jobId) {
        const jobJson = await redis.get(`job:${jobId}`);
        if (jobJson) {
          const job = JSON.parse(jobJson);
          await redis.set(`job:${jobId}`, JSON.stringify({
            ...job,
            status: 'completed',
            completedAt: new Date().toISOString(),
          }));
          console.log(`Job ${jobId} marked as completed via callback`);
          
          return res.status(200).json({
            success: true,
            message: `Job ${jobId} marked as completed`,
          });
        } else {
          console.log(`Job ${jobId} not found in queue`);
          return res.status(404).json({ error: 'Job not found' });
        }
      } else {
        const queueLength = await redis.llen('webhook_queue');
        if (queueLength === 0) {
          const allKeys = await redis.keys('job:*');
          for (const key of allKeys) {
            const jobJson = await redis.get(key);
            if (jobJson) {
              const job = JSON.parse(jobJson);
              if (job.status === 'sent' || job.status === 'processing') {
                await redis.set(key, JSON.stringify({
                  ...job,
                  status: 'completed',
                  completedAt: new Date().toISOString(),
                }));
                console.log(`Job ${job.id} marked as completed (no jobId provided)`);
                return res.status(200).json({
                  success: true,
                  message: `Job ${job.id} marked as completed`,
                });
              }
            }
          }
        }
        return res.status(400).json({ error: 'jobId required when queue is not empty' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid completion message' });
    }
  } catch (error) {
    console.error('Error handling completion webhook:', error);
    return res.status(500).json({ error: 'Failed to process completion' });
  }
}

