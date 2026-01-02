import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const jobJson = await redis.get(`job:${jobId}`);
    
    if (!jobJson) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Handle both string and object responses from Redis
    const job = typeof jobJson === 'string' ? JSON.parse(jobJson) : jobJson;
    return res.status(200).json(job);
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
}

