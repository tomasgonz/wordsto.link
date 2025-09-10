'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function VerifyEmailSentPage() {
  const [email, setEmail] = useState<string>('');
  const [resending, setResending] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(true);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    // Get email from localStorage (set during signup)
    const pendingEmail = localStorage.getItem('pendingEmail');
    if (pendingEmail) {
      setEmail(pendingEmail);
    }

    // Start countdown for resend button
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleResendEmail = async () => {
    if (!email) {
      toast.error('Email address not found. Please sign up again.');
      return;
    }

    setResending(true);
    
    try {
      const apiUrl = typeof window !== 'undefined' 
        ? `http://${window.location.hostname}:3000/api`
        : 'http://localhost:3000/api';
      
      const response = await fetch(`${apiUrl}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        toast.success('Verification email resent! Please check your inbox.');
        setResendDisabled(true);
        setCountdown(60);
        
        // Restart countdown
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              setResendDisabled(false);
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast.error('Failed to resend email. Please try again.');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Check Your Email
            </h2>
            
            <p className="text-gray-600 mb-6">
              We've sent a verification email to:
            </p>
            
            {email && (
              <p className="text-lg font-medium text-gray-900 mb-6">
                {email}
              </p>
            )}
            
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <CheckCircle className="w-5 h-5 text-blue-600 inline mr-2" />
              <span className="text-sm text-blue-800">
                Click the verification link in your email to activate your account
              </span>
            </div>
            
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <p>Didn't receive the email?</p>
                <ul className="mt-2 space-y-1 text-left">
                  <li>• Check your spam folder</li>
                  <li>• Make sure you entered the correct email</li>
                  <li>• Wait a few minutes and try again</li>
                </ul>
              </div>
              
              <button
                onClick={handleResendEmail}
                disabled={resendDisabled || resending}
                className={`w-full py-2 px-4 border rounded-lg text-sm font-medium transition-colors ${
                  resendDisabled || resending
                    ? 'border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50'
                    : 'border-primary-600 text-primary-600 hover:bg-primary-50'
                }`}
              >
                {resending ? (
                  <>
                    <RefreshCw className="w-4 h-4 inline mr-2 animate-spin" />
                    Resending...
                  </>
                ) : resendDisabled ? (
                  `Resend email (${countdown}s)`
                ) : (
                  'Resend verification email'
                )}
              </button>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 mb-3">
                  Already verified your email?
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium"
                >
                  Go to Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Need help?{' '}
            <a href="mailto:support@wordsto.link" className="text-primary-600 hover:text-primary-500">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}