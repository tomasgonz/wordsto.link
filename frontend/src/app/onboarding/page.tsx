'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Link2, CheckCircle, ArrowRight, ArrowLeft,
  Sparkles, Target, TrendingUp, Users, Zap, BarChart3
} from 'lucide-react';

const steps = [
  {
    title: 'Welcome to WordsTo.Link! 🎉',
    description: 'Let\'s get you started with creating your first short URL',
    icon: Sparkles
  },
  {
    title: 'Your Use Case',
    description: 'Help us understand how you\'ll use WordsTo.Link',
    icon: Target
  },
  {
    title: 'You\'re All Set!',
    description: 'Start creating memorable short URLs',
    icon: CheckCircle
  }
];

const useCases = [
  { id: 'personal', label: 'Personal Brand', icon: Users, description: 'Share portfolio, social links' },
  { id: 'business', label: 'Business', icon: TrendingUp, description: 'Marketing campaigns, products' },
  { id: 'agency', label: 'Agency', icon: Zap, description: 'Client links, campaigns' },
  { id: 'developer', label: 'Developer', icon: BarChart3, description: 'API integration, automation' }
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedUseCase, setSelectedUseCase] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeOnboarding = async () => {
    setIsCompleting(true);
    
    // Save user preferences (in production, this would be an API call)
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('use_case', selectedUseCase);
    
    toast.success('Welcome aboard! Let\'s create your first URL');
    router.push('/create');
  };

  const skip = () => {
    localStorage.setItem('onboarding_completed', 'true');
    router.push('/dashboard');
  };

  const CurrentIcon = steps[currentStep].icon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex items-center ${index !== steps.length - 1 ? 'flex-1' : ''}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    index <= currentStep
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {index < currentStep ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {index !== steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      index < currentStep ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
              <CurrentIcon className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {steps[currentStep].title}
            </h2>
            <p className="text-gray-600">
              {steps[currentStep].description}
            </p>
          </div>

          {/* Step content */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-6">
                <p className="text-gray-700 mb-4">
                  Welcome <span className="font-semibold">{user?.name}</span>! Your unique identifier is:
                </p>
                <div className="bg-white rounded-lg p-4 border-2 border-primary-200">
                  <p className="text-center font-mono text-lg text-primary-600">
                    wordsto.link/{user?.identifier}/*
                  </p>
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  All your shortened URLs will use this identifier. It's uniquely yours!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Link2 className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-blue-900">Unlimited URLs</p>
                  <p className="text-xs text-blue-700">Create as many as you need</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <BarChart3 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-900">Analytics</p>
                  <p className="text-xs text-green-700">Track every click</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <Zap className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-purple-900">API Access</p>
                  <p className="text-xs text-purple-700">Automate everything</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <p className="text-gray-600 text-center mb-6">
                This helps us personalize your experience
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {useCases.map((useCase) => {
                  const Icon = useCase.icon;
                  return (
                    <button
                      key={useCase.id}
                      onClick={() => setSelectedUseCase(useCase.id)}
                      className={`p-6 rounded-lg border-2 transition-all text-left ${
                        selectedUseCase === useCase.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`w-8 h-8 mb-3 ${
                        selectedUseCase === useCase.id ? 'text-primary-600' : 'text-gray-400'
                      }`} />
                      <h3 className="font-semibold text-gray-900 mb-1">{useCase.label}</h3>
                      <p className="text-sm text-gray-600">{useCase.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  You're ready to go!
                </h3>
                <p className="text-gray-600 mb-6">
                  Let's create your first shortened URL
                </p>
              </div>

              <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Quick Tips:</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2">•</span>
                    Use descriptive keywords for memorable URLs
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2">•</span>
                    Track performance with built-in analytics
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2">•</span>
                    Set expiration dates for time-sensitive links
                  </li>
                  <li className="flex items-start">
                    <span className="text-primary-600 mr-2">•</span>
                    Use the API for bulk operations
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <button
              onClick={currentStep === 0 ? skip : handleBack}
              className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              {currentStep === 0 ? 'Skip' : (
                <>
                  <ArrowLeft className="inline w-4 h-4 mr-1" />
                  Back
                </>
              )}
            </button>

            <button
              onClick={handleNext}
              disabled={currentStep === 1 && !selectedUseCase}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {currentStep === steps.length - 1 ? (
                isCompleting ? 'Getting started...' : 'Get Started'
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-1 w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}