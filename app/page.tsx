export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-yellow-50">
      {/* Header */}
      <header className="px-8 py-6">
        <nav className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-8 h-8 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l9 4.5v9L12 21l-9-4.5v-9L12 3z" />
              <path d="M12 12l9-4.5M12 12v9M12 12L3 7.5" />
            </svg>
            <span className="text-2xl font-bold text-gray-900">Applihero</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-700">
            <a href="#" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Pricing</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Company</a>
          </div>
          <div className="flex items-center space-x-4">
            <a href="/login" className="text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors">Sign in</a>
            <a href="/signup" className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-all">
              Start free trial
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column */}
          <div>
            <h1 className="text-6xl lg:text-7xl font-bold leading-tight mb-8">
              <span className="bg-gradient-to-r from-purple-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                AI-powered
              </span>
              <br />
              <span className="text-gray-900">coaching to land</span>
              <br />
              <span className="text-gray-900">your dream job.</span>
            </h1>
            <p className="text-lg text-gray-600 mb-10 max-w-xl leading-relaxed">
              Applihero uses a personalized RAG model on your resume and background to coach you through every step of the job application process, from cover letters to interview prep.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="/signup" className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 transition-all">
                Get started
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a href="/dashboard" className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-gray-800 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all">
                How it works
              </a>
            </div>
          </div>

          {/* Right Column - Card */}
          <div className="relative">
            <div className="rounded-3xl bg-white/80 backdrop-blur-xl shadow-2xl p-8 border border-gray-100">
              {/* Header */}
              <div className="flex items-center justify-between pb-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">SP</span>
                  </div>
                  <span className="font-semibold text-gray-900 text-lg">Senior Product Manager</span>
                </div>
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  <span>Match: 94%</span>
                </div>
              </div>

              {/* Resume Bullet Points */}
              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-700 mb-4">AI-Generated Resume Bullet Points:</p>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-indigo-600 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-gray-700 leading-relaxed">
                      Spearheaded a cross-functional team to launch 3 major product features, resulting in a 25% increase in user engagement.
                    </span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-indigo-600 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-gray-700 leading-relaxed">
                      Analyzed market data to identify a new customer segment, leading to a product line expansion that captured 15% market share.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Interview Prep */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-sm font-semibold text-gray-700 mb-4">Interview Prep Question:</p>
                <div className="rounded-xl bg-gray-50/80 p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-4">
                    &quot;Tell me about a time you had to make a decision with incomplete data.&quot;
                  </p>
                  <div className="flex items-start space-x-3 bg-white/50 rounded-lg p-3">
                    <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      <strong className="text-gray-900">AI Tip:</strong> Use the STAR method. Structure your answer by describing the Situation, Task, Action you took, and the Result of your action.
                    </p>
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <div className="mt-6">
                <a href="/login"><button className="w-full inline-flex items-center justify-center rounded-xl bg-gray-900 px-6 py-4 text-sm font-semibold text-white shadow-lg hover:bg-gray-800 transition-all">
                  Generate More Insights
                </button></a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}