import { useEffect, useState } from 'react';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import SiteFooter from '../components/SiteFooter';

export default function About() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [profile, setProfile] = useState<{
    name: string;
    college: string;
    degree: string;
    year: string;
    email: string;
    mobile: string;
    avatar: string;
    bio: string;
  }>({
    name: 'Pawan Kumar',
    college: 'Atma Ram Sanatan Dharma (ARSD) College, University of Delhi',
    degree: 'B.Sc. Computer Science',
    year: '3rd Year Undergraduate Student',
    email: 'lpawankumar015221684@gmail.com',
    mobile: '6398743132',
    avatar: '',
    bio: 'Pawan Kumar is a software engineer and AI researcher currently in his 3rd year studying B.Sc. Computer Science at ARSD College, University of Delhi. He conceptualized and engineered the Shiv-Naresh AI Virtual Try-On Studio to pioneer next-generation athletic e-commerce in India.',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.developerProfile();
        if (res.name) {
          setProfile((prev) => ({
            ...prev,
            ...res,
            college: res.college || prev.college,
            degree: res.degree || prev.degree,
            year: res.year || prev.year,
            email: res.email || prev.email,
            mobile: res.mobile || prev.mobile,
            bio: res.bio || prev.bio,
          }));
        }
      } catch {
        /* fallback to defaults */
      }
    })();
  }, []);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0f] text-white'}`}>
      {/* Navigation Header */}
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
              About
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
              href="/design"
              className="rounded-full bg-[#e5373f] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors shadow"
            >
              Enter Studio &rarr;
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <span className="inline-block rounded-full bg-[#e5373f]/15 border border-[#e5373f]/30 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-[#e5373f]">
            The Innovation & Creator
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            About the Developer & the Studio
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed opacity-70">
            Shiv-Naresh AI Studio was built from the ground up to revolutionize Indian sportswear visualization through high-performance generative models and realistic athletic fitting.
          </p>
        </div>

        {/* Developer Profile Card */}
        <div className="mt-14 overflow-hidden rounded-3xl border backdrop-blur-md transition-all shadow-xl" style={{
          borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)',
          backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
        }}>
          <div className="grid md:grid-cols-3 gap-8 p-8 sm:p-12 items-center">
            {/* Developer Image */}
            <div className="flex flex-col items-center text-center">
              <div className="relative h-48 w-48 overflow-hidden rounded-3xl border-2 border-[#e5373f]/50 shadow-2xl bg-black/40">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="h-full w-full object-cover transition-transform hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#e5373f]/30 to-black text-white p-4">
                    <span className="text-5xl font-black mb-1">PK</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/60">Pawan Kumar</span>
                  </div>
                )}
              </div>
              <span className="mt-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Full-Stack AI Architect
              </span>
            </div>

            {/* Profile Details */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{profile.name}</h2>
                <p className="text-sm font-semibold text-[#e5373f] mt-0.5">
                  {profile.degree} &middot; {profile.year}
                </p>
                <p className="text-xs opacity-75 mt-0.5 font-medium">
                  🏫 {profile.college}
                </p>
              </div>

              <p className="text-xs leading-relaxed opacity-80 pt-2 border-t" style={{ borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}>
                {profile.bio}
              </p>

              {/* Verified Contact Details Grid */}
              <div className="grid sm:grid-cols-2 gap-3 pt-3">
                <div className="rounded-2xl border p-3 text-xs" style={{
                  borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: isLight ? '#ffffff' : 'rgba(0,0,0,0.3)'
                }}>
                  <p className="text-[10px] uppercase font-bold tracking-wider opacity-50">Direct Email</p>
                  <a href={`mailto:${profile.email}`} className="font-semibold text-[#e5373f] hover:underline truncate block mt-0.5">
                    {profile.email}
                  </a>
                </div>

                <div className="rounded-2xl border p-3 text-xs" style={{
                  borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: isLight ? '#ffffff' : 'rgba(0,0,0,0.3)'
                }}>
                  <p className="text-[10px] uppercase font-bold tracking-wider opacity-50">Direct Phone / WhatsApp</p>
                  <a href={`tel:${profile.mobile}`} className="font-semibold text-emerald-500 hover:underline block mt-0.5">
                    +91 {profile.mobile}
                  </a>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <a
                  href={`https://wa.me/91${profile.mobile}?text=Hello%20Pawan%2C%20I%20visited%20the%20Shiv-Naresh%20AI%20Studio%20website.`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors shadow"
                >
                  <span>💬</span> WhatsApp Developer
                </a>
                <a
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-xs font-bold transition-colors"
                  style={{ borderColor: isLight ? '#d1d5db' : 'rgba(255,255,255,0.2)' }}
                >
                  Contact Form &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Story Section */}
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          <div className="rounded-3xl border p-6 space-y-3" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <span className="text-2xl">🏃‍♂️</span>
            <h3 className="text-base font-bold">Athletic-First Architecture</h3>
            <p className="text-xs leading-relaxed opacity-70">
              Unlike generic virtual try-on software, Shiv-Naresh AI is fine-tuned to capture the tension, draping, and sheen of athletic sportswear, tracksuits, jerseys, and high-performance poly-spandex blends.
            </p>
          </div>

          <div className="rounded-3xl border p-6 space-y-3" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <span className="text-2xl">📐</span>
            <h3 className="text-base font-bold">5-Pose Sequential Suite</h3>
            <p className="text-xs leading-relaxed opacity-70">
              Generate front full view, 3/4 angle, profile side, rear view, and athletic motion poses with a single command to power complete e-commerce product carousels.
            </p>
          </div>

          <div className="rounded-3xl border p-6 space-y-3" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <span className="text-2xl">⚡</span>
            <h3 className="text-base font-bold">Master Tailor Guarantee</h3>
            <p className="text-xs leading-relaxed opacity-70">
              If unexpected neural GPU service interruption occurs, our in-house master tailors manually process every try-on and video order within the 24–48 hour turnaround window.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
