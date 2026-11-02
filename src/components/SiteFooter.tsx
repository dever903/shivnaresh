import { useTheme } from '../lib/theme';

export default function SiteFooter() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <footer className={`border-t transition-colors ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-white/10 bg-[#08080a] text-white/70'}`}>
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-4">
            <a href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5373f] text-xs font-black tracking-widest text-white shadow-md">
                SN
              </span>
              <span className={`text-base font-extrabold uppercase tracking-[0.2em] ${isLight ? 'text-gray-900' : 'text-white'}`}>
                Shiv-Naresh
              </span>
              <span className="rounded bg-[#e5373f]/15 border border-[#e5373f]/30 px-1.5 py-0.5 text-[9px] font-bold text-[#e5373f] uppercase">
                AI Studio
              </span>
            </a>
            <p className="text-xs leading-relaxed max-w-sm opacity-70">
              India&apos;s pioneering neural fashion and virtual try-on studio engineered for sportswear athletes, apparel manufacturers, and modern digital merchants.
            </p>
            <div className="pt-2 text-xs">
              <p className="font-semibold text-xs opacity-90">Lead Engineer & Developer:</p>
              <p className="text-[11px] opacity-70">
                <strong>Pawan Kumar</strong> &middot; ARSD College (University of Delhi), B.Sc. CS 3rd Year
              </p>
              <p className="text-[11px] opacity-70 mt-0.5">
                Direct Contact: <a href="tel:+916398743132" className="text-[#e5373f] hover:underline">+91 6398743132</a> &middot; <a href="mailto:lpawankumar015221684@gmail.com" className="hover:underline">lpawankumar015221684@gmail.com</a>
              </p>
            </div>
          </div>

          {/* Studio Navigation */}
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Studio Platform
            </h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <a href="/design" className="hover:text-[#e5373f] transition-colors">
                  Virtual Try-On
                </a>
              </li>
              <li>
                <a href="/design?tab=5pose" className="hover:text-[#e5373f] transition-colors">
                  5-Pose Sequence
                </a>
              </li>
              <li>
                <a href="/design?tab=video" className="hover:text-[#e5373f] transition-colors">
                  Video Runway Studio
                </a>
              </li>
              <li>
                <a href="/design?tab=custom" className="hover:text-[#e5373f] transition-colors">
                  Custom Requests (24-48h SLA)
                </a>
              </li>
              <li>
                <a href="/pricing" className="hover:text-[#e5373f] transition-colors">
                  Pricing &amp; Plans
                </a>
              </li>
            </ul>
          </div>

          {/* Company & Developer */}
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
              About &amp; Developer
            </h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <a href="/about" className="hover:text-[#e5373f] transition-colors">
                  About Developer &amp; Story
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-[#e5373f] transition-colors">
                  Contact &amp; WhatsApp Support
                </a>
              </li>
              <li>
                <a href="/terms" className="hover:text-[#e5373f] transition-colors">
                  Terms &amp; Conditions
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/916398743132?text=Hello%20Pawan,%20I%20have%20an%20inquiry%20regarding%20Shiv-Naresh%20AI%20Studio"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-500 font-semibold hover:underline"
                >
                  WhatsApp: +91 6398743132
                </a>
              </li>
            </ul>
          </div>

          {/* Security & Policies */}
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Service &amp; Policy
            </h3>
            <div className="mt-3 space-y-2 text-xs opacity-75 leading-relaxed">
              <p>
                Strict No-Refund policy once computational GPU clusters are provisioned.
              </p>
              <p className="text-[11px]">
                Third-party system dependency backed by 100% manual team support guarantee.
              </p>
              <div className="pt-2">
                <span className="inline-block rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-600">
                  ⚡ 100% SLA Guarantee
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className={`mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-8 text-xs ${isLight ? 'border-gray-200 text-gray-500' : 'border-white/5 text-white/40'}`}>
          <p>
            &copy; {new Date().getFullYear()} Shiv-Naresh AI Studio. Built with passion by Pawan Kumar (ARSD College, DU).
          </p>
          <div className="flex items-center gap-6">
            <a href="/terms" className="hover:underline">
              Terms of Service
            </a>
            <a href="/contact" className="hover:underline">
              Help Center
            </a>
            <a href="/admin" className="hover:underline text-[11px] opacity-40">
              Admin Access
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
