'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import NextLink from 'next/link';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // State to track whether the sidebar is collapsed (completely hidden on desktop)
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load session collapse state safely on client mount
  useEffect(() => {
    const saved = sessionStorage.getItem('crm-sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
    setMounted(true);
  }, []);

  // Save state on change
  const handleToggleSidebar = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    sessionStorage.setItem('crm-sidebar-collapsed', String(nextCollapsed));
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Keyboard navigation: Escape key closes drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email || 'User');
      }
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
    },
    {
      name: 'Clients',
      href: '/clients',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      name: 'Personal Information',
      href: '/personal-information',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans">
      {/* Floating expand button (when sidebar is completely collapsed/hidden on desktop) */}
      {isCollapsed && mounted && (
        <button
          onClick={handleToggleSidebar}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="fixed top-6 left-4 z-20 hidden md:flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-slate-900 text-slate-100 border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
            C
          </div>
          <span className="font-bold text-lg tracking-tight text-white">SmarTrack CRM</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          className="p-2 text-slate-400 hover:text-white transition-colors outline-none focus:ring-2 focus:ring-blue-500 focus:rounded-lg"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[69px] z-20 bg-slate-950/95 backdrop-blur-lg flex flex-col justify-between p-6 animate-fade-in text-white">
          <nav className="space-y-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
              return (
                <NextLink
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600/20 to-cyan-500/20 border border-blue-500/30 text-white font-medium shadow-lg shadow-blue-500/5'
                      : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </NextLink>
              );
            })}
          </nav>
          
          <div className="space-y-4 border-t border-slate-900 pt-6">
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white text-sm shadow-inner">
                {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs text-slate-500 font-medium">LOGGED IN AS</span>
                <span className="text-sm font-semibold text-slate-300 truncate">{userEmail}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-rose-500/20 rounded-xl bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 transition-all duration-300 text-sm font-semibold"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (directly transitions width to ensure no layout offset issues) */}
      <aside className={`hidden md:flex flex-col justify-between transition-all duration-300 bg-slate-900 text-slate-100 border-r border-slate-800 sticky top-0 h-screen z-40 overflow-hidden ${
        isCollapsed && mounted ? 'w-0 p-0 border-r-0' : 'w-60 p-4'
      }`}>
        <div className="w-[208px] flex-shrink-0 flex flex-col h-full justify-between">
          <div>
            {/* Logo / Header area */}
            <div className="flex items-center mb-8 px-1 justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 flex-shrink-0">
                  C
                </div>
                <span className="font-extrabold text-sm tracking-tight text-white truncate">
                  SmarTrack CRM
                </span>
              </div>

              <button
                onClick={handleToggleSidebar}
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
                return (
                  <NextLink
                    key={item.name}
                    href={item.href}
                    className={`flex items-center rounded-xl border transition-all duration-300 group focus:ring-2 focus:ring-blue-500 focus:outline-none px-4 py-2.5 gap-3 w-full ${
                      isActive
                        ? 'bg-blue-600/15 border-blue-500/20 text-white font-semibold shadow-lg shadow-blue-500/5'
                        : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span className={`transition-transform duration-300 group-hover:scale-105 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                      {item.icon}
                    </span>
                    <span className="text-sm truncate">{item.name}</span>
                  </NextLink>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer User Info & Logout */}
          <div className="space-y-4 border-t border-slate-800 pt-6">
            <div className="flex items-center gap-3 px-2 py-1 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-extrabold text-white text-xs shadow-md shadow-blue-500/15 flex-shrink-0">
                {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Session Profile</span>
                <span className="text-xs font-semibold text-slate-200 truncate">{userEmail}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              aria-label="Sign Out"
              className="flex items-center justify-center border border-rose-500/20 rounded-xl bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 font-semibold transition-all duration-300 text-sm active:scale-[0.98] focus:ring-2 focus:ring-rose-500 focus:outline-none w-full gap-3 px-4 py-2.5"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="truncate">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative overflow-hidden">
        {/* Background glow spots */}
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-slate-200/40 blur-[120px] pointer-events-none" />
        
        {/* Adjusted left padding when sidebar is completely collapsed/hidden to provide space for the floating expand button */}
        <div className={`flex-1 overflow-y-auto px-6 py-8 md:py-10 relative z-10 transition-all duration-300 ${
          isCollapsed && mounted ? 'md:pl-16 md:pr-10' : 'md:px-10'
        }`}>
          {children}
        </div>
      </main>
    </div>
  );
}
