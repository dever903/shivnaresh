import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, ShieldCheck, Zap, Sparkles, Building2, HelpCircle, ArrowRight, QrCode, MessageSquare, AlertCircle, ExternalLink, X } from 'lucide-react';
import { useTheme } from '../lib/theme';
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
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [qrMode, setQrMode] = useState<'card' | 'dynamic'>('card');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [localQrSvg, setLocalQrSvg] = useState<string>('');

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
  const upiId = '6398743132@ptaxis';
  const payeeName = 'PAWAN KUMAR';
  const upiPayLink = selectedPlan
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${inrAmount}&cu=INR&tn=${encodeURIComponent(selectedPlan.name + ' Plan')}`
    : `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&cu=INR`;

  useEffect(() => {
    if (!upiPayLink) return;
    QRCode.toString(upiPayLink, {
      type: 'svg',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((svg) => {
        setLocalQrSvg(svg);
      })
      .catch((err) => console.error('QR code generation error:', err));
  }, [upiPayLink]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const waOrderText = `*NEW PLAN SUBSCRIPTION ORDER*
  
*Plan:* ${selectedPlan?.name || 'Pro'}
*Amount:* $${selectedPlan?.priceUSD} (₹${inrAmount.toLocaleString('en-IN')})
*Name:* ${userName.trim() || 'Customer'}
*Email:* ${userEmail.trim() || 'lpawankumar015221684@gmail.com'}
*Transaction ID / UTR:* ${transactionId.trim() || 'Pending verification'}

