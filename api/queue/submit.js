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
    const { recruiterName, recruiterEmail, jobDescription } = req.body;

    if (!recruiterName || !recruiterEmail || !jobDescription) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const jobData = {
      id: jobId,
      recruiterName,
      recruiterEmail,
      jobDescription,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    await redis.lpush('webhook_queue', JSON.stringify(jobData));
    await redis.set(`job:${jobId}`, JSON.stringify(jobData));

    console.log(`Job ${jobId} added to queue`);

    processQueue().catch(err => console.error('Queue processing error:', err));

    return res.status(200).json({
      success: true,
      jobId,
      message: 'Request queued successfully',
    });
  } catch (error) {
    console.error('Error adding to queue:', error);
    return res.status(500).json({ error: 'Failed to queue request' });
  }
}

async function processQueue() {
  const isProcessing = await redis.get('queue:processing');
  
  if (isProcessing === 'true') {
    console.log('Queue processor already running');
    return;
  }

  await redis.set('queue:processing', 'true');

  try {
    while (true) {
      const jobJson = await redis.rpop('webhook_queue');
      
      if (!jobJson) {
        break;
      }

      const job = JSON.parse(jobJson);
      console.log(`Processing job ${job.id}`);

      await redis.set(`job:${job.id}`, JSON.stringify({
        ...job,
        status: 'processing',
        startedAt: new Date().toISOString(),
      }));

      try {
        const response = await fetch('https://kul5.app.n8n.cloud/webhook/from-vercel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recruiterName: job.recruiterName,
            recruiterEmail: job.recruiterEmail,
            jobDescription: job.jobDescription,
            jobId: job.id,
          }),
        });

        if (!response.ok) {
          throw new Error(`n8n responded with status ${response.status}`);
        }

        const responseText = await response.text();
        console.log(`Job ${job.id} sent to n8n successfully`);

        await redis.set(`job:${job.id}`, JSON.stringify({
          ...job,
          status: 'sent',
          sentAt: new Date().toISOString(),
        }));

        console.log(`Job ${job.id} marked as sent, moving to next item in queue`);
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        await redis.set(`job:${job.id}`, JSON.stringify({
          ...job,
          status: 'failed',
          error: error.message,
          failedAt: new Date().toISOString(),
        }));
      }
    }
  } finally {
    await redis.set('queue:processing', 'false');
    console.log('Queue processing completed');
  }
}

