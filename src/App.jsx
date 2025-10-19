import { useState } from 'react'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { Users, Target, Zap, CheckCircle } from 'lucide-react'
import './App.css'

function App() {
  const [formData, setFormData] = useState({
    jobDescription: '',
    recruiterName: '',
    recruiterEmail: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)


  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null) // Clear any previous errors

    // Generate a unique sessionId for this submission
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const makeRequest = async (attempt = 1) => {
      try {
        // Construct the URL with query parameters for GET request
        const url = new URL('https://kul5.app.n8n.cloud/webhook-test/27607b39-e0f1-4c92-b139-5e7f8cda24e7')
        url.searchParams.append('jobDescription', formData.jobDescription)
        url.searchParams.append('recruiterName', formData.recruiterName)
        url.searchParams.append('recruiterEmail', formData.recruiterEmail)
        url.searchParams.append('timestamp', new Date().toISOString())
        url.searchParams.append('sessionId', sessionId)
        
        console.log(`Attempt ${attempt}: Sending request to:`, url.toString())
        console.log('Request details:', {
          method: 'GET',
          url: url.toString(),
          headers: { 'Accept': 'application/json' },
          attempt: attempt
        })
        
        // Create AbortController for timeout handling
        // n8n webhooks typically have their own timeout (5-10 minutes)
        // We'll set a longer timeout to account for n8n's processing time
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.log(`Attempt ${attempt}: Request timed out after 12 minutes (n8n webhook timeout)`)
          controller.abort()
        }, 720000) // 12 minute timeout (longer than typical n8n timeout)
        
        // Submit to n8n webhook with timeout
        const response = await fetch(url.toString(), {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        })
        
        clearTimeout(timeoutId)
        console.log(`Attempt ${attempt}: Response received:`, response.status, response.statusText)
        
        if (response.ok) {
          // Check if response contains "done" message
          const responseText = await response.text()
          console.log(`Attempt ${attempt}: Webhook response:`, responseText)
          
          // Parse JSON response if possible
          let responseData = null
          try {
            responseData = JSON.parse(responseText)
            console.log(`Attempt ${attempt}: Parsed response data:`, responseData)
          } catch (e) {
            console.log(`Attempt ${attempt}: Response is not JSON, treating as text`)
          }
          
          // Check if workflow was started
          const isWorkflowStarted = 
            responseText.toLowerCase().includes('workflow was started') ||
            (responseData && responseData.message && responseData.message.toLowerCase().includes('workflow was started'))

          // Check if workflow is finished (for cases where it completes immediately)
          const isWorkflowFinished = 
            responseText.toLowerCase().includes('workflow was finished') ||
            responseText.toLowerCase().includes('done') ||
            responseText.toLowerCase().includes('success') ||
            responseText.toLowerCase().includes('completed') ||
            (responseData && (
              responseData.message && responseData.message.toLowerCase().includes('workflow was finished') ||
              responseData.message && responseData.message.toLowerCase().includes('done') ||
              responseData.status === 'success' ||
              responseData.success === true ||
              responseData.completed === true
            ))
          
          if (isWorkflowStarted) {
            console.log(`Attempt ${attempt}: Workflow started successfully, waiting for completion...`)
            setError(`Workflow started successfully! Please wait for completion (up to 12 minutes)...`)
            
            // Set a timeout to show completion after 10 minutes (simulate workflow completion)
            setTimeout(() => {
              if (isSubmitting) {
                console.log('Simulating workflow completion after 10 minutes')
                setIsSubmitted(true)
                setFormData({
                  jobDescription: '',
                  recruiterName: '',
                  recruiterEmail: ''
                })
                setError('')
                setIsSubmitting(false)
              }
            }, 600000) // 10 minute timeout to simulate workflow completion
            
            return true // Success - we're waiting for the callback
          } else if (isWorkflowFinished) {
            console.log(`Attempt ${attempt}: Success: n8n webhook completed successfully`)
            setIsSubmitted(true)
            setFormData({
              jobDescription: '',
              recruiterName: '',
              recruiterEmail: ''
            })
            setError('')
            return true
          } else {
            console.log(`Attempt ${attempt}: Warning: n8n webhook response does not indicate workflow start or completion`)
            setError(`n8n workflow response unexpected. Response: ${responseText}`)
            return false
          }
        } else {
          console.error(`Attempt ${attempt}: Webhook response not ok:`, response.status)
          
          // Try to get response text for better error message
          try {
            const errorText = await response.text()
            console.log(`Attempt ${attempt}: Error response:`, errorText)
            
            if (response.status === 404 && errorText.includes('not registered')) {
              setError(`n8n webhook not active: Please click "Execute workflow" in n8n to activate the webhook, then try again.`)
              return false
            } else if (response.status === 500 && errorText.includes('cancelled')) {
              setError(`n8n workflow execution was cancelled. Please try again.`)
              return false
            } else if (response.status === 500 && errorText.includes('timeout')) {
              setError(`n8n workflow timed out. The workflow may be taking too long. Please try again.`)
              return false
        } else if (response.status === 500 && errorText.includes('error')) {
          if (errorText.includes('Workflow could not be started')) {
            setError(`n8n workflow error: The workflow cannot be started. Please check your n8n workflow configuration and try again.`)
          } else {
            setError(`n8n workflow error: ${errorText}`)
          }
          return false
        } else {
          setError(`n8n webhook error (${response.status}): ${errorText}`)
          return false
        }
          } catch (e) {
            setError(`Webhook responded with status ${response.status}. Please try again.`)
            return false
          }
        }
      } catch (error) {
        console.error(`Attempt ${attempt}: Error submitting form:`, error)
        
        if (error.name === 'AbortError') {
          console.log(`Attempt ${attempt}: Request timed out after 10 minutes`)
          return false
        } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          console.log(`Attempt ${attempt}: Network error - Failed to fetch`)
          return false
        } else {
          console.log(`Attempt ${attempt}: Other error:`, error.message)
          return false
        }
      }
    }

    // Try up to 3 times with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Starting attempt ${attempt} of 3`)
      setRetryCount(attempt - 1)
      
      const success = await makeRequest(attempt)
      if (success) {
        return // Success, exit the function
      }
      
      // If not the last attempt, wait before retrying
      if (attempt < 3) {
        const waitTime = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
        console.log(`Attempt ${attempt} failed. Waiting ${waitTime}ms before retry...`)
        setError(`Attempt ${attempt} failed. Retrying in ${waitTime/1000} seconds...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    // All attempts failed
    setError(`All 3 attempts failed. The webhook may be taking longer than expected or there may be a network issue. Please try again later.`)
    setIsSubmitting(false)
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
            <p className="text-gray-600 mb-6">
              Your candidate matching request has been submitted successfully. 
              Our AI will process your job description and find the best matches.
            </p>
            <Button 
              onClick={() => setIsSubmitted(false)}
              className="bg-sky-600 hover:bg-sky-700"
            >
              Submit Another Request
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50">


      {/* Hero Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 bg-sky-100 text-sky-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            <span>AI-Powered Candidate Matching</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Find the Perfect
            <span className="text-sky-600"> Candidate Match</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Submit your job description and let our advanced AI system identify the most qualified candidates 
            from our talent pool. Streamline your recruitment process with intelligent matching.
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl text-gray-900">Submit Matching Request</CardTitle>
              <CardDescription className="text-gray-600">
                Provide the job details and your information to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="jobDescription" className="text-sm font-medium text-gray-700">
                    Job Description *
                  </Label>
                  <Textarea
                    id="jobDescription"
                    name="jobDescription"
                    value={formData.jobDescription}
                    onChange={handleInputChange}
                    placeholder="Paste the complete job description here including requirements, responsibilities, qualifications, and any specific skills needed..."
                    className="min-h-[200px] resize-none border-gray-200 focus:border-sky-500 focus:ring-sky-500"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Include all relevant details for accurate candidate matching
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recruiterName" className="text-sm font-medium text-gray-700">
                      Recruiter Name *
                    </Label>
                    <Input
                      id="recruiterName"
                      name="recruiterName"
                      value={formData.recruiterName}
                      onChange={handleInputChange}
                      placeholder="Your full name"
                      className="border-gray-200 focus:border-sky-500 focus:ring-sky-500"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recruiterEmail" className="text-sm font-medium text-gray-700">
                      Triune Email *
                    </Label>
                    <Input
                      id="recruiterEmail"
                      name="recruiterEmail"
                      type="email"
                      value={formData.recruiterEmail}
                      onChange={handleInputChange}
                      placeholder="your.name@triune.com"
                      className="border-gray-200 focus:border-sky-500 focus:ring-sky-500"
                      pattern=".*@triune\..*"
                      title="Please use your Triune email address"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="pt-4">
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                      <p className="text-sm">{error}</p>
                    </div>
                  </div>
                )}

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 text-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
        <span>
          {error && error.includes('Workflow started successfully') 
            ? error 
            : `Processing... ${retryCount > 0 ? `(Attempt ${retryCount + 1}/3)` : ''}`
          }
        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-2">
                        <Target className="h-5 w-5" />
                        <span>Find Candidate Matches</span>
                      </div>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>



      {/* Footer */}
      <footer className="bg-gray-900 text-white py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-gray-400 text-sm">
            © 2024 Triune Informatics. Internal Candidate Matching System.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
