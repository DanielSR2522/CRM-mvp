'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import NextLink from 'next/link';
import { saveLastRoute, clearSavedRoute } from '@/lib/auth/routePersistence';
import {
  saveLastNonDashboardRoute,
  setDashboardIntent,
  clearNavigationIntent,
} from '@/lib/auth/navigationIntent';
import DashboardArrivalGuard from '@/components/DashboardArrivalGuard';
import { recordNavTrace } from '@/lib/auth/navTrace';
import {
  getStoredSidebarTheme,
  subscribeSidebarThemeChange,
  SIDEBAR_THEMES,
  SidebarThemeConfig,
} from '@/lib/theme/sidebarTheme';
import {
  getStoredThemeSettings,
  applyThemeSettings,
  subscribeThemeSystemChange,
} from '@/lib/theme/themeSystem';
import ThemeSelectorModal from '@/components/theme/ThemeSelectorModal';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Theme state
  const [theme, setTheme] = useState<SidebarThemeConfig>(SIDEBAR_THEMES.navy);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  // State to track whether the sidebar is collapsed (completely hidden on desktop)
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load session collapse state and theme settings safely on client mount
  useEffect(() => {
    setMounted(true);
    applyThemeSettings(getStoredThemeSettings());
    const unsubThemeSystem = subscribeThemeSystemChange((newSettings) => {
      applyThemeSettings(newSettings);
    });
    const saved = localStorage.getItem('smartrack:sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
    return () => unsubThemeSystem();
  }, []);

  // Update theme when userId or theme changes in localStorage
  useEffect(() => {
    setTheme(getStoredSidebarTheme(userId));
    const unsubscribe = subscribeSidebarThemeChange(() => {
      setTheme(getStoredSidebarTheme(userId));
    });
    return () => unsubscribe();
  }, [userId]);

  // Save state on change
  const handleToggleSidebar = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    localStorage.setItem('smartrack:sidebar-collapsed', String(nextCollapsed));
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Keyboard navigation: Escape key closes drawers, Ctrl+B toggles sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email || 'User');
        setUserId(session.user.id);
      }
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || 'User');
        setUserId(session.user.id);
      }
      
      if (event === 'SIGNED_OUT' || !session) {
        recordNavTrace({
          currentPath: pathname,
          targetPath: '/login',
          method: 'onAuthStateChange (listen)',
          source: 'DashboardLayout onAuthStateChange',
          authEvent: event,
          reason: 'Session ended or user signed out',
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Save active route when navigation changes for this user
  useEffect(() => {
    if (userId && pathname && pathname !== '/login' && pathname !== '/register') {
      saveLastRoute(userId, pathname);
      if (pathname !== '/dashboard') {
        saveLastNonDashboardRoute(pathname);
      }
    }
  }, [pathname, userId]);

  const handleLogout = async () => {
    recordNavTrace({
      currentPath: pathname,
      targetPath: '/login',
      method: 'handleLogout (click)',
      source: 'DashboardLayout Sign Out button',
      reason: 'User clicked explicit Sign Out button',
    });

    if (userId) {
      clearSavedRoute(userId);
    }
    clearNavigationIntent();

    await supabase.auth.signOut();
    router.replace('/login');
  };

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      exact: true,
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 00-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Leads',
      href: '/leads',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      name: 'Clients',
      href: '/clients',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'Calendar',
      href: '/calendar',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: 'Electronic Signatures',
      href: '/consents',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      name: 'Consent Templates',
      href: '/consents/templates',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: 'Personal Information',
      href: '/personal-information',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans">
      <DashboardArrivalGuard />
      {/* Floating expand button (when sidebar is completely collapsed/hidden on desktop) */}
      {isCollapsed && mounted && (
        <button
          onClick={handleToggleSidebar}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="fixed top-6 left-4 z-20 hidden md:flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Mobile Header */}
      <header className={`md:hidden flex items-center justify-between px-6 py-4 ${theme.sidebarBgClass} ${theme.textPrimaryClass} border-b ${theme.sidebarBorderClass} sticky top-0 z-30 shadow-md`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md">
            C
          </div>
          <span className="font-bold text-lg tracking-tight">SmarTrack CRM</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          className={`p-2 transition-colors outline-none focus:ring-2 focus:ring-white focus:rounded-lg ${theme.textSecondaryClass} hover:${theme.textPrimaryClass}`}
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
        <div className={`md:hidden fixed inset-0 top-[69px] z-20 ${theme.sidebarBgClass} flex flex-col justify-between p-6 animate-fade-in ${theme.textPrimaryClass}`}>
          <nav className="space-y-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (!item.exact && pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
              return (
                <NextLink
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? `${theme.activeBgClass} ${theme.activeTextClass}`
                      : `${theme.textSecondaryClass} ${theme.hoverBgClass}`
                  }`}
                >
                  <span className={isActive ? theme.iconColorClass : ''}>{item.icon}</span>
                  <span>{item.name}</span>
                </NextLink>
              );
            })}
          </nav>
          
          <div className={`space-y-4 border-t ${theme.sidebarBorderClass} pt-6`}>
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-sm shadow-inner">
                {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className={`text-[10px] uppercase font-bold tracking-wider ${theme.textSecondaryClass}`}>LOGGED IN AS</span>
                <span className="text-sm font-semibold truncate">{userEmail}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className={`w-full flex items-center justify-center gap-3 px-4 py-3 border rounded-xl font-semibold text-sm transition-all duration-200 ${theme.signOutBtnClass}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col justify-between transition-all duration-300 bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)] border-r border-white/10 sticky top-0 h-screen z-40 overflow-hidden ${
        isCollapsed && mounted ? 'w-0 p-0 border-r-0' : 'w-60 p-4'
      }`}>
        <div className="w-[208px] flex-shrink-0 flex flex-col h-full justify-between">
          <div>
            {/* Logo / Header area */}
            <div className="flex items-center mb-8 px-1 justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center justify-center font-bold text-white shadow-md flex-shrink-0">
                  C
                </div>
                <span className="font-extrabold text-sm tracking-tight truncate text-white">
                  SmarTrack CRM
                </span>
              </div>

              <button
                onClick={handleToggleSidebar}
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg transition-colors focus:ring-2 focus:ring-white focus:outline-none text-[var(--sidebar-muted)] hover:text-white hover:bg-white/10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (!item.exact && pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
                return (
                  <NextLink
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      if (item.href === '/dashboard') {
                        setDashboardIntent('sidebar-dashboard-click');
                      }
                    }}
                    className={`flex items-center rounded-xl border transition-all duration-200 group focus:ring-2 focus:ring-white focus:outline-none px-4 py-2.5 gap-3 w-full ${
                      isActive
                        ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)] font-bold shadow-md border-transparent'
                        : 'border-transparent text-[var(--sidebar-muted)] hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className={`transition-transform duration-200 group-hover:scale-105 flex-shrink-0 ${isActive ? 'text-white' : 'opacity-80 group-hover:opacity-100'}`}>
                      {item.icon}
                    </span>
                    <span className="text-sm truncate font-medium">{item.name}</span>
                  </NextLink>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer User Info & Logout */}
          <div className={`space-y-4 border-t ${theme.sidebarBorderClass} pt-6`}>
            <div className="flex items-center gap-3 px-2 py-1 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-extrabold text-white text-xs shadow-inner flex-shrink-0">
                {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className={`text-[9px] font-bold uppercase tracking-wider ${theme.textSecondaryClass}`}>Session Profile</span>
                <span className="text-xs font-semibold truncate">{userEmail}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              className={`flex items-center justify-center border border-white/10 rounded-xl font-semibold transition-all duration-200 text-xs hover:bg-white/10 text-slate-200 focus:ring-2 focus:ring-white focus:outline-none w-full gap-2 px-3 py-2`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-23" />
              </svg>
              <span className="truncate">Theme & Appearance</span>
            </button>

            <button
              onClick={handleLogout}
              aria-label="Sign Out"
              className={`flex items-center justify-center border rounded-xl font-semibold transition-all duration-200 text-sm active:scale-[0.98] focus:ring-2 focus:ring-white focus:outline-none w-full gap-3 px-4 py-2.5 ${theme.signOutBtnClass}`}
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
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--background)] relative overflow-hidden transition-colors">
        <div className="flex-1 overflow-y-auto px-6 py-8 md:py-10 relative z-10 transition-all duration-300 md:px-10">
          {children}
        </div>
      </main>

      {/* Global Theme & Appearance Selector Modal */}
      <ThemeSelectorModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />
    </div>
  );
}
