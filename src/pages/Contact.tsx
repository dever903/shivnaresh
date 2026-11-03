import { useEffect, useState } from 'react';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import SiteFooter from '../components/SiteFooter';

export default function Contact() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [profile, setProfile] = useState({
    name: 'Pawan Kumar',
    email: 'lpawankumar015221684@gmail.com',
    mobile: '6398743132',
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('Plan Activation / Payment Inquiry');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.developerProfile();
        if (res.name) {
          setProfile({
            name: res.name || 'Pawan Kumar',
            email: res.email || 'lpawankumar015221684@gmail.com',
            mobile: res.mobile || '6398743132',
          });
        }
      } catch {
        /* fallback to defaults */
      }
    })();
  }, []);

  const waText = `Hello SHIV-NARESH Support,

Name: ${name || 'Customer'}
Email: ${email || 'Not specified'}
Phone: ${phone || 'Not specified'}
Subject: ${subject}
Message: ${message}`;

  const waUrl = `https://api.whatsapp.com/send/?phone=91${profile.mobile}&text=${encodeURIComponent(waText)}`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
    const win = window.open(waUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = waUrl;
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isLight ? 'bg-[#97c1a9] text-gray-900' : 'bg-[#0a0a0f] text-white'}`}>
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
              Contact
            </span>
          </a>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-full border p-2 text-xs transition-colors ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'}`}
              title="Toggle Dark / Light Mode"
            >
              {isLight ? '🌙' : '☀️'}
            </button>
            <a
              href="/pricing"
              className="rounded-full bg-[#e5373f] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors shadow"
            >
              View Plans &rarr;
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center space-y-4">
          <span className="inline-block rounded-full bg-[#e5373f]/15 border border-[#e5373f]/30 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-[#e5373f]">
            24/7 Support & Rapid Plan Activation
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Get in Touch With Our Studio
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed opacity-70">
            Have questions regarding bespoke athletic kits, custom 5-pose rendering, payment via UPI, or manual plan activation? Our team is directly reachable.
          </p>
        </div>

        <div className="mt-14 grid gap-10 md:grid-cols-5">
          {/* Left: Contact Info Cards */}
          <div className="md:col-span-2 space-y-4">
            {/* WhatsApp Direct Card */}
            <div className="rounded-3xl border p-6 space-y-3" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-xl font-bold">
                  💬
                </span>
                <div>
                  <h3 className="text-sm font-bold">WhatsApp Direct Support</h3>
                  <p className="text-[11px] opacity-60">Immediate response within minutes</p>
                </div>
              </div>
              <p className="text-xs opacity-75">
                Send your payment screenshot or 12-digit transaction ID directly to our master admin for fast account activation.
              </p>
              <a
                href={`https://api.whatsapp.com/send/?phone=91${profile.mobile}&text=${encodeURIComponent('Hello SHIV-NARESH Admin, I need support with AI Studio.')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-500 transition-colors shadow-lg"
              >
                <span>⚡</span> Open WhatsApp Chat
              </a>
            </div>

            {/* Official Mobile */}
            <div className="rounded-3xl border p-6 space-y-2" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <p className="text-[10px] uppercase font-bold tracking-wider opacity-50">Direct Calling Line</p>
              <a href={`tel:+91${profile.mobile}`} className="text-xl font-mono font-bold text-[#e5373f] hover:underline block">
                +91 {profile.mobile}
              </a>
              <p className="text-[11px] opacity-60">Available 9:00 AM &ndash; 11:00 PM IST</p>
            </div>

            {/* Official Email */}
            <div className="rounded-3xl border p-6 space-y-2" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <p className="text-[10px] uppercase font-bold tracking-wider opacity-50">Inquiry & Billing Email</p>
              <a href={`mailto:${profile.email}`} className="text-sm font-semibold hover:underline block truncate text-[#e5373f]">
                {profile.email}
              </a>
              <p className="text-[11px] opacity-60">General inquiries, partnership & billing</p>
            </div>

            {/* Turnaround Guarantee */}
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 text-xs text-amber-500 space-y-1">
              <span className="font-bold block">⏱️ 30-Minute Plan Activation</span>
              <p className="text-[11px] opacity-90 leading-relaxed">
                After paying via UPI, submit your 12-digit transaction ID on the checkout page or send it to our WhatsApp number. Your plan credits and video quota will be activated within 30 minutes!
              </p>
            </div>
          </div>

          {/* Right: Interactive Contact Form */}
          <div className="md:col-span-3 rounded-3xl border p-8 backdrop-blur-md shadow-xl" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <h2 className="text-xl font-bold tracking-tight">Send an Official Message</h2>
            <p className="text-xs opacity-60 mt-0.5">
              Fill in your inquiry below to immediately dispatch it to our admin desk.
            </p>

            {sent && (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-xs text-emerald-400 space-y-2">
                <p className="font-bold">✓ Message constructed! Your WhatsApp chat is ready.</p>
                <p className="text-[11px] text-white/70">If WhatsApp did not open automatically, click the direct button below:</p>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white uppercase tracking-wider hover:bg-emerald-500 transition shadow"
                >
                  💬 Open WhatsApp Chat (+91 {profile.mobile})
                </a>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Yashveer Singh"
                  className={`mt-1.5 w-full rounded-2xl border px-4 py-2.5 text-xs focus:outline-none transition-colors ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                  }`}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={`mt-1.5 w-full rounded-2xl border px-4 py-2.5 text-xs focus:outline-none transition-colors ${
                      isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Mobile Number (WhatsApp) *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className={`mt-1.5 w-full rounded-2xl border px-4 py-2.5 text-xs focus:outline-none transition-colors ${
                      isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Subject / Category</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={`mt-1.5 w-full rounded-2xl border px-4 py-2.5 text-xs focus:outline-none transition-colors ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                  }`}
                >
                  <option value="Plan Activation / Payment Inquiry">Plan Activation / Payment Confirmation</option>
                  <option value="Bespoke Athletic Custom Request">Bespoke Athletic Custom Request (24-48h)</option>
                  <option value="Credit Limit Increase">Credit Limit Increase / Upgrade</option>
                  <option value="Enterprise Sportswear Partnership">Enterprise Sportswear Partnership</option>
                  <option value="Technical Support">Technical Support / Bug Report</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Your Message / Inquiry *</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Provide any details, your transaction ID, or specific athletic design instructions..."
                  className={`mt-1.5 w-full rounded-2xl border p-4 text-xs focus:outline-none transition-colors ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                  }`}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-[#e5373f] py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors shadow-lg"
              >
                Send Message via WhatsApp &rarr;
              </button>
            </form>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
