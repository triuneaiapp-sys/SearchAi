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
    // Check Redis connection
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.error('Missing Redis environment variables!');
      console.error('KV_REST_API_URL:', process.env.KV_REST_API_URL ? 'SET' : 'MISSING');
      console.error('KV_REST_API_TOKEN:', process.env.KV_REST_API_TOKEN ? 'SET' : 'MISSING');
      return res.status(500).json({ error: 'Redis not configured' });
    }

    const { recruiterName, recruiterEmail, jobDescription } = req.body;

    if (!recruiterName || !recruiterEmail || !jobDescription) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Received form submission:', { recruiterName, recruiterEmail, jobDescription: jobDescription.substring(0, 50) + '...' });

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const jobData = {
      id: jobId,
      recruiterName,
      recruiterEmail,
      jobDescription,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    console.log(`Adding job ${jobId} to Redis queue...`);
    await redis.lpush('webhook_queue', JSON.stringify(jobData));
    await redis.set(`job:${jobId}`, JSON.stringify(jobData));

    console.log(`Job ${jobId} added to queue successfully`);

    // Send directly to n8n immediately (synchronous) to ensure it runs
    console.log(`Sending job ${jobId} directly to n8n...`);
    try {
      const payload = {
        recruiterName: jobData.recruiterName,
        recruiterEmail: jobData.recruiterEmail,
        jobDescription: jobData.jobDescription,
        jobId: jobData.id,
      };
      
      console.log(`Payload:`, JSON.stringify(payload, null, 2));
      
      const response = await fetch('https://kul5.app.n8n.cloud/webhook/from-vercel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log(`n8n response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`n8n error response: ${errorText}`);
        throw new Error(`n8n responded with status ${response.status}: ${errorText}`);
      }

      const responseText = await response.text();
      console.log(`Job ${jobId} sent to n8n successfully. Response: ${responseText}`);

      await redis.set(`job:${jobId}`, JSON.stringify({
        ...jobData,
        status: 'sent',
        sentAt: new Date().toISOString(),
      }));

      console.log(`Job ${jobId} marked as sent`);
    } catch (error) {
      console.error(`Error sending job ${jobId} to n8n:`, error);
      console.error(`Error stack:`, error.stack);
      await redis.set(`job:${jobId}`, JSON.stringify({
        ...jobData,
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString(),
      }));
      // Still return success to user, but log the error
    }

    return res.status(200).json({
      success: true,
      jobId,
      message: 'Request queued successfully',
    });
  } catch (error) {
    console.error('Error adding to queue:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return res.status(500).json({ error: 'Failed to queue request', details: error.message });
  }
}

async function processNextJob() {
  try {
    await redis.set('queue:processing', 'true');
    
    const jobJson = await redis.rpop('webhook_queue');
    
    if (!jobJson) {
      console.log('No jobs in queue');
      await redis.set('queue:processing', 'false');
      return;
    }

    const job = JSON.parse(jobJson);
    console.log(`Processing job ${job.id}`);

    await redis.set(`job:${job.id}`, JSON.stringify({
      ...job,
      status: 'processing',
      startedAt: new Date().toISOString(),
    }));

    try {
      console.log(`Sending job ${job.id} to n8n webhook: https://kul5.app.n8n.cloud/webhook/from-vercel`);
      
      const payload = {
        recruiterName: job.recruiterName,
        recruiterEmail: job.recruiterEmail,
        jobDescription: job.jobDescription,
        jobId: job.id,
      };
      
      console.log(`Payload:`, JSON.stringify(payload, null, 2));
      
      const response = await fetch('https://kul5.app.n8n.cloud/webhook/from-vercel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log(`n8n response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`n8n error response: ${errorText}`);
        throw new Error(`n8n responded with status ${response.status}: ${errorText}`);
      }

      const responseText = await response.text();
      console.log(`Job ${job.id} sent to n8n successfully. Response: ${responseText}`);

      await redis.set(`job:${job.id}`, JSON.stringify({
        ...job,
        status: 'sent',
        sentAt: new Date().toISOString(),
      }));

      console.log(`Job ${job.id} marked as sent`);
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      console.error(`Error stack:`, error.stack);
      await redis.set(`job:${job.id}`, JSON.stringify({
        ...job,
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString(),
      }));
    } finally {
      await redis.set('queue:processing', 'false');
      console.log('Job processing completed');
    }
  } catch (error) {
    console.error('Critical error in queue processor:', error);
    console.error('Error stack:', error.stack);
    await redis.set('queue:processing', 'false');
  }
}

