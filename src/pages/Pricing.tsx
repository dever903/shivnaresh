import { useState } from 'react';
import { Check, ShieldCheck, Zap, Sparkles, Building2, HelpCircle, ArrowRight, QrCode, MessageSquare, AlertCircle, ExternalLink, X } from 'lucide-react';
import SiteFooter from '../components/SiteFooter';

const USD_TO_INR = 86.5;

interface Plan {
  id: string;
  name: string;
  tagline: string;
  priceUSD: number;
  featured?: boolean;
  badge?: string;
  specs: {
    models: string;
    videos: string;
    credits: string;
    bonusCredits?: string;
    delivery: string;
    support: string;
    resolution: string;
  };
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter Trial',
    tagline: 'Instant zero-risk trial for emerging sportswear designers',
    priceUSD: 0,
    specs: {
      models: 'Self-Service Catalog',
      videos: 'Trial Generation',
      credits: '5 Free Credits',
      delivery: 'Instant AI Pipeline',
      support: 'Community Helpdesk',
      resolution: 'Standard HD Neural Quality'
    },
    features: [
      '5 free trial credits upon verified signup',
      'Balanced 2K photorealistic image generation',
      'Standard 5s neural motion video preview',
      'Full access to curated studio model library',
      'SHIV-NARESH verified branding in prompts',
      'Instant AI pipeline access'
    ]
  },
  {
    id: 'ondemand',
    name: 'On-Demand Growth',
    tagline: 'Ideal for seasonal sportswear drops and catalogue shoots',
    priceUSD: 49,
    specs: {
      models: '15 Curated Models (5 Poses Each = 75 High-Res Poses)',
      videos: '4 High-Def Neural Videos (5-10s)',
      credits: '300 Monthly Credits',
      delivery: 'Instant Neural Engine',
      support: 'Priority Email & Chat',
      resolution: 'Balanced 2K Master Quality'
    },
    features: [
      '15 Curated AI Models (each with 5 multi-angle poses = 75 images)',
      '4 High-Def 5-10 second vertical/horizontal sportswear videos',
      '300 active monthly credits (rollover for 30 billing days)',
      'Dual model swap & fabric color accuracy conditioning',
      '1-hour grace window to edit/delete uploaded assets',
      'Priority email & WhatsApp customer support'
    ]
  },
  {
    id: 'pro',
    name: 'Pro Atelier',
    tagline: 'Engineered for top sportswear fashion houses & high-volume ecommerce',
    priceUSD: 120,
    featured: true,
    badge: 'MOST POPULAR',
    specs: {
      models: '40 Models (5 Poses Each = 200 High-Res Poses)',
      videos: '12 Cinematic 1080p Videos',
      credits: '750 Credits + 150 Bonus = 900 Total',
      delivery: 'High-Priority Neural Queue',
      support: 'Direct WhatsApp Account Mgr',
      resolution: 'Ultra 2K Photoreal + 1080p Motion'
    },
    features: [
      '40 Curated Models (each with 5 multi-angle poses = 200 images)',
      '12 Cinematic 1080p Videos (9:16 Reels & 16:9 Sportswear cuts)',
      '750 Monthly Credits + 150 FREE Bonus Credits (900 credits total)',
      'Priority rendering queue for instant zero-wait generation',
      'Dedicated WhatsApp account executive',
      'Iterative prompt refiner with fabric color-matching precision',
      'Zero credit waste: 1-hour grace cancellation window'
    ]
  },
  {
    id: 'ultra',
    name: 'Ultra Haute-Couture',
    tagline: 'Complete digital production house: upload fabrics & receive custom shoot',
    priceUSD: 149,
    badge: 'ENTERPRISE ATELIER',
    specs: {
      models: '70 Custom Models + Full 5-Pose Sets',
      videos: '20 Studio Master Videos',
      credits: '500 Account Credits (Custom shoots free)',
      delivery: 'Guaranteed 24-48h Delivery',
      support: '24/7 Dedicated Human Art Team',
      resolution: 'Highest 2K Master & 1080p Studio Motion'
    },
    features: [
      'Custom Atelier Service: upload cloths & garments in Custom Requests',
      'Our dedicated art team generates 70 Models + 20 Studio Videos delivered within 24-48 hours',
      'Models & studio videos do NOT consume your 500 account credits',
      '500 extra credits in your account for unlimited on-demand experimentation',
      'Post-generation touch-ups, prompt refinements, and multi-pose changes',
      '100% human studio team fulfillment guarantee if neural API undergoes downtime',
      'Direct line to lead fashion director & 24/7 VIP assistance'
    ]
  }
];

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleChoosePlan = (plan: Plan) => {
    if (plan.priceUSD === 0) {
      window.location.href = '/design';
      return;
    }
    setSelectedPlan(plan);
    setShowTermsModal(true);
  };

  const handleAgreeTerms = () => {
    setShowTermsModal(false);
    setShowCheckoutModal(true);
  };

  const inrAmount = selectedPlan ? Math.round(selectedPlan.priceUSD * USD_TO_INR) : 0;
  const upiId = '6398743132@ybl';
  const upiPayLink = selectedPlan 
    ? `upi://pay?pa=${upiId}&pn=SHIVNARESH%20AI&am=${inrAmount}&cu=INR&tn=${encodeURIComponent(selectedPlan.name + ' Plan')}`
    : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiPayLink)}`;

  const handleSendWhatsApp = () => {
    if (!paymentDone || !transactionId.trim()) {
      alert('Please check "I have completed the payment" and provide your 12-digit Transaction ID / UTR.');
      return;
    }
    const message = `*NEW PLAN SUBSCRIPTION ORDER*%0A%0A*Plan:* ${selectedPlan?.name}%0A*Amount:* $${selectedPlan?.priceUSD} (₹${inrAmount.toLocaleString('en-IN')})%0A*Name:* ${userName || 'Customer'}%0A*Email:* ${userEmail || 'Not specified'}%0A*Transaction ID / UTR:* ${transactionId.trim()}%0A%0A_Please verify payment and activate my plan within 30 minutes._`;
    window.open(`https://wa.me/916398743132?text=${message}`, '_blank');
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased selection:bg-amber-500 selection:text-black">
      {/* Background radial effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent blur-3xl opacity-60" />
        <div className="absolute top-1/3 left-0 w-96 h-96 bg-cyan-500/10 blur-3xl opacity-40" />
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-purple-500/10 blur-3xl opacity-40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-5 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Transparent Sportswear Atelier Pricing
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
            Invest in High-Velocity <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-transparent">
              Fashion AI Generation
            </span>
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Eliminate traditional photoshoot overhead. Generate high-resolution 2K model poses and cinematic 1080p motion videos in minutes with full commercial licensing.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5 mb-20">
          {PLANS.map((plan) => {
            const inrPrice = Math.round(plan.priceUSD * USD_TO_INR);
            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 backdrop-blur-xl border ${
                  plan.featured
                    ? 'bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 border-amber-500/60 shadow-2xl shadow-amber-500/20 ring-1 ring-amber-500/40 lg:-translate-y-2'
                    : 'bg-slate-900/70 hover:bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-white tracking-wide mb-1">{plan.name}</h3>
                    <p className="text-xs text-slate-400 min-h-[32px] leading-relaxed">{plan.tagline}</p>
                  </div>

                  {/* Price Block */}
                  <div className="py-5 border-y border-slate-800/80 mb-5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-extrabold text-white">
                        ${plan.priceUSD}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">/ month</span>
                    </div>
                    {plan.priceUSD > 0 ? (
                      <p className="text-xs font-semibold text-amber-400/90 mt-1 flex items-center gap-1">
                        ≈ ₹{inrPrice.toLocaleString('en-IN')} INR <span className="text-slate-500 font-normal">(@ ₹86.50/USD)</span>
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-emerald-400 mt-1">100% Free Signup Forever</p>
                    )}
                  </div>

                  {/* Specifications Highlights */}
                  <div className="space-y-2.5 mb-6 text-xs bg-slate-950/60 rounded-2xl p-3.5 border border-slate-800/60">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Models:</span>
                      <span className="font-semibold text-right text-slate-200">{plan.specs.models}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Videos:</span>
                      <span className="font-semibold text-right text-slate-200">{plan.specs.videos}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Credits:</span>
                      <span className="font-bold text-amber-400 text-right">{plan.specs.credits}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Turnaround:</span>
                      <span className="font-medium text-emerald-400 text-right">{plan.specs.delivery}</span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-2.5 mb-8">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">What's Included</p>
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                        <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call to action */}
                <button
                  onClick={() => handleChoosePlan(plan)}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    plan.featured
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/25 active:scale-98'
                      : plan.priceUSD === 0
                      ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {plan.priceUSD === 0 ? 'Get Started Free' : `Activate ${plan.name}`}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Highlights */}
        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-8 sm:p-10 mb-20 backdrop-blur-md">
          <div className="max-w-2xl mb-8">
            <h3 className="text-2xl font-bold text-white mb-2">Why India's Top Activewear Brands Choose SHIV-NARESH AI</h3>
            <p className="text-sm text-slate-400">State-of-the-art neural diffusion architecture fine-tuned specifically for athletic apparel, technical fabrics, and dynamic movement.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">Human Atelier Guarantee</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                If the automated neural engine undergoes third-party downtime during your billing month, our in-house fashion design team manually renders your complete quota at no extra cost.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">Zero Credit Waste</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Made a mistake in your uploaded garment? You get a full 1-hour grace window to edit or delete any uploaded pose, image, or queue request without penalty.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">Full Commercial Copyright</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                All generated model poses and videos are 100% royalty-free for commercial billboards, Amazon, Flipkart, Myntra storefronts, and digital ad campaigns.
              </p>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold text-white mb-2">Frequently Asked Questions</h3>
            <p className="text-xs text-slate-400">Everything you need to know about billing, quotas, and support</p>
          </div>
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                How are plans activated after payment?
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed pl-6">
                After completing the UPI payment via QR code, enter your 12-digit UTR / Transaction ID and click "Submit & Send on WhatsApp". Our administration team verifies the transaction and manually activates your plan quotas and credits within 30 minutes.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                What is the refund policy?
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed pl-6">
                We operate a strict No-Refund policy once credits or computational quotas are provisioned. However, because our infrastructure relies on third-party GPU clusters, if any system outage occurs during your billing month, our dedicated support team will manually fulfill every single try-on and video generation for you.
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                Do unused credits expire?
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed pl-6">
                Yes, monthly plan credits (300 on On-Demand, 900 on Pro, 500 on Ultra) expire at the end of each 30-day billing cycle to maintain high-throughput cluster availability for all active atelier members.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Terms & Conditions Agreement */}
      {showTermsModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setShowTermsModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Terms & Conditions Agreement</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Before activating the <span className="font-bold text-amber-400">{selectedPlan.name}</span> (${selectedPlan.priceUSD} / ≈ ₹{Math.round(selectedPlan.priceUSD * USD_TO_INR).toLocaleString('en-IN')}), please review our official platform policies:
            </p>
            <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-300 space-y-2 mb-6">
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Strict No-Refund Policy:</strong> All subscription purchases are final upon provisioning.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Third-Party System Clause:</strong> If external neural clusters face outages, our support team will manually fulfill all your try-on and video quotas for that billing month.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span><strong>30-Day Expiry:</strong> Unused credits expire at the end of each billing cycle.</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Read complete details in our{' '}
              <a href="/terms" target="_blank" className="text-amber-400 underline inline-flex items-center gap-1 font-semibold">
                Terms and Conditions <ExternalLink className="w-3 h-3" />
              </a>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTermsModal(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleAgreeTerms}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-xs font-bold uppercase tracking-wider shadow-lg shadow-amber-500/20"
              >
                I Agree & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: UPI QR Code & WhatsApp Payment Submission */}
      {showCheckoutModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative my-8">
            <button
              onClick={() => {
                setShowCheckoutModal(false);
                setSubmitted(false);
                setPaymentDone(false);
                setTransactionId('');
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                <QrCode className="w-3.5 h-3.5" />
                Instant UPI Payment
              </div>
              <h3 className="text-xl font-bold text-white">{selectedPlan.name} Activation</h3>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm text-slate-400 line-through">${selectedPlan.priceUSD}</span>
                <span className="text-2xl font-black text-amber-400">₹{inrAmount.toLocaleString('en-IN')}</span>
                <span className="text-xs text-slate-400">(INR)</span>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="bg-white p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center mx-auto w-fit mb-5">
              <img
                src={qrCodeUrl}
                alt="UPI Payment QR Code"
                className="w-52 h-52 object-contain"
              />
              <p className="text-[11px] font-bold text-slate-800 mt-2 font-mono">UPI ID: {upiId}</p>
            </div>

            <p className="text-[11px] text-center text-slate-400 mb-5">
              Scan with any UPI app (Google Pay, PhonePe, Paytm, BHIM) to pay exactly <strong className="text-white">₹{inrAmount.toLocaleString('en-IN')}</strong>.
            </p>

            {/* Form Fields */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Your Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Pawan Kumar"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Your Registered Account Email</label>
                <input
                  type="email"
                  placeholder="e.g. user@shivnaresh.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">12-Digit Transaction ID / UTR Number</label>
                <input
                  type="text"
                  maxLength={25}
                  placeholder="e.g. 431289054321"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-300 placeholder-slate-500 outline-none tracking-wider"
                />
              </div>

              {/* Checkbox confirmation */}
              <label className="flex items-start gap-2.5 pt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={paymentDone}
                  onChange={(e) => setPaymentDone(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs text-slate-300 leading-snug">
                  I have completed the payment of <strong className="text-amber-400">₹{inrAmount.toLocaleString('en-IN')}</strong> via UPI.
                </span>
              </label>
            </div>

            {/* Notice */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center mb-5">
              <p className="text-[11px] text-amber-300 font-semibold leading-tight">
                ⚡ Under 30 minutes plan will be manually activated by admin after WhatsApp submission.
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={handleSendWhatsApp}
              disabled={!paymentDone || !transactionId.trim()}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all active:scale-98"
            >
              <MessageSquare className="w-4 h-4" />
              Submit & Send on WhatsApp
            </button>

            {submitted && (
              <p className="text-[11px] text-center text-emerald-400 font-semibold mt-3 animate-pulse">
                ✓ WhatsApp opened! Our admin team will verify and activate your credits within 30 minutes.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Embedded Global Luxury Footer */}
      <SiteFooter />
    </div>
  );
}
