import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 /api/queue/submit - REQUEST RECEIVED');
  console.log('═══════════════════════════════════════════════════════');
  
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check Redis connection
    console.log('🔍 Checking Redis environment variables...');
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.error('❌ Missing Redis environment variables!');
      console.error('KV_REST_API_URL:', process.env.KV_REST_API_URL ? 'SET' : 'MISSING');
      console.error('KV_REST_API_TOKEN:', process.env.KV_REST_API_TOKEN ? 'SET' : 'MISSING');
      return res.status(500).json({ error: 'Redis not configured' });
    }
    console.log('✅ Redis environment variables are set');

    const { recruiterName, recruiterEmail, jobDescription } = req.body;
    console.log('📥 Request body received:', {
      recruiterName,
      recruiterEmail,
      jobDescriptionLength: jobDescription?.length || 0
    });

    if (!recruiterName || !recruiterEmail || !jobDescription) {
      console.log('❌ Missing required fields');
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

    console.log(`📦 Creating job: ${jobId}`);
    console.log(`   Status: ${jobData.status}`);
    console.log(`   Created: ${jobData.createdAt}`);

    // Check queue length before adding
    const queueLengthBefore = await redis.llen('webhook_queue');
    console.log(`📊 Queue length BEFORE adding: ${queueLengthBefore}`);

    console.log(`➕ Adding job ${jobId} to Redis queue...`);
    await redis.lpush('webhook_queue', JSON.stringify(jobData));
    await redis.set(`job:${jobId}`, JSON.stringify(jobData));

    const queueLengthAfter = await redis.llen('webhook_queue');
    console.log(`📊 Queue length AFTER adding: ${queueLengthAfter}`);
    console.log(`✅ Job ${jobId} added to queue successfully`);

    // Process queue sequentially - only one job at a time
    const lockKey = 'queue:processing';
    console.log('🔒 Attempting to acquire processing lock...');
    
    const currentLock = await redis.get(lockKey);
    console.log(`🔍 Current lock status: ${currentLock || 'NOT SET'}`);
    
    // Check if lock exists, if not, set it
    let hasLock = false;
    if (!currentLock) {
      // Lock doesn't exist, try to set it
      await redis.set(lockKey, 'true', { ex: 300 });
      // Verify we got it (check again immediately)
      const verifyLock = await redis.get(lockKey);
      hasLock = verifyLock === 'true';
      console.log(`🔐 Lock set attempt - verification: ${hasLock}`);
    } else {
      console.log(`🔐 Lock already exists, cannot acquire`);
    }
    
    console.log(`🎯 Has lock? ${hasLock}`);
    
    if (hasLock) {
      console.log('✅ LOCK ACQUIRED - Starting queue processing...');
      try {
        await processNextJob();
        console.log('✅ Queue processing completed successfully');
      } catch (processError) {
        console.error('❌ ERROR in queue processing:', processError);
        console.error('Error message:', processError.message);
        console.error('Error stack:', processError.stack);
      } finally {
        console.log('🔓 Releasing lock...');
        await redis.del(lockKey);
        const lockReleased = await redis.get(lockKey);
        console.log(`🔓 Lock released. Verification: ${lockReleased || 'NOT SET (good)'}`);
      }
    } else {
      console.log('⏸️ LOCK NOT ACQUIRED - Another processor should be running');
      console.log(`   Current lock value: ${currentLock}`);
      
      // Check if queue has jobs - if yes and lock is stuck, process anyway
      const queueLength = await redis.llen('webhook_queue');
      console.log(`📊 Current queue length: ${queueLength}`);
      
      if (queueLength > 0) {
        console.log('⚠️  Queue has jobs but lock is held - checking if lock is stale...');
        // Wait a moment and check again - if still locked and queue has items, force process
        await new Promise(resolve => setTimeout(resolve, 1000));
        const stillLocked = await redis.get(lockKey);
        const stillHasJobs = await redis.llen('webhook_queue');
        
        if (stillLocked && stillHasJobs > 0) {
          console.log('⚠️  Lock appears stuck - forcing lock release and processing...');
          await redis.del(lockKey);
          // Try to acquire lock again
          const forceLock = await redis.set(lockKey, 'true', { ex: 300, nx: true });
          if (forceLock === 'OK' || forceLock === true || forceLock === 1) {
            console.log('✅ Force acquired lock, processing queue...');
            try {
              await processNextJob();
            } catch (processError) {
              console.error('❌ Error in forced processing:', processError);
            } finally {
              await redis.del(lockKey);
            }
          }
        } else {
          console.log('✅ Lock was released or queue processed by another request');
        }
      } else {
        console.log('✅ Queue is empty, no processing needed');
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ REQUEST COMPLETE - Job ${jobId} queued`);
    console.log('═══════════════════════════════════════════════════════');
    
    return res.status(200).json({
      success: true,
      jobId,
      message: 'Request queued successfully',
    });
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════');
    console.error('❌ ERROR in /api/queue/submit');
    console.error('═══════════════════════════════════════════════════════');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return res.status(500).json({ error: 'Failed to queue request', details: error.message });
  }
}

async function processNextJob() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 processNextJob() - STARTED');
  console.log('═══════════════════════════════════════════════════════');
  
  let processedCount = 0;
  
  // Process jobs from queue until empty
  while (true) {
    const currentQueueLength = await redis.llen('webhook_queue');
    console.log(`\n📊 Queue Status: ${currentQueueLength} job(s) remaining`);
    console.log(`   Processed so far: ${processedCount}`);
    
    console.log(`🔍 Attempting to pop job from queue...`);
    const jobJson = await redis.rpop('webhook_queue');
    
    if (!jobJson) {
      console.log('✅ Queue is empty - No more jobs to process');
      console.log(`📊 Total jobs processed in this run: ${processedCount}`);
      break;
    }

    processedCount++;
    const job = JSON.parse(jobJson);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 JOB #${processedCount}: ${job.id}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Recruiter: ${job.recruiterName}`);
    console.log(`   Email: ${job.recruiterEmail}`);
    console.log(`   Job Description Length: ${job.jobDescription?.length || 0} chars`);

    const startedAt = new Date().toISOString();
    console.log(`⏱️  Started processing at: ${startedAt}`);
    
    await redis.set(`job:${job.id}`, JSON.stringify({
      ...job,
      status: 'processing',
      startedAt: startedAt,
    }));
    console.log(`✅ Job status updated to: processing`);

    try {
      const n8nUrl = 'https://kul5.app.n8n.cloud/webhook/from-vercel';
      console.log(`\n🌐 SENDING TO N8N`);
      console.log(`   URL: ${n8nUrl}`);
      
      const payload = {
        recruiterName: job.recruiterName,
        recruiterEmail: job.recruiterEmail,
        jobDescription: job.jobDescription,
        jobId: job.id,
      };
      
      console.log(`📤 Payload:`);
      console.log(`   recruiterName: ${payload.recruiterName}`);
      console.log(`   recruiterEmail: ${payload.recruiterEmail}`);
      console.log(`   jobId: ${payload.jobId}`);
      console.log(`   jobDescription: ${payload.jobDescription.substring(0, 100)}...`);
      
      const sendStartTime = Date.now();
      console.log(`⏱️  Sending request at: ${new Date().toISOString()}`);
      
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const sendDuration = Date.now() - sendStartTime;
      console.log(`\n📥 N8N RESPONSE RECEIVED (${sendDuration}ms)`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ N8N ERROR RESPONSE:`);
        console.error(`   Status: ${response.status}`);
        console.error(`   Body: ${errorText}`);
        throw new Error(`n8n responded with status ${response.status}: ${errorText}`);
      }

      const responseText = await response.text();
      console.log(`✅ N8N SUCCESS RESPONSE:`);
      console.log(`   Body: ${responseText}`);
      console.log(`   Duration: ${sendDuration}ms`);

      const sentAt = new Date().toISOString();
      await redis.set(`job:${job.id}`, JSON.stringify({
        ...job,
        status: 'sent',
        sentAt: sentAt,
      }));

      console.log(`✅ Job ${job.id} marked as SENT`);
      console.log(`   Sent at: ${sentAt}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    } catch (error) {
      console.error(`\n❌ ERROR PROCESSING JOB ${job.id}:`);
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      
      const failedAt = new Date().toISOString();
      await redis.set(`job:${job.id}`, JSON.stringify({
        ...job,
        status: 'failed',
        error: error.message,
        failedAt: failedAt,
      }));
      console.error(`   Job marked as FAILED at: ${failedAt}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`✅ processNextJob() - COMPLETED`);
  console.log(`   Total jobs processed: ${processedCount}`);
  console.log('═══════════════════════════════════════════════════════');
}