_Please verify payment and activate my plan within 30 minutes._`;

  const waLink = `https://api.whatsapp.com/send/?phone=916398743132&text=${encodeURIComponent(waOrderText)}`;

  return (
    <div className={`min-h-screen transition-colors duration-200 font-sans antialiased selection:bg-amber-500 selection:text-black ${
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'
    }`}>
      {/* Top Header with Shiv-Naresh Logo (Redirects to Home) & Dark/Light Toggle */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
        isLight ? 'border-gray-200 bg-white/85 shadow-sm' : 'border-white/10 bg-[#0a0a0f]/85'
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">
          <a href="/" className="flex items-center gap-3 group cursor-pointer" title="Return to Home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5373f] text-xs font-black tracking-widest text-white shadow-lg transition-transform group-hover:scale-105">
              SN
            </span>
            <div className="flex flex-col">
              <span className={`text-base font-extrabold uppercase tracking-[0.2em] transition-colors ${
                isLight ? 'text-gray-900 group-hover:text-[#e5373f]' : 'text-white group-hover:text-[#e5373f]'
              }`}>
                Shiv-Naresh
              </span>
              <span className="text-[9px] font-semibold tracking-wider text-amber-500 uppercase -mt-0.5">
                AI Atelier
              </span>
            </div>
            <span className="rounded-full bg-[#e5373f]/15 border border-[#e5373f]/30 px-2 py-0.5 text-[9px] font-bold text-[#e5373f] uppercase hidden sm:inline-block ml-1">
              Pricing &amp; Plans
            </span>
          </a>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-full border p-2 text-xs transition-colors ${
                isLight
                  ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 shadow-sm'
                  : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
              }`}
              title="Toggle Dark / Light Mode"
            >
              {isLight ? '🌙 Dark' : '☀️ Light'}
            </button>
            <a
              href="/design"
              className="rounded-full bg-[#e5373f] px-4 sm:px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-all shadow-md active:scale-95"
            >
              Open Studio &rarr;
            </a>
          </div>
        </div>
      </header>

      {/* Background radial effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent blur-3xl ${
          isLight ? 'opacity-30' : 'opacity-60'
        }`} />
        <div className={`absolute top-1/3 left-0 w-96 h-96 bg-cyan-500/10 blur-3xl ${
          isLight ? 'opacity-20' : 'opacity-40'
        }`} />
        <div className={`absolute top-1/2 right-0 w-96 h-96 bg-purple-500/10 blur-3xl ${
          isLight ? 'opacity-20' : 'opacity-40'
        }`} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold tracking-wider uppercase mb-5 backdrop-blur-sm ${
            isLight
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Transparent Sportswear Atelier Pricing
          </div>
          <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 ${
            isLight ? 'text-gray-900' : 'text-white'
          }`}>
            Invest in High-Velocity <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 bg-clip-text text-transparent">
              Fashion AI Generation
            </span>
          </h1>
          <p className={`text-lg max-w-2xl mx-auto leading-relaxed ${
            isLight ? 'text-gray-600' : 'text-slate-300'
          }`}>
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
                    ? isLight
                      ? 'bg-gradient-to-b from-amber-50/80 via-white to-amber-50/40 border-amber-400 shadow-xl shadow-amber-500/10 ring-1 ring-amber-400 lg:-translate-y-2'
                      : 'bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 border-amber-500/60 shadow-2xl shadow-amber-500/20 ring-1 ring-amber-500/40 lg:-translate-y-2'
                    : isLight
                      ? 'bg-white hover:bg-gray-50/80 border-gray-200 hover:border-gray-300 shadow-md'
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
                    <h3 className={`text-xl font-bold tracking-wide mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>{plan.name}</h3>
                    <p className={`text-xs min-h-[32px] leading-relaxed ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>{plan.tagline}</p>
                  </div>

                  {/* Price Block */}
                  <div className={`py-5 border-y mb-5 ${isLight ? 'border-gray-200' : 'border-slate-800/80'}`}>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-3xl sm:text-4xl font-extrabold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                        ${plan.priceUSD}
                      </span>
                      <span className={`text-xs font-semibold ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>/ month</span>
                    </div>
                    {plan.priceUSD > 0 ? (
                      <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isLight ? 'text-amber-700' : 'text-amber-400/90'}`}>
                        ≈ ₹{inrPrice.toLocaleString('en-IN')} INR <span className={isLight ? 'text-gray-400 font-normal' : 'text-slate-500 font-normal'}>(@ ₹86.50/USD)</span>
                      </p>
                    ) : (
                      <p className={`text-xs font-semibold mt-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>100% Free Signup Forever</p>
                    )}
                  </div>

                  {/* Specifications Highlights */}
                  <div className={`space-y-2.5 mb-6 text-xs rounded-2xl p-3.5 border ${
                    isLight ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-slate-950/60 border-slate-800/60 text-slate-300'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Models:</span>
                      <span className={`font-semibold text-right ${isLight ? 'text-gray-800' : 'text-slate-200'}`}>{plan.specs.models}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Videos:</span>
                      <span className={`font-semibold text-right ${isLight ? 'text-gray-800' : 'text-slate-200'}`}>{plan.specs.videos}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Credits:</span>
                      <span className={`font-bold text-right ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{plan.specs.credits}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Turnaround:</span>
                      <span className={`font-medium text-right ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{plan.specs.delivery}</span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-2.5 mb-8">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>What's Included</p>
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className={`flex items-start gap-2 text-xs leading-relaxed ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>
                        <Check className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call to action */}
                <button
                  onClick={() => handleChoosePlan(plan)}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${plan.featured
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-lg shadow-amber-500/25 active:scale-98'
                    : plan.priceUSD === 0
                      ? isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300' : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                      : isLight ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
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
        <div className={`rounded-3xl border p-8 sm:p-10 mb-20 backdrop-blur-md ${
          isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="max-w-2xl mb-8">
            <h3 className={`text-2xl font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>Why India's Top Activewear Brands Choose SHIV-NARESH AI</h3>
            <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>State-of-the-art neural diffusion architecture fine-tuned specifically for athletic apparel, technical fabrics, and dynamic movement.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-950/60 border-slate-800/60'}`}>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className={`text-base font-bold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>Human Atelier Guarantee</h4>
              <p className={`text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                If the automated neural engine undergoes third-party downtime during your billing month, our in-house fashion design team manually renders your complete quota at no extra cost.
              </p>
            </div>
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-950/60 border-slate-800/60'}`}>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500 mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h4 className={`text-base font-bold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>Zero Credit Waste</h4>
              <p className={`text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                Made a mistake in your uploaded garment? You get a full 1-hour grace window to edit or delete any uploaded pose, image, or queue request without penalty.
              </p>
            </div>
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-950/60 border-slate-800/60'}`}>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-500 mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h4 className={`text-base font-bold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>Full Commercial Copyright</h4>
              <p className={`text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                All generated model poses and videos are 100% royalty-free for commercial billboards, Amazon, Flipkart, Myntra storefronts, and digital ad campaigns.
              </p>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-10">
            <h3 className={`text-2xl font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>Frequently Asked Questions</h3>
            <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>Everything you need to know about billing, quotas, and support</p>
          </div>
          <div className="space-y-4">
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
              <h4 className={`text-sm font-bold mb-1 flex items-center gap-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                <HelpCircle className="w-4 h-4 text-amber-500" />
                How are plans activated after payment?
              </h4>
              <p className={`text-xs leading-relaxed pl-6 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                After completing the UPI payment via QR code, enter your 12-digit UTR / Transaction ID and click "Submit & Send on WhatsApp". Our administration team verifies the transaction and manually activates your plan quotas and credits within 30 minutes.
              </p>
            </div>
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
              <h4 className={`text-sm font-bold mb-1 flex items-center gap-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                <HelpCircle className="w-4 h-4 text-amber-500" />
                What is the refund policy?
              </h4>
              <p className={`text-xs leading-relaxed pl-6 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                We operate a strict No-Refund policy once credits or computational quotas are provisioned. However, because our infrastructure relies on third-party GPU clusters, if any system outage occurs during your billing month, our dedicated support team will manually fulfill every single try-on and video generation for you.
              </p>
            </div>
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
              <h4 className={`text-sm font-bold mb-1 flex items-center gap-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                <HelpCircle className="w-4 h-4 text-amber-500" />
                Do unused credits expire?
              </h4>
              <p className={`text-xs leading-relaxed pl-6 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                Yes, monthly plan credits (300 on On-Demand, 900 on Pro, 500 on Ultra) expire at the end of each 30-day billing cycle to maintain high-throughput cluster availability for all active atelier members.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Terms & Conditions Agreement */}
      {showTermsModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className={`border border-amber-500/40 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative ${
            isLight ? 'bg-white text-gray-900' : 'bg-slate-900 text-white'
          }`}>
            <button
              onClick={() => setShowTermsModal(false)}
              className={`absolute top-5 right-5 p-1 rounded-lg ${
                isLight ? 'text-gray-400 hover:text-gray-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>Terms & Conditions Agreement</h3>
            <p className={`text-xs leading-relaxed mb-4 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
              Before activating the <span className="font-bold text-amber-500">{selectedPlan.name}</span> (${selectedPlan.priceUSD} / ≈ ₹{Math.round(selectedPlan.priceUSD * USD_TO_INR).toLocaleString('en-IN')}), please review our official platform policies:
            </p>
            <div className={`rounded-2xl p-4 border text-xs space-y-2 mb-6 ${
              isLight ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-slate-950/80 border-slate-800 text-slate-300'
            }`}>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Strict No-Refund Policy:</strong> All subscription purchases are final upon provisioning.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Third-Party System Clause:</strong> If external neural clusters face outages, our support team will manually fulfill all your try-on and video quotas for that billing month.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>30-Day Expiry:</strong> Unused credits expire at the end of each billing cycle.</span>
              </div>
            </div>
            <p className={`text-xs mb-6 ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
              Read complete details in our{' '}
              <a href="/terms" target="_blank" className="text-amber-500 underline inline-flex items-center gap-1 font-semibold">
                Terms and Conditions <ExternalLink className="w-3 h-3" />
              </a>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTermsModal(false)}
                className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider ${
                  isLight ? 'border-gray-300 hover:bg-gray-100 text-gray-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
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
          <div className={`border border-amber-500/40 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative my-8 ${
            isLight ? 'bg-white text-gray-900' : 'bg-slate-900 text-white'
          }`}>
            <button
              onClick={() => {
                setShowCheckoutModal(false);
                setSubmitted(false);
                setPaymentDone(false);
                setTransactionId('');
              }}
              className={`absolute top-5 right-5 p-1 rounded-lg ${
                isLight ? 'text-gray-400 hover:text-gray-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] font-bold uppercase tracking-wider mb-2">
                <QrCode className="w-3.5 h-3.5" />
                Instant UPI Payment
              </div>
              <h3 className={`text-xl font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>{selectedPlan.name} Activation</h3>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className={`text-sm line-through ${isLight ? 'text-gray-400' : 'text-slate-400'}`}>${selectedPlan.priceUSD}</span>
                <span className="text-2xl font-black text-amber-500">₹{inrAmount.toLocaleString('en-IN')}</span>
                <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>(INR)</span>
              </div>
            </div>

            {/* Payee & QR Mode Tabs */}
            <div className={`flex items-center justify-center gap-1.5 p-1 rounded-2xl border mb-4 max-w-xs mx-auto ${
              isLight ? 'bg-gray-100 border-gray-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setQrMode('card')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                  qrMode === 'card'
                    ? 'bg-amber-500 text-black shadow-md'
                    : isLight ? 'text-gray-500 hover:text-gray-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                Official Paytm Card
              </button>
              <button
                type="button"
                onClick={() => setQrMode('dynamic')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                  qrMode === 'dynamic'
                    ? 'bg-amber-500 text-black shadow-md'
                    : isLight ? 'text-gray-500 hover:text-gray-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                Instant Amount QR
              </button>
            </div>

            {/* QR Code Container */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center mx-auto w-fit mb-4 text-slate-900 border border-gray-200">
              {qrMode === 'card' ? (
                <div className="text-center max-w-[260px]">
                  <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-slate-50">
                    <img
                      src="/paytm-qr-card.jpg"
                      alt="Pawan Kumar Official Paytm Payment Card"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-100">
                    <p className="text-xs font-black text-slate-900">Pawan Kumar &middot; Verified Merchant</p>
                    <p className="text-[11px] font-mono text-slate-600 font-semibold">{upiId}</p>
                    <p className="text-[10px] text-slate-500">State Bank of India &middot; 9248</p>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  {localQrSvg ? (
                    <div
                      className="w-56 h-56 mx-auto flex items-center justify-center [&>svg]:w-full [&>svg]:h-full rounded-lg shadow-sm bg-white p-2"
                      dangerouslySetInnerHTML={{ __html: localQrSvg }}
                    />
                  ) : (
                    <div className="w-56 h-56 flex flex-col items-center justify-center bg-slate-100 rounded-lg text-xs text-slate-500">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-amber-500 mb-2" />
                      Loading UPI QR...
                    </div>
                  )}
                  <div className="mt-2.5 pt-2 border-t border-slate-200">
                    <p className="text-xs font-extrabold text-slate-900">PAWAN KUMAR &middot; Paytm UPI</p>
                    <p className="text-[11px] font-mono text-slate-600 font-semibold mt-0.5">{upiId}</p>
                    <span className="inline-block mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Auto-bills ₹{inrAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 1-Tap Mobile UPI Payment Link */}
            <a
              href={upiPayLink}
              className="mb-3 block w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-center font-bold text-xs uppercase tracking-wider shadow-md transition active:scale-98"
            >
              ⚡ 1-Tap Open UPI App (GPay / Paytm / PhonePe)
            </a>

            {/* UPI ID Copy Card */}
            <div className={`flex items-center justify-between rounded-xl border p-2.5 mb-3 ${
              isLight ? 'bg-gray-50 border-gray-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <div className="text-left">
                <span className={`text-[10px] uppercase font-bold block ${isLight ? 'text-gray-500' : 'text-slate-500'}`}>Payee UPI ID:</span>
                <span className="text-xs font-mono font-bold text-amber-500 select-all">{upiId}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="py-1 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all active:scale-95"
              >
                {copiedUpi ? '✓ Copied!' : 'Copy UPI'}
              </button>
            </div>

            <p className={`text-[11px] text-center mb-4 ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
              Scan QR or pay to <strong className="text-amber-500 font-mono">{upiId}</strong> (PAWAN KUMAR) ₹{inrAmount.toLocaleString('en-IN')}.
            </p>

            {/* Form Fields */}
            <div className="space-y-3 mb-4">
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                  isLight ? 'text-gray-700' : 'text-slate-300'
                }`}>Your Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className={`w-full border focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs outline-none ${
                    isLight ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400' : 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                  isLight ? 'text-gray-700' : 'text-slate-300'
                }`}>Your Account Email</label>
                <input
                  type="email"
                  placeholder="e.g. rahul@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className={`w-full border focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs outline-none ${
                    isLight ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400' : 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                  isLight ? 'text-gray-700' : 'text-slate-300'
                }`}>12-Digit Transaction ID / UTR Number</label>
                <input
                  type="text"
                  maxLength={25}
                  placeholder="e.g. 431289054321"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className={`w-full border focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs font-mono outline-none tracking-wider ${
                    isLight ? 'bg-gray-50 border-gray-200 text-amber-600 placeholder-gray-400' : 'bg-slate-950 border-slate-800 text-amber-300 placeholder-slate-500'
                  }`}
                />
              </div>

              {/* Checkbox confirmation */}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={paymentDone}
                  onChange={(e) => setPaymentDone(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className={`text-xs leading-snug ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>
                  I have transferred <strong className="text-amber-500">₹{inrAmount.toLocaleString('en-IN')}</strong> to Pawan Kumar via UPI.
                </span>
              </label>
            </div>

            {/* Notice */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 text-center mb-4">
              <p className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold leading-tight">
                ⚡ Under 30 minutes activation: Admin verifies your UTR & adds credits directly.
              </p>
            </div>

            {/* Primary Action Button */}
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSubmitted(true)}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white cursor-pointer shadow-emerald-900/30"
            >
              <MessageSquare className="w-4 h-4" />
              {transactionId.trim() ? 'Submit & Send UTR on WhatsApp →' : 'Send Payment Confirmation on WhatsApp →'}
            </a>

            {/* Direct Support WhatsApp Link Always Visible */}
            <div className={`mt-3 pt-3 border-t text-center ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
              <a
                href={`https://api.whatsapp.com/send/?phone=916398743132&text=${encodeURIComponent(`Hello Pawan Kumar, I have a query about the ${selectedPlan.name} plan on Shiv-Naresh AI Studio.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1.5"
              >
                💬 Need help? Chat with Pawan Kumar directly on WhatsApp (+91 6398743132)
              </a>
            </div>

            {submitted && (
              <div className="mt-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <p className="text-xs text-emerald-400 font-bold">
                  ✓ Order Submitted! Admin will verify and activate your plan within 30 minutes.
                </p>
                <p className="text-[11px] text-slate-300">
                  If WhatsApp didn't open automatically, click the direct link below:
                </p>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider shadow transition"
                >
                  💬 Open WhatsApp Chat (+91 6398743132)
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Embedded Global Luxury Footer */}
      <SiteFooter />
    </div>
  );
}
