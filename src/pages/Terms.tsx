import { AlertTriangle, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import SiteFooter from '../components/SiteFooter';

export default function Terms() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={`min-h-screen ${isLight ? 'bg-[#97c1a9] text-gray-900' : 'bg-[#0a0a0f] text-white'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors ${isLight ? 'border-gray-200 bg-white/80' : 'border-white/10 bg-[#0a0a0f]/80'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5373f] text-xs font-black tracking-widest text-white shadow-lg">
              SN
            </span>
            <span className={`text-base font-extrabold uppercase tracking-[0.2em] ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Shiv-Naresh
            </span>
            <span className="rounded-full bg-[#e5373f]/20 border border-[#e5373f]/40 px-2 py-0.5 text-[9px] font-bold text-[#e5373f] uppercase">
              Terms
            </span>
          </a>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-full border p-2 text-xs transition-colors ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'}`}
              title="Toggle Dark / Light Mode"
            >
              {isLight ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>
            <a
              href="/pricing"
              className="rounded-full bg-[#e5373f] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors shadow-sm"
            >
              View Plans &rarr;
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <span className="inline-block rounded-full bg-[#e5373f]/15 border border-[#e5373f]/30 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#e5373f]">
            Platform Policies
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Terms of Service & Platform Policies
          </h1>
          <p className="text-xs opacity-60">
            Last Updated: November 2026 &middot; Effective immediately for all registered accounts and purchasers.
          </p>
        </div>

        {/* Highlighted Policy Alert: Strict No-Refund */}
        <div className="mt-10 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 space-y-2">
          <div className="flex items-center gap-2 text-red-500 font-semibold text-sm uppercase tracking-wider">
            <AlertTriangle className="h-4 w-4" />
            <span>Strict no-refund policy</span>
          </div>
          <p className="text-xs leading-relaxed opacity-90">
            All purchases, subscription plan activations, on-demand packages, and studio credit allocations are non-refundable once approved or activated. Digital computing power, generation pipelines, and server allocations are assigned immediately upon transaction submission.
          </p>
        </div>

        {/* Section 1: Third-Party Infrastructure & Manual Fulfillment Guarantee */}
        <div className="mt-10 space-y-8 text-xs leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight text-emerald-400">
              1. Third-Party Neural Computing & Support Team SLA Guarantee
            </h2>
            <p className="opacity-80">
              Shiv-Naresh AI Studio leverages third-party neural network model providers and distributed high-end GPU clusters (including Fashn.ai infrastructure) to generate virtual try-ons and video motion.
            </p>
            <div className="rounded-2xl border p-4 backdrop-blur-sm space-y-2" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <p className="font-semibold text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>The Shiv-Naresh Support Guarantee:</span>
              </p>
              <p className="opacity-80">
                If the automated generative system or third-party computing cluster encounters technical outages, API downtime, or server failure during your active billing month, <strong>our dedicated in-house studio support team and master tailors will manually execute, render, retouch, and deliver every single try-on image and fashion video</strong> up to your purchased plan’s exact quota for that month. You are guaranteed to receive your full quota of completed deliverables.
              </p>
            </div>
          </section>

          {/* Section 2: Plan Quotas & Credit Validity */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">
              2. Plan Quotas, Defined Limits & Monthly Expiration
            </h2>
            <p className="opacity-80">
              Each user plan is strictly defined up to the exact number of credits, photoshoot limits (1 photoshoot = 5 poses; e.g. 15 photoshoots = 75 poses on On-Demand, 50 photoshoots = 250 poses on Pro, 100 photoshoots = 500 poses on Ultra), and video generation quotas allocated for that specific billing month.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 opacity-80">
              <li>
                <strong>Monthly Expiration:</strong> All unused credits, video generation quotas, and photoshoot allotments expire at the conclusion of each monthly billing cycle and do not roll over to subsequent months unless explicitly stated in your agreement.
              </li>
              <li>
                <strong>Accountability:</strong> Users are responsible for utilizing their allocated quotas within the active 30-day billing window.
              </li>
            </ul>
          </section>

          {/* Section 3: Discarded & Regenerated Renders */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">
              3. Generation Accounting & Re-Renders
            </h2>
            <p className="opacity-80">
              Every generation command initiated through the studio (including test renders, unsatisfactory output, prompt variations, and regenerated images or videos) utilizes active GPU cycles and therefore consumes credits according to the engine&apos;s standard allocation rate.
            </p>
            <p className="opacity-80">
              Regenerated or discarded images are accounted as consumed credits. To ensure optimal output quality with minimal credit usage, users are strongly advised to utilize the provided fabric color picker, follow prompt guidelines, and inspect source uploads before initiating generation.
            </p>
          </section>

          {/* Section 4: 1-Hour Modification & Cancellation Grace Window */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">
              4. 1-Hour Modification & Cancellation Grace Window
            </h2>
            <p className="opacity-80">
              For bespoke custom requests submitted to master designers, users have a strictly enforced <strong>1-hour grace window</strong> from the time of submission during which they can edit prompt notes, adjust fabric color codes, replace model poses, or delete the order. After 1 hour has elapsed, the request moves to active tailoring status and cannot be modified or canceled.
            </p>
          </section>

          {/* Section 5: Brand Integrity & Logo Protection */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">
              5. Intellectual Property & Brand Integrity
            </h2>
            <p className="opacity-80">
              All branding, logos, trademarks, and athletic apparel imagery related to <strong>SHIV-NARESH</strong> remain the exclusive intellectual property of Shiv-Naresh and its respective owners. Output generated through the studio may not be utilized to counterfeit, misrepresent, or defame the brand.
            </p>
          </section>

          {/* Section 6: Manual Payment & Activation Policy */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">
              6. Payment Methods & Manual Activation SLA
            </h2>
            <p className="opacity-80">
              All paid plans can be purchased via direct UPI payment QR code (GPay, PhonePe, Paytm, BHIM, Bank UPI). Upon completing the transaction, users must submit their 12-digit UTR/Transaction ID through the checkout portal or via official WhatsApp (+91 6398743132).
            </p>
            <p className="opacity-80">
              Our administrative team validates transaction records and activates account credit balances and video quotas manually <strong>within 30 minutes</strong> of submission during operational hours.
            </p>
          </section>

          {/* Section 7: Client Verification & Responsibility */}
          <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <h2 className="text-lg font-bold tracking-tight text-amber-500 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <span>7. Client Verification &amp; Responsibility</span>
            </h2>
            <p className="opacity-90 font-medium">
              All files, photos, videos, and zip files sent by Admin must be checked and approved by the user before use or printing. Shiv-Naresh is not responsible for any printing, fabric, or business loss if the user uses the files without checking. Any correction must be reported within 24 hours of delivery.
            </p>
            <p className="text-[11px] opacity-75 leading-relaxed">
              Upon the expiration of the 24-hour review window from asset dispatch, all delivered files are deemed definitively accepted, verified, and approved by the client. The studio disclaims all liability for downstream manufacturing, printing, garment fabrication, or marketing costs incurred from unverified file usage.
            </p>
          </section>
        </div>

        {/* Acceptance Callout Box */}
        <div className="mt-12 rounded-3xl border p-8 text-center space-y-4" style={{
          borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
          backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
        }}>
          <h3 className="text-base font-bold">Have Questions Regarding Our Terms?</h3>
          <p className="text-xs opacity-70 max-w-lg mx-auto">
            Our legal and customer support desk is available to clarify any aspect of our service agreements, quotas, or manual fulfillment process.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/contact"
              className="rounded-full bg-[#e5373f] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors shadow"
            >
              Contact Support
            </a>
            <a
              href="https://wa.me/916398743132?text=Hello%20SHIV-NARESH%20Admin%2C%20I%20have%20a%20question%20regarding%20the%20Terms%20of%20Service."
              target="_blank"
              rel="noreferrer"
              className="rounded-full border px-6 py-2.5 text-xs font-bold transition-colors"
              style={{ borderColor: isLight ? '#d1d5db' : 'rgba(255,255,255,0.2)' }}
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
