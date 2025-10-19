import { useState } from 'react'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { Target, Zap, CheckCircle } from 'lucide-react'
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
    setError(null)

    const payload = {
      recruiterName: formData.recruiterName,
      recruiterEmail: formData.recruiterEmail,
      jobDescription: formData.jobDescription,
    }

    try {
      console.log("Sending data to n8n:", payload)
      
      const res = await fetch("https://kul5.app.n8n.cloud/webhook/from-vercel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      console.log("Response status:", res.status)
      const responseText = await res.text()
      console.log("Response body:", responseText)

      if (res.ok) {
        console.log("✅ Success! Data sent to n8n")
        setIsSubmitted(true)
        setFormData({
          jobDescription: '',
          recruiterName: '',
          recruiterEmail: ''
        })
        setError('')
      } else {
        console.log("❌ Error response:", res.status, responseText)
        setError(`n8n responded with error: ${res.status} - ${responseText}`)
      }
    } catch (err) {
      console.error("❌ Error sending data:", err)
      setError(`Failed to connect to n8n: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
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
                        <span>Processing...</span>
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
