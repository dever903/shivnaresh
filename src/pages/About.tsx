import { useEffect, useState } from 'react';
import { Sun, Moon, MessageSquare, GraduationCap, Activity, Layers, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import SiteFooter from '../components/SiteFooter';

export default function About() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.stagger-item'));
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    items.forEach((el, idx) => {
      el.style.transitionDelay = `${idx * 45}ms`;
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

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
    bio: 'Pawan Kumar is a software engineer studying B.Sc. Computer Science at ARSD College, University of Delhi. He engineered the Shiv-Naresh Virtual Try-On Studio to streamline custom athletic wear production and squad kit previews.',
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
    <div className={`min-h-screen overflow-x-hidden ${isLight ? 'bg-[#756357] text-[#F5F2EC]' : 'bg-[var(--ink-0,#0C0C0E)] text-[var(--text-hi,#F5F2EC)]'}`}>
      {/* Navigation Header */}
      <header className={`sticky top-0 z-50 border-b transition-all duration-200 ${
        isLight
          ? scrolled
            ? 'border-gray-300 bg-white/95 backdrop-blur-xl shadow-sm'
            : 'border-gray-200 bg-white/80 backdrop-blur-md'
          : scrolled
          ? 'edge-light border-white/20 bg-[var(--ink-0,#0C0C0E)]/95 backdrop-blur-xl shadow-lg'
          : 'edge-light border-white/10 bg-[var(--ink-0,#0C0C0E)]/80 backdrop-blur-md'
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 py-4">
          <a href="/"data-cursor="OPEN"className="flex items-center gap-2.5 sm:gap-3 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e5373f] text-xs font-semibold text-white">
              SN
            </span>
            <span className={`truncate text-sm font-semibold tracking-wider ${isLight ? 'text-gray-900' : 'text-[var(--text-hi,#F5F2EC)]'}`}>
              Shiv-Naresh
            </span>
            <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium border ${
              isLight ? 'text-[#9e1c23] bg-[#e5373f]/10 border-[#9e1c23]/25' : 'text-[var(--accent,#C9A468)] bg-[var(--accent,#C9A468)]/10 border-[var(--accent,#C9A468)]/25'
            }`}>
              About
            </span>
          </a>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className={`key-press rounded-lg border p-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'}`}
              title="Toggle theme"
            >
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <a
              href="/design"
              data-cursor="DESIGN"
              className="btn-fill-swipe key-press rounded-lg bg-[#e5373f] px-3.5 sm:px-4 py-2 text-xs font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]"
            >
              Enter Studio
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero Section */}
        <div className="stagger-item text-center space-y-3">
          <p className={`text-xs font-semibold ${isLight ? 'text-[#9e1c23]' : 'text-[var(--accent,#C9A468)]'}`}>
            Engineering & background
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            About the Developer & the Studio
          </h1>
          <p className={`mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed ${isLight ? 'text-slate-900/85' : 'opacity-75'}`}>
            Shiv-Naresh AI Studio was built to streamline athletic apparel previews through realistic fitting, multi-angle poses, and bespoke team kit production.
          </p>
        </div>

        {/* Developer Profile Card */}
        <div className={`stagger-item mt-12 overflow-hidden rounded-2xl border transition-colors shadow-sm ${!isLight ? 'edge-light bg-[var(--ink-1,#141418)]' : ''}`} style={{
          borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
          backgroundColor: isLight ? '#f9fafb' : undefined
        }}>
          <div className="grid md:grid-cols-3 gap-8 p-6 sm:p-10 items-center">
            {/* Developer Image */}
            <div className="flex flex-col items-center text-center">
              <div className={`relative h-44 w-44 overflow-hidden rounded-2xl border bg-black/40 ${isLight ? 'border-[#e5373f]/40' : 'border-[var(--accent,#C9A468)]/40'}`}>
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--ink-2,#1C1C22)] text-white p-4">
                    <span className="text-4xl font-semibold mb-1 text-white/90">PK</span>
                    <span className="text-xs text-white/60">Pawan Kumar</span>
                  </div>
                )}
              </div>
              <span className="mt-3 rounded px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20">
                Full-Stack Architect
              </span>
            </div>

            {/* Profile Details */}
            <div className="md:col-span-2 space-y-4 min-w-0">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{profile.name}</h2>
                <p className={`text-xs font-medium mt-0.5 ${isLight ? 'text-[#e5373f]' : 'text-[var(--accent,#C9A468)]'}`}>
                  {profile.degree} &middot; {profile.year}
                </p>
                <div className="flex items-center gap-1.5 text-xs opacity-75 mt-1 font-normal">
                  <GraduationCap size={14} className="shrink-0 text-gray-500" />
                  <span>{profile.college}</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed opacity-80 pt-2 border-t"style={{ borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}>
                {profile.bio}
              </p>

              {/* Verified Contact Details Grid */}
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className={`rounded-xl border p-3 text-xs min-w-0 ${!isLight ? 'edge-light bg-[var(--ink-2,#1C1C22)]' : ''}`} style={{
                  borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: isLight ? '#ffffff' : undefined
                }}>
                  <p className="text-[11px] font-medium text-gray-500">Direct email</p>
                  <a href={`mailto:${profile.email}`} data-cursor="OPEN"className={`link-border-draw font-medium truncate block mt-0.5 ${isLight ? 'text-[#e5373f]' : 'text-[var(--accent,#C9A468)]'}`}>
                    {profile.email}
                  </a>
                </div>

                <div className={`rounded-xl border p-3 text-xs min-w-0 ${!isLight ? 'edge-light bg-[var(--ink-2,#1C1C22)]' : ''}`} style={{
                  borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: isLight ? '#ffffff' : undefined
                }}>
                  <p className="text-[11px] font-medium text-gray-500">Direct phone</p>
                  <a href={`tel:${profile.mobile}`} data-cursor="OPEN"className="link-border-draw font-medium text-emerald-500 block mt-0.5">
                    +91 {profile.mobile}
                  </a>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <a
                  href={`https://wa.me/91${profile.mobile}?text=Hello%20Pawan%2C%20I%20visited%20the%20Shiv-Naresh%20AI%20Studio%20website.`}
                  target="_blank"
                  rel="noreferrer"
                  data-cursor="OPEN"
                  className="key-press inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <MessageSquare size={14} /> Message on WhatsApp
                </a>
                <a
                  href="/contact"
                  data-cursor="OPEN"
                  className="key-press link-border-draw inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]"
                  style={{ borderColor: isLight ? '#d1d5db' : 'rgba(255,255,255,0.2)' }}
                >
                  Contact desk &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Story Section */}
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <div className={`stagger-item rounded-2xl border p-5 space-y-2.5 ${!isLight ? 'edge-light bg-[var(--ink-1,#141418)]' : ''}`} style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : undefined
          }}>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-[#e5373f] flex items-center justify-center">
              <Activity size={16} />
            </div>
            <h3 className="text-sm font-semibold">Athletic garment fit</h3>
            <p className="text-xs leading-relaxed opacity-75">
              Engineered to preserve the fabric drape, seam alignment, and contours of technical activewear and team jerseys on athletic body models.
            </p>
          </div>

          <div className={`stagger-item rounded-2xl border p-5 space-y-2.5 ${!isLight ? 'edge-light bg-[var(--ink-1,#141418)]' : ''}`} style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : undefined
          }}>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Layers size={16} />
            </div>
            <h3 className="text-sm font-semibold">5-Pose multi-angle sequence</h3>
            <p className="text-xs leading-relaxed opacity-75">
              Generate full front view, side profile, rear view, and action angles to preview complete uniform sets before production.
            </p>
          </div>

          <div className={`stagger-item rounded-2xl border p-5 space-y-2.5 ${!isLight ? 'edge-light bg-[var(--ink-1,#141418)]' : ''}`} style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : undefined
          }}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle size={16} />
            </div>
            <h3 className="text-sm font-semibold">Master tailor verification</h3>
            <p className="text-xs leading-relaxed opacity-75">
              Bespoke orders are reviewed and processed directly with our master tailors within a 24 to 48-hour delivery window.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
