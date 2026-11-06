import { useEffect, useState } from 'react';
import { Sun, Moon, MessageSquare, Phone, Mail, Clock } from 'lucide-react';
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
    <div className={`min-h-screen ${isLight ? 'bg-[#97c1a9] text-gray-900' : 'bg-[#0a0a0f] text-white'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors ${isLight ? 'border-gray-200 bg-white/80' : 'border-white/10 bg-[#0a0a0f]/80'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5373f] text-xs font-semibold text-white">
              SN
            </span>
            <span className={`text-sm font-semibold tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Shiv-Naresh
            </span>
            <span className="rounded px-2 py-0.5 text-[10px] font-medium text-[#e5373f] bg-[#e5373f]/10 border border-[#e5373f]/20">
              Contact
            </span>
          </a>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-lg border p-2 text-xs transition-colors ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'}`}
              title="Toggle theme"
            >
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <a
              href="/pricing"
              className="rounded-lg bg-[#e5373f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d42d35] transition-colors"
            >
              View plans
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center space-y-3">
          <p className="text-xs font-medium text-[#e5373f]">
            Support & direct inquiries
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Get in Touch With Our Studio
          </h1>
          <p className="mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed opacity-75">
            Questions regarding squad kit orders, multi-angle sequences, UPI payment, or manual account activation.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-5">
          {/* Left: Contact Info Cards */}
          <div className="md:col-span-2 space-y-4">
            {/* WhatsApp Direct Card */}
            <div className="rounded-2xl border p-5 space-y-3" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">WhatsApp support</h3>
                  <p className="text-[11px] opacity-60">Replies usually within minutes</p>
                </div>
              </div>
              <p className="text-xs opacity-75">
                Send your payment confirmation or 12-digit transaction ID directly to our desk for immediate verification.
              </p>
              <a
                href={`https://api.whatsapp.com/send/?phone=91${profile.mobile}&text=${encodeURIComponent('Hello SHIV-NARESH Admin, I need support with AI Studio.')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <MessageSquare size={14} /> Open WhatsApp chat
              </a>
            </div>

            {/* Official Mobile */}
            <div className="rounded-2xl border p-5 space-y-1.5" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <div className="flex items-center gap-2 text-xs opacity-60">
                <Phone size={13} />
                <span className="font-medium">Direct phone</span>
              </div>
              <a href={`tel:+91${profile.mobile}`} className="text-lg font-mono font-semibold text-[#e5373f] hover:underline block">
                +91 {profile.mobile}
              </a>
              <p className="text-[11px] opacity-60">Available 9:00 AM &ndash; 11:00 PM IST</p>
            </div>

            {/* Official Email */}
            <div className="rounded-2xl border p-5 space-y-1.5" style={{
              borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
            }}>
              <div className="flex items-center gap-2 text-xs opacity-60">
                <Mail size={13} />
                <span className="font-medium">Inquiries & billing</span>
              </div>
              <a href={`mailto:${profile.email}`} className="text-xs font-medium text-[#e5373f] hover:underline block truncate">
                {profile.email}
              </a>
              <p className="text-[11px] opacity-60">General inquiries and partnerships</p>
            </div>

            {/* Turnaround Guarantee */}
            <div className={`rounded-2xl border p-4 text-xs space-y-1 ${
              isLight ? 'border-amber-400 bg-amber-100 text-amber-950 font-medium' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}>
              <div className="flex items-center gap-1.5 font-semibold">
                <Clock size={14} />
                <span>30-minute activation</span>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                After transferring via UPI, submit your 12-digit transaction ID on the checkout page or send it on WhatsApp. Account credits are activated promptly upon receipt.
              </p>
            </div>
          </div>

          {/* Right: Interactive Contact Form */}
          <div className="md:col-span-3 rounded-2xl border p-6 sm:p-8 transition-colors shadow-sm" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <h2 className="text-lg font-semibold tracking-tight">Send a message</h2>
            <p className="text-xs opacity-60 mt-0.5">
              Fill in your details below to dispatch your message to our desk.
            </p>

            {sent && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 space-y-1.5">
                <p className="font-semibold">Message prepared. WhatsApp chat is ready.</p>
                <p className="text-[11px] opacity-80">If WhatsApp did not open automatically, click below:</p>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                >
                  <MessageSquare size={13} /> Open WhatsApp chat
                </a>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
              <div>
                <label className="text-xs font-medium opacity-70">Full name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-xs focus:outline-none transition-colors ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                  }`}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium opacity-70">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-xs focus:outline-none transition-colors ${
                      isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium opacity-70">Mobile number</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-xs focus:outline-none transition-colors ${
                      isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium opacity-70">Topic</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-xs focus:outline-none transition-colors ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                  }`}
                >
                  <option value="Plan Activation / Payment Inquiry">Plan activation and payment confirmation</option>
                  <option value="Bespoke Athletic Custom Request">Custom athletic kit request</option>
                  <option value="Credit Limit Increase">Credit limit increase or upgrade</option>
                  <option value="Enterprise Sportswear Partnership">Sportswear club partnership</option>
                  <option value="Technical Support">Technical support</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium opacity-70">Message</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Details, transaction ID, or design specifications"
                  className={`mt-1 w-full rounded-xl border p-3.5 text-xs focus:outline-none transition-colors ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/50 text-white focus:border-white/30'
                  }`}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#e5373f] py-2.5 text-xs font-semibold text-white hover:bg-[#d42d35] transition-colors"
              >
                Send message via WhatsApp
              </button>
            </form>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
