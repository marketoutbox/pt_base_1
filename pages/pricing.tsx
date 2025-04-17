"use client"

import { useState } from "react"
import { Check } from "lucide-react"

export default function Pricing() {
  const [message, setMessage] = useState({ text: "", type: "" })

  const pricingPlans = [
    {
      name: "Monthly",
      price: 79,
      period: "month",
      description: "Flexible month-to-month subscription",
      features: [
        "Full access to all platform features",
        "Advanced pair analysis",
        "Unlimited watchlists",
        "1-year historical data",
        "Advanced backtesting",
        "Custom indicators",
        "Priority email support",
        "API access",
      ],
      cta: "Start Monthly Plan",
    },
    {
      name: "Quarterly",
      price: 199,
      period: "quarter",
      description: "Save with quarterly billing",
      popular: true,
      features: [
        "Full access to all platform features",
        "Advanced pair analysis",
        "Unlimited watchlists",
        "1-year historical data",
        "Advanced backtesting",
        "Custom indicators",
        "Priority email support",
        "API access",
      ],
      saving: "Save 16%",
      cta: "Start Quarterly Plan",
    },
    {
      name: "Annual",
      price: 699,
      period: "year",
      description: "Maximum savings with annual billing",
      features: [
        "Full access to all platform features",
        "Advanced pair analysis",
        "Unlimited watchlists",
        "1-year historical data",
        "Advanced backtesting",
        "Custom indicators",
        "Priority email support",
        "API access",
        "2 free strategy consultations",
      ],
      saving: "Save 26%",
      cta: "Start Annual Plan",
    },
  ]

  const handleSubscribe = (planName) => {
    setMessage({
      text: `You selected the ${planName} plan. This is a placeholder for the payment process.`,
      type: "success",
    })
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-5xl font-bold text-white">Pricing</h1>
        <p className="text-lg sm:text-xl text-gray-300">Choose the billing plan that works for you</p>
      </div>

      {message.text && (
        <div
          className={`p-3 sm:p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-900/30 text-green-300 border border-green-800"
              : message.type === "error"
                ? "bg-red-900/30 text-red-300 border border-red-800"
                : "bg-yellow-900/30 text-yellow-300 border border-yellow-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card p-3 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-8 text-center">Select Your Plan</h2>

        <div className="grid grid-cols-1 gap-6 sm:gap-8">
          {pricingPlans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-xl overflow-hidden ${
                plan.popular ? "border-2 border-gold-400 shadow-lg shadow-gold-400/10" : "border border-navy-700"
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-gold-400 text-navy-950 px-3 py-1 text-xs sm:text-sm font-medium">
                  Most Popular
                </div>
              )}
              <div
                className={`p-4 sm:p-6 ${plan.popular ? "bg-gradient-to-b from-navy-800 to-navy-900" : "bg-navy-800/50"}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="flex items-end mb-2 sm:mb-4">
                      <span className="text-2xl sm:text-4xl font-bold text-gold-400">${plan.price}</span>
                      <span className="text-gray-300 ml-1 sm:ml-2">/{plan.period}</span>
                    </div>
                    {plan.saving && (
                      <div className="inline-block bg-green-900/30 text-green-300 px-2 py-0.5 rounded-md text-xs sm:text-sm font-medium mb-2 sm:mb-4">
                        {plan.saving}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleSubscribe(plan.name)}
                    className={`px-3 py-2 sm:px-4 sm:py-3 rounded-md text-sm sm:text-base font-medium transition-colors ${
                      plan.popular
                        ? "bg-gold-400 hover:bg-gold-500 text-navy-950"
                        : "bg-navy-700 hover:bg-navy-600 text-white"
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
                <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6">{plan.description}</p>
              </div>
              <div className="p-4 sm:p-6 bg-navy-900/50">
                <p className="font-medium text-white mb-3 sm:mb-4 text-sm sm:text-base">What's included:</p>
                <ul className="space-y-2 sm:space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm sm:text-base text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-navy-800/50 rounded-lg border border-navy-700">
          <p className="text-center text-sm sm:text-base text-gray-300">
            All plans include a 14-day free trial. No credit card required to start.
          </p>
        </div>
      </div>

      <div className="card p-3 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 gap-4 sm:gap-8">
          <div>
            <h3 className="text-base sm:text-lg font-medium text-gold-400 mb-1 sm:mb-2">Can I change plans later?</h3>
            <p className="text-sm sm:text-base text-gray-300">
              Yes, you can switch between monthly, quarterly, or annual billing at any time. Changes will be applied at
              the start of your next billing cycle.
            </p>
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-medium text-gold-400 mb-1 sm:mb-2">Is there a free trial?</h3>
            <p className="text-sm sm:text-base text-gray-300">
              We offer a 14-day free trial for all plans. No credit card required to start your trial.
            </p>
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-medium text-gold-400 mb-1 sm:mb-2">
              What payment methods do you accept?
            </h3>
            <p className="text-sm sm:text-base text-gray-300">
              We accept all major credit cards, PayPal, and bank transfers for annual plans.
            </p>
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-medium text-gold-400 mb-1 sm:mb-2">
              Can I cancel my subscription?
            </h3>
            <p className="text-sm sm:text-base text-gray-300">
              You can cancel your subscription at any time. You'll continue to have access until the end of your current
              billing period.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
