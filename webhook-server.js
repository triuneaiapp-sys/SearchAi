const express = require('express')
const cors = require('cors')
const app = express()
const port = 3001

// Middleware
app.use(cors())
app.use(express.json())

// Store for tracking workflow states
const workflowStates = new Map()

// Webhook endpoint to receive completion notifications from n8n
app.post('/webhook/completion', (req, res) => {
  console.log('Received completion webhook:', req.body)
  
  const { message } = req.body
  
  if (message && message.toLowerCase().includes('workflow was finished')) {
    // Find any waiting workflows and mark them as completed
    let completedCount = 0
    for (const [sessionId, state] of workflowStates.entries()) {
      if (state.status === 'waiting') {
        state.status = 'completed'
        state.completedAt = new Date()
        completedCount++
        console.log(`Marked workflow ${sessionId} as completed`)
      }
    }
    
    res.json({ 
      success: true, 
      message: `Workflow completion registered for ${completedCount} session(s)` 
    })
  } else {
    res.status(400).json({ error: 'Invalid completion message' })
  }
})

// Endpoint to check workflow status
app.get('/webhook/status/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const state = workflowStates.get(sessionId)
  
  if (!state) {
    return res.status(404).json({ error: 'Session not found' })
  }
  
  res.json(state)
})

// Endpoint to register a workflow as started
app.post('/webhook/started', (req, res) => {
  const { sessionId } = req.body
  workflowStates.set(sessionId, {
    status: 'waiting',
    startedAt: new Date()
  })
  
  console.log(`Registered workflow ${sessionId} as started`)
  res.json({ success: true })
})

// Cleanup old sessions (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  for (const [sessionId, state] of workflowStates.entries()) {
    if (state.startedAt < oneHourAgo) {
      workflowStates.delete(sessionId)
      console.log(`Cleaned up old session ${sessionId}`)
    }
  }
}, 5 * 60 * 1000) // Run every 5 minutes

app.listen(port, () => {
  console.log(`Webhook server running at http://localhost:${port}`)
})
