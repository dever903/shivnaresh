import { useEffect, useState } from 'react';
import { Sun, Moon, MessageSquare, GraduationCap, Activity, Layers, CheckCircle } from 'lucide-react';
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
    <div className={`min-h-screen ${isLight ? 'bg-[#97c1a9] text-gray-900' : 'bg-[#0a0a0f] text-white'}`}>
      {/* Navigation Header */}
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
              About
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
              href="/design"
              className="rounded-lg bg-[#e5373f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d42d35] transition-colors"
            >
              Enter Studio
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <p className="text-xs font-medium text-[#e5373f]">
            Engineering & background
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            About the Developer & the Studio
          </h1>
          <p className="mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed opacity-75">
            Shiv-Naresh AI Studio was built to streamline athletic apparel previews through realistic fitting, multi-angle poses, and bespoke team kit production.
          </p>
        </div>

        {/* Developer Profile Card */}
        <div className="mt-12 overflow-hidden rounded-2xl border transition-colors shadow-sm" style={{
          borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
          backgroundColor: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)'
        }}>
          <div className="grid md:grid-cols-3 gap-8 p-6 sm:p-10 items-center">
            {/* Developer Image */}
            <div className="flex flex-col items-center text-center">
              <div className="relative h-44 w-44 overflow-hidden rounded-2xl border border-[#e5373f]/40 bg-black/40">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-[#15151b] text-white p-4">
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
            <div className="md:col-span-2 space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{profile.name}</h2>
                <p className="text-xs font-medium text-[#e5373f] mt-0.5">
                  {profile.degree} &middot; {profile.year}
                </p>
                <div className="flex items-center gap-1.5 text-xs opacity-75 mt-1 font-normal">
                  <GraduationCap size={14} className="shrink-0 text-gray-500" />
                  <span>{profile.college}</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed opacity-80 pt-2 border-t" style={{ borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}>
                {profile.bio}
              </p>

              {/* Verified Contact Details Grid */}
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border p-3 text-xs" style={{
                  borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: isLight ? '#ffffff' : 'rgba(0,0,0,0.3)'
                }}>
                  <p className="text-[11px] font-medium text-gray-500">Direct email</p>
                  <a href={`mailto:${profile.email}`} className="font-medium text-[#e5373f] hover:underline truncate block mt-0.5">
                    {profile.email}
                  </a>
                </div>

                <div className="rounded-xl border p-3 text-xs" style={{
                  borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: isLight ? '#ffffff' : 'rgba(0,0,0,0.3)'
                }}>
                  <p className="text-[11px] font-medium text-gray-500">Direct phone</p>
                  <a href={`tel:${profile.mobile}`} className="font-medium text-emerald-600 hover:underline block mt-0.5">
                    +91 {profile.mobile}
                  </a>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <a
                  href={`https://wa.me/91${profile.mobile}?text=Hello%20Pawan%2C%20I%20visited%20the%20Shiv-Naresh%20AI%20Studio%20website.`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                >
                  <MessageSquare size={14} /> Message on WhatsApp
                </a>
                <a
                  href="/contact"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
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
          <div className="rounded-2xl border p-5 space-y-2.5" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-[#e5373f] flex items-center justify-center">
              <Activity size={16} />
            </div>
            <h3 className="text-sm font-semibold">Athletic garment fit</h3>
            <p className="text-xs leading-relaxed opacity-75">
              Engineered to preserve the fabric drape, seam alignment, and contours of technical activewear and team jerseys on athletic body models.
            </p>
          </div>

          <div className="rounded-2xl border p-5 space-y-2.5" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
          }}>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Layers size={16} />
            </div>
            <h3 className="text-sm font-semibold">5-Pose multi-angle sequence</h3>
            <p className="text-xs leading-relaxed opacity-75">
              Generate full front view, side profile, rear view, and action angles to preview complete uniform sets before production.
            </p>
          </div>

          <div className="rounded-2xl border p-5 space-y-2.5" style={{
            borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            backgroundColor: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)'
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
