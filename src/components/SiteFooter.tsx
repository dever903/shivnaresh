import { useTheme } from '../lib/theme';

export default function SiteFooter() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <footer className={`border-t transition-colors ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-white/10 bg-[#08080a] text-white/70'}`}>
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-3">
            <a href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e5373f] text-xs font-semibold text-white">
                SN
              </span>
              <span className={`text-sm font-semibold tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
                Shiv-Naresh
              </span>
              <span className="rounded bg-[#e5373f]/10 border border-[#e5373f]/20 px-1.5 py-0.5 text-[9px] font-medium text-[#e5373f]">
                Studio
              </span>
            </a>
            <p className="text-xs leading-relaxed max-w-sm opacity-70">
              Technical athletic fashion and virtual try-on studio engineered for sportswear teams, apparel manufacturers, and modern digital merchants.
            </p>
            <div className="pt-2 text-xs">
              <p className="font-medium text-xs opacity-90">Developer & engineering:</p>
              <p className="text-[11px] opacity-70">
                Pawan Kumar &middot; ARSD College (University of Delhi), B.Sc. CS 3rd Year
              </p>
              <p className="text-[11px] opacity-70 mt-0.5">
                Contact: <a href="tel:+916398743132" className="text-[#e5373f] hover:underline">+91 6398743132</a> &middot; <a href="mailto:lpawankumar015221684@gmail.com" className="hover:underline">lpawankumar015221684@gmail.com</a>
              </p>
            </div>
          </div>

          {/* Studio Navigation */}
          <div>
            <h3 className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Platform
            </h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <a href="/design" className="hover:text-[#e5373f] transition-colors">
                  Virtual try-on
                </a>
              </li>
              <li>
                <a href="/design?tab=5pose" className="hover:text-[#e5373f] transition-colors">
                  5-Pose sequence
                </a>
              </li>
              <li>
                <a href="/design?tab=video" className="hover:text-[#e5373f] transition-colors">
                  Video runway studio
                </a>
              </li>
              <li>
                <a href="/design?tab=custom" className="hover:text-[#e5373f] transition-colors">
                  Custom requests (24-48h)
                </a>
              </li>
              <li>
                <a href="/pricing" className="hover:text-[#e5373f] transition-colors">
                  Pricing &amp; plans
                </a>
              </li>
            </ul>
          </div>

          {/* Company & Developer */}
          <div>
            <h3 className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
              About &amp; support
            </h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <a href="/about" className="hover:text-[#e5373f] transition-colors">
                  About &amp; background
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-[#e5373f] transition-colors">
                  Contact &amp; WhatsApp
                </a>
              </li>
              <li>
                <a href="/terms" className="hover:text-[#e5373f] transition-colors">
                  Terms &amp; conditions
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/916398743132?text=Hello%20Pawan,%20I%20have%20an%20inquiry%20regarding%20Shiv-Naresh%20AI%20Studio"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 font-medium hover:underline"
                >
                  WhatsApp: +91 6398743132
                </a>
              </li>
            </ul>
          </div>

          {/* Security & Policies */}
          <div>
            <h3 className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Policy
            </h3>
            <div className="mt-3 space-y-2 text-xs opacity-75 leading-relaxed">
              <p>
                No-refund policy applies once computational rendering clusters are provisioned.
              </p>
              <p className="text-[11px]">
                Orders are backed by our master tailor fulfillment window.
              </p>
              <div className="pt-1.5">
                <span className="inline-block rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  SLA fulfillment window
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
