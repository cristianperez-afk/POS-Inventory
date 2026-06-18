import { useState } from 'react';
import type { AuthenticatedUser } from '../types/auth';
import { login } from '../services/auth';
import { User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import logo from '../../imports/logo1.png';

interface LoginPageProps {
  onLogin: (user: AuthenticatedUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const user = await login(email.trim(), password);
      onLogin(user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-4"
      style={{
        background: 'linear-gradient(135deg, #003534 0%, #005656 50%, #003534 100%)'
      }}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="lava-blob-top absolute left-1/2 top-[-14rem] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle at 35% 35%, rgba(0,222,148,0.95), rgba(0,222,148,0.72) 44%, rgba(0,222,148,0.18) 70%, transparent 78%)',
            boxShadow: 'inset 28px -34px 70px rgba(0,82,65,0.28), inset -24px 30px 70px rgba(170,255,223,0.22), 0 0 38px rgba(0,222,148,0.28)'
          }}
        >
          <span className="lava-droplet lava-droplet-top-to-right" />
        </div>
        <div
          className="lava-blob-right absolute right-[-7rem] top-1/2 h-[18rem] w-[18rem] -translate-y-1/2 rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle at 38% 32%, rgba(0,222,148,0.9), rgba(0,222,148,0.62) 42%, rgba(0,222,148,0.15) 70%, transparent 78%)',
            boxShadow: 'inset 18px -22px 46px rgba(0,82,65,0.24), inset -16px 18px 46px rgba(170,255,223,0.18), 0 0 30px rgba(0,222,148,0.22)'
          }}
        >
          <span className="lava-droplet lava-droplet-right-to-top" />
        </div>
        <div
          className="lava-blob-bottom absolute bottom-[-4rem] left-1/2 h-[13rem] w-[13rem] -translate-x-1/2 rounded-full opacity-55"
          style={{
            background: 'radial-gradient(circle at 42% 36%, rgba(0,222,148,0.92), rgba(0,222,148,0.64) 40%, rgba(0,222,148,0.16) 68%, transparent 78%)',
            boxShadow: 'inset 14px -18px 34px rgba(0,82,65,0.24), inset -12px 14px 34px rgba(170,255,223,0.18), 0 0 24px rgba(0,222,148,0.24)'
          }}
        >
          <span className="lava-droplet lava-droplet-bottom-to-left" />
        </div>
        <div
          className="lava-blob-left absolute left-[-9rem] top-1/2 h-[24rem] w-[24rem] -translate-y-1/2 rounded-full opacity-45"
          style={{
            background: 'radial-gradient(circle at 34% 34%, rgba(0,222,148,0.88), rgba(0,222,148,0.58) 45%, rgba(0,222,148,0.14) 71%, transparent 80%)',
            boxShadow: 'inset 24px -30px 60px rgba(0,82,65,0.22), inset -20px 24px 60px rgba(170,255,223,0.16), 0 0 34px rgba(0,222,148,0.2)'
          }}
        >
          <span className="lava-droplet lava-droplet-left-to-bottom" />
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,122,94,0.05)] to-transparent" />
        <div className="absolute left-1/2 top-20 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-[rgba(0,122,94,0.05)] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 bg-cyan-400/5 blur-3xl" />
      </div>

      {/* Glass-morphism login card */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl backdrop-blur-xl"
        style={{
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        {/* Header */}
        <div className="mb-1 text-center">
          <div
            className="mx-auto mb-2 flex h-32 w-32 items-center justify-center"
          >
            <img src={logo} alt="N&Ns Logo" className="h-32 w-32 object-contain" />
          </div>
          <h1
            className="mb-2 text-[28px]"
            style={{
              color: '#f1f5f9',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              letterSpacing: 0
            }}
          >
            Sign In
          </h1>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Log in to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              className="block mb-2 text-sm"
              style={{ color: '#94a3b8' }}
            >
              Email
            </label>
            <div className="relative">
              <User
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: '#94a3b8' }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input w-full pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f1f5f9'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#008967';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,137,103,0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.target.style.boxShadow = 'none';
                }}
                placeholder="Enter email address"
                required
              />
            </div>
          </div>

          <div>
            <label
              className="block mb-2 text-sm"
              style={{ color: '#94a3b8' }}
            >
              Password
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: '#94a3b8' }}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input w-full pl-10 pr-12 py-3 rounded-xl focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f1f5f9'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#008967';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,137,103,0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.target.style.boxShadow = 'none';
                }}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
                style={{ color: '#94a3b8' }}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-sm"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#fca5a5'
              }}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#ef4444' }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-white transition-all disabled:cursor-not-allowed disabled:opacity-70 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #008967 0%, #003534 100%)',
              fontWeight: 600
            }}
            disabled={isSubmitting}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #00a777 0%, #005656 100%)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 208, 132, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #008967 0%, #003534 100%)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
            onMouseDown={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 208, 132, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1), inset 0 2px 5px rgba(0, 0, 0, 0.3)';
                const ripple = document.createElement('span');
                ripple.className = 'absolute rounded-full bg-white/30 animate-ripple';
                const rect = e.currentTarget.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = x + 'px';
                ripple.style.top = y + 'px';
                e.currentTarget.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
              }
            }}
            onMouseUp={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 208, 132, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes blobMorph {
          0% {
            transform: translate(0px, 0px) scale(0.96) rotate(0deg);
            border-radius: 47% 53% 61% 39% / 44% 58% 42% 56%;
          }
          22% {
            transform: translate(22px, 42px) scale(1.08) rotate(10deg);
            border-radius: 58% 42% 45% 55% / 61% 38% 62% 39%;
          }
          46% {
            transform: translate(58px, -18px) scale(0.98) rotate(24deg);
            border-radius: 41% 59% 57% 43% / 39% 64% 36% 61%;
          }
          70% {
            transform: translate(-18px, 36px) scale(1.12) rotate(36deg);
            border-radius: 62% 38% 39% 61% / 51% 43% 57% 49%;
          }
          100% {
            transform: translate(0px, 0px) scale(0.96) rotate(0deg);
            border-radius: 47% 53% 61% 39% / 44% 58% 42% 56%;
          }
        }
        @keyframes blobMorphAlt {
          0% {
            transform: translate(0px, 0px) scale(1) rotate(0deg);
            border-radius: 55% 45% 48% 52% / 62% 38% 58% 42%;
          }
          30% {
            transform: translate(-34px, 28px) scale(1.14) rotate(-14deg);
            border-radius: 43% 57% 61% 39% / 45% 61% 39% 55%;
          }
          62% {
            transform: translate(18px, 62px) scale(0.92) rotate(-28deg);
            border-radius: 60% 40% 42% 58% / 58% 43% 57% 42%;
          }
          100% {
            transform: translate(0px, 0px) scale(1) rotate(0deg);
            border-radius: 55% 45% 48% 52% / 62% 38% 58% 42%;
          }
        }
        @keyframes blobMorphSmall {
          0% {
            transform: translate(0px, 0px) scale(0.9) rotate(0deg);
            border-radius: 48% 52% 41% 59% / 44% 54% 46% 56%;
          }
          40% {
            transform: translate(46px, -38px) scale(1.2) rotate(20deg);
            border-radius: 61% 39% 58% 42% / 52% 42% 58% 48%;
          }
          72% {
            transform: translate(-18px, -68px) scale(0.96) rotate(34deg);
            border-radius: 42% 58% 47% 53% / 60% 39% 61% 40%;
          }
          100% {
            transform: translate(0px, 0px) scale(0.9) rotate(0deg);
            border-radius: 48% 52% 41% 59% / 44% 54% 46% 56%;
          }
        }
        @keyframes blobMorphWide {
          0% {
            transform: translate(0px, 0px) scale(1.04) rotate(0deg);
            border-radius: 62% 38% 52% 48% / 46% 61% 39% 54%;
          }
          26% {
            transform: translate(-54px, -20px) scale(0.94) rotate(12deg);
            border-radius: 44% 56% 64% 36% / 58% 42% 49% 51%;
          }
          58% {
            transform: translate(-18px, -74px) scale(1.12) rotate(30deg);
            border-radius: 58% 42% 39% 61% / 43% 55% 45% 57%;
          }
          100% {
            transform: translate(0px, 0px) scale(1.04) rotate(0deg);
            border-radius: 62% 38% 52% 48% / 46% 61% 39% 54%;
          }
        }
        .lava-blob-top {
          animation: blobMorph 18s ease-in-out infinite, clockwiseDriftTop 36s ease-in-out infinite, topBlobExchange 34s ease-in-out infinite;
        }
        .lava-blob-right {
          animation: blobMorphAlt 15s ease-in-out infinite -4s, counterClockwiseDriftRight 34s ease-in-out infinite, rightBlobExchange 34s ease-in-out infinite;
        }
        .lava-blob-bottom {
          animation: blobMorphSmall 13s ease-in-out infinite -8s, clockwiseDriftBottom 32s ease-in-out infinite, bottomBlobExchange 38s ease-in-out infinite;
        }
        .lava-blob-left {
          animation: blobMorphWide 20s ease-in-out infinite -11s, counterClockwiseDriftLeft 38s ease-in-out infinite, leftBlobExchange 38s ease-in-out infinite;
        }
        .lava-droplet {
          position: absolute;
          display: block;
          height: 4.75rem;
          width: 4.75rem;
          border-radius: 48% 52% 58% 42% / 45% 58% 42% 55%;
          background: radial-gradient(circle at 35% 35%, rgba(0,222,148,0.98), rgba(0,222,148,0.72) 48%, rgba(0,222,148,0.18) 74%, transparent 82%);
          box-shadow: inset 8px -10px 20px rgba(0,82,65,0.24), inset -8px 10px 20px rgba(170,255,223,0.16), 0 0 18px rgba(0,222,148,0.24);
          opacity: 0;
        }
        .lava-droplet-top-to-right {
          left: 62%;
          top: 58%;
          animation: transferTopToRight 34s ease-in-out infinite;
        }
        .lava-droplet-right-to-top {
          left: 12%;
          top: 26%;
          animation: transferRightToTop 34s ease-in-out infinite;
        }
        .lava-droplet-left-to-bottom {
          left: 70%;
          top: 46%;
          animation: transferLeftToBottom 38s ease-in-out infinite;
        }
        .lava-droplet-bottom-to-left {
          left: 18%;
          top: 18%;
          animation: transferBottomToLeft 38s ease-in-out infinite;
        }
        @keyframes transferTopToRight {
          0%, 8% {
            opacity: 0;
            transform: translate(0, 0) scale(0.25);
          }
          17% {
            opacity: 0.95;
            transform: translate(18px, 12px) scale(0.5);
          }
          36% {
            opacity: 0.9;
            transform: translate(230px, 165px) scale(0.78);
            border-radius: 58% 42% 46% 54% / 52% 42% 58% 48%;
          }
          49% {
            opacity: 0.45;
            transform: translate(340px, 245px) scale(0.36);
          }
          56%, 100% {
            opacity: 0;
            transform: translate(358px, 258px) scale(0.12);
          }
        }
        @keyframes transferRightToTop {
          0%, 52% {
            opacity: 0;
            transform: translate(0, 0) scale(0.22);
          }
          61% {
            opacity: 0.9;
            transform: translate(-18px, -12px) scale(0.5);
          }
          78% {
            opacity: 0.85;
            transform: translate(-260px, -180px) scale(0.78);
            border-radius: 56% 44% 48% 52% / 44% 58% 42% 56%;
          }
          91% {
            opacity: 0.4;
            transform: translate(-378px, -262px) scale(0.34);
          }
          98%, 100% {
            opacity: 0;
            transform: translate(-394px, -276px) scale(0.12);
          }
        }
        @keyframes transferLeftToBottom {
          0%, 10% {
            opacity: 0;
            transform: translate(0, 0) scale(0.24);
          }
          20% {
            opacity: 0.92;
            transform: translate(22px, 10px) scale(0.52);
          }
          39% {
            opacity: 0.86;
            transform: translate(225px, 120px) scale(0.74);
            border-radius: 42% 58% 55% 45% / 60% 40% 57% 43%;
          }
          53% {
            opacity: 0.38;
            transform: translate(354px, 190px) scale(0.34);
          }
          60%, 100% {
            opacity: 0;
            transform: translate(374px, 204px) scale(0.12);
          }
        }
        @keyframes transferBottomToLeft {
          0%, 54% {
            opacity: 0;
            transform: translate(0, 0) scale(0.22);
          }
          63% {
            opacity: 0.9;
            transform: translate(-18px, -8px) scale(0.5);
          }
          80% {
            opacity: 0.84;
            transform: translate(-230px, -118px) scale(0.76);
            border-radius: 58% 42% 46% 54% / 52% 42% 58% 48%;
          }
          93% {
            opacity: 0.38;
            transform: translate(-360px, -188px) scale(0.34);
          }
          99%, 100% {
            opacity: 0;
            transform: translate(-380px, -202px) scale(0.12);
          }
        }
        @keyframes topBlobExchange {
          0%, 12% {
            width: 30rem;
            height: 30rem;
          }
          46%, 58% {
            width: 21rem;
            height: 21rem;
          }
          92%, 100% {
            width: 30rem;
            height: 30rem;
          }
        }
        @keyframes rightBlobExchange {
          0%, 12% {
            width: 18rem;
            height: 18rem;
          }
          46%, 58% {
            width: 26rem;
            height: 26rem;
          }
          92%, 100% {
            width: 18rem;
            height: 18rem;
          }
        }
        @keyframes leftBlobExchange {
          0%, 14% {
            width: 24rem;
            height: 24rem;
          }
          48%, 60% {
            width: 16rem;
            height: 16rem;
          }
          94%, 100% {
            width: 24rem;
            height: 24rem;
          }
        }
        @keyframes bottomBlobExchange {
          0%, 14% {
            width: 13rem;
            height: 13rem;
          }
          48%, 60% {
            width: 21rem;
            height: 21rem;
          }
          94%, 100% {
            width: 13rem;
            height: 13rem;
          }
        }
        @keyframes clockwiseDriftTop {
          0%, 100% {
            translate: -50% 0;
          }
          25% {
            translate: calc(-50% + 42px) 38px;
          }
          50% {
            translate: calc(-50% + 18px) 86px;
          }
          75% {
            translate: calc(-50% - 46px) 36px;
          }
        }
        @keyframes counterClockwiseDriftRight {
          0%, 100% {
            translate: 0 -50%;
          }
          25% {
            translate: -42px calc(-50% - 34px);
          }
          50% {
            translate: -86px calc(-50% + 12px);
          }
          75% {
            translate: -38px calc(-50% + 56px);
          }
        }
        @keyframes clockwiseDriftBottom {
          0%, 100% {
            translate: -50% 0;
          }
          25% {
            translate: calc(-50% - 34px) -30px;
          }
          50% {
            translate: calc(-50% + 10px) -76px;
          }
          75% {
            translate: calc(-50% + 48px) -22px;
          }
        }
        @keyframes counterClockwiseDriftLeft {
          0%, 100% {
            translate: 0 -50%;
          }
          25% {
            translate: 42px calc(-50% + 38px);
          }
          50% {
            translate: 88px calc(-50% - 8px);
          }
          75% {
            translate: 34px calc(-50% - 58px);
          }
        }
        @keyframes ripple {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .animate-ripple {
          animation: ripple 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}
