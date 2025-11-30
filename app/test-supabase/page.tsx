"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function TestPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runTests();
  }, []);

  async function runTests() {
    const testResults: any[] = [];

    // Test 1: Environment Variables
    testResults.push({
      name: "Environment Variables",
      status: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✓" : "✗",
      details: `URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "Set" : "Missing"}, Key: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Set" : "Missing"}`,
    });

    // Test 2: Database Connection
    try {
      const { error } = await supabase.from("profiles").select("count").limit(1);
      testResults.push({
        name: "Database Connection",
        status: error ? "✗" : "✓",
        details: error ? error.message : "Connected successfully",
      });
    } catch (err: any) {
      testResults.push({
        name: "Database Connection",
        status: "✗",
        details: err.message,
      });
    }

    // Test 3: Tables Exist
    const tables = ["profiles", "jobs", "questions", "chat_messages", "job_documents"];
    
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select("count").limit(1);
        testResults.push({
          name: `Table: ${table}`,
          status: error ? "✗" : "✓",
          details: error ? error.message : "Table exists and accessible",
        });
      } catch (err: any) {
        testResults.push({
          name: `Table: ${table}`,
          status: "✗",
          details: err.message,
        });
      }
    }

    // Test 4: Auth State
    try {
      const { data: { user } } = await supabase.auth.getUser();
      testResults.push({
        name: "Current User",
        status: user ? "✓" : "⚠",
        details: user ? `Logged in as ${user.email}` : "Not logged in (this is OK)",
      });
    } catch (err: any) {
      testResults.push({
        name: "Current User",
        status: "✗",
        details: err.message,
      });
    }

    setResults(testResults);
    setLoading(false);
  }

  const allPassed = results.every(r => r.status === "✓" || (r.name === "Current User" && r.status === "⚠"));

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Supabase Connection Test</h1>
          <p className="text-gray-600">
            Testing your Supabase setup and database connection
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white/80 backdrop-blur-xl shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Running tests...</p>
          </div>
        ) : (
          <>
            <div className={`rounded-xl p-6 mb-6 ${allPassed ? 'bg-green-100 border-2 border-green-300' : 'bg-red-100 border-2 border-red-300'}`}>
              <h2 className={`text-xl font-bold ${allPassed ? 'text-green-800' : 'text-red-800'}`}>
                {allPassed ? '✅ All Tests Passed!' : '❌ Some Tests Failed'}
              </h2>
              <p className={`mt-1 ${allPassed ? 'text-green-700' : 'text-red-700'}`}>
                {allPassed 
                  ? 'Your Supabase setup is working correctly. You can now use authentication and database features.'
                  : 'Please check the failed tests below and verify your Supabase setup.'}
              </p>
            </div>

            <div className="space-y-4">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="rounded-xl bg-white/80 backdrop-blur-xl shadow-lg p-6 border border-gray-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-2xl ${
                          result.status === "✓" ? "text-green-500" : 
                          result.status === "⚠" ? "text-yellow-500" : 
                          "text-red-500"
                        }`}>
                          {result.status}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {result.name}
                        </h3>
                      </div>
                      <p className={`text-sm ml-11 ${
                        result.status === "✓" ? "text-gray-600" : 
                        result.status === "⚠" ? "text-yellow-700" : 
                        "text-red-700"
                      }`}>
                        {result.details}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl bg-blue-50 border border-blue-200 p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Next Steps:</h3>
              <ul className="space-y-2 text-blue-800 text-sm">
                <li className="flex items-start gap-2">
                  <span className="font-bold mt-0.5">1.</span>
                  <span>If all tests passed, try signing up at <a href="/signup" className="underline font-semibold">/signup</a></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold mt-0.5">2.</span>
                  <span>After signup, check your Supabase Dashboard → Database → profiles to see your profile</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold mt-0.5">3.</span>
                  <span>If any tests failed, check the SETUP_CHECKLIST.md for troubleshooting steps</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 flex gap-4">
              <button
                onClick={runTests}
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Run Tests Again
              </button>
              <a
                href="/signup"
                className="rounded-lg border-2 border-indigo-600 px-6 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                Go to Signup
              </a>
              <a
                href="/dashboard"
                className="rounded-lg border-2 border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
