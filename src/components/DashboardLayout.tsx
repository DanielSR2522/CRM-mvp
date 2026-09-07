'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import GlobalCrmSearch from '@/components/search/GlobalCrmSearch';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

function DashboardLayoutInner({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // State to track whether the sidebar is collapsed
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('smartrack:sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const handleToggleSidebar = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    localStorage.setItem('smartrack:sidebar-collapsed', String(nextCollapsed));
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const [todayApptsCount, setTodayApptsCount] = useState<number>(0);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email || 'Agent');
        setUserId(session.user.id);

        // Fetch name from profiles
        const { data } = await supabase
          .from('profiles')
          .select('name, first_name, last_name')
          .eq('id', session.user.id)
          .maybeSingle();

        if (data) {
          const fn = data.first_name || '';
          const ln = data.last_name || '';
          const full = `${fn} ${ln}`.trim() || data.name || session.user.email || 'Agent';
          setUserName(full);
        } else {
          setUserName(session.user.email?.split('@')[0] || 'Agent');
        }

        // Fetch Today's Pending Appointments count for Calendar Badge
        try {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
          const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

          const { count, error } = await supabase
            .from('calendar_appointments')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', session.user.id)
            .eq('status', 'scheduled')
            .gte('starts_at', start)
            .lte('starts_at', end);

          if (!error && count !== null) {
            setTodayApptsCount(count);
          }
        } catch (err) {
          console.error('Error loading sidebar appointment count:', err);
        }
      }
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || 'Agent');
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
  }, [pathname]);

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
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 00-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Leads',
      href: '/leads',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      name: 'Clients',
      href: '/clients',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'Calendar',
      href: '/calendar',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: 'Electronic Signatures',
      href: '/consents',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      name: 'Consent Templates',
      href: '/consents/templates',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: 'Agent Information',
      href: '/agent-information',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      name: 'Carrier Portals',
      href: '/carrier-portals',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      name: 'Import Mapper',
      href: '/import-mapper',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9m0-9l-3 3m3-3l3 3" />
        </svg>
      ),
    },
  ];

  const searchParams = useSearchParams();
  const activeSectionInUrl = searchParams.get('section') || searchParams.get('tab');
  const isTopNavWorkspace =
    pathname === '/clients' ||
    pathname.startsWith('/clients/') ||
    pathname === '/calendar' ||
    pathname.startsWith('/calendar/') ||
    pathname === '/consents' ||
    pathname.startsWith('/consents/') ||
    pathname === '/carrier-portals' ||
    pathname.startsWith('/carrier-portals/') ||
    pathname === '/import-mapper' ||
    pathname.startsWith('/import-mapper/') ||
    pathname === '/agent-information' ||
    pathname.startsWith('/agent-information/');

  const isNavItemActive = (item: typeof navItems[0]) => {
    if (item.href === '/dashboard') {
      return pathname === '/dashboard';
    }
    if (item.href === '/clients') {
      return pathname === '/clients' || pathname.startsWith('/clients/');
    }
    if (item.href === '/consents/templates') {
      return pathname.startsWith('/consents/templates');
    }
    if (item.href === '/consents') {
      return (
        pathname === '/consents' ||
        (pathname.startsWith('/consents/') && !pathname.startsWith('/consents/templates'))
      );
    }
    return pathname === item.href || (!item.exact && pathname.startsWith(item.href + '/'));
  };

  return (
    <div className={`min-h-screen flex ${isTopNavWorkspace ? 'flex-col' : 'flex-col md:flex-row'} bg-[#F6F8FC] text-[#172033] font-sans antialiased`}>
      <DashboardArrivalGuard />

      {/* Top Global Navigation Bar for Top-Nav Workspaces */}
      {isTopNavWorkspace && (
        <header className="w-full bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between sticky top-0 z-50 shadow-2xs font-sans">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
                S
              </div>
              <span className="font-extrabold text-sm tracking-tight text-slate-900">
                SmarTrack CRM
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = isNavItemActive(item);
                return (
                  <NextLink
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 font-extrabold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </NextLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Global CRM Search Input */}
            <div className="w-48 sm:w-64 lg:w-80">
              <GlobalCrmSearch />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-200">
                {userName ? userName.charAt(0).toUpperCase() : 'A'}
              </div>
              <span className="text-xs font-bold text-slate-800 hidden sm:inline">{userName || 'Agent'}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition-all"
            >
              Sign Out
            </button>
          </div>
        </header>
      )}

      {/* Mobile Header */}
      {!isTopNavWorkspace && (
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#DCE2EA] sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#2563EB] flex items-center justify-center font-bold text-white text-xs">
              S
            </div>
            <span className="font-semibold text-base text-[#172033]">SmarTrack CRM</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            className="p-1.5 text-[#556176] hover:text-[#172033] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>
      )}

      {/* Mobile Drawer */}
      {!isTopNavWorkspace && mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[57px] z-20 bg-white flex flex-col justify-between p-4 border-b border-[#DCE2EA]">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (!item.exact && pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
              return (
                <NextLink
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                      : 'text-[#556176] hover:bg-[#F2F6FF] hover:text-[#172033]'
                  }`}
                >
                  <span className={isActive ? 'text-[#2563EB]' : 'text-[#556176]'}>{item.icon}</span>
                  <span>{item.name}</span>
                  {item.name === 'Calendar' && todayApptsCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-[#EEF4FF] text-[#2563EB] border border-[#BFDBFE]">
                      {todayApptsCount}
                    </span>
                  )}
                </NextLink>
              );
            })}
          </nav>
          
          <div className="border-t border-[#E8ECF2] pt-4 mt-4 space-y-3">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold text-xs border border-[#BFDBFE]">
                {userName ? userName.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-[#172033] truncate">{userName || userEmail}</span>
                <span className="text-[11px] text-[#7C8799]">Insurance Agent</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-[#DCE2EA] rounded-md font-medium text-xs text-[#556176] hover:bg-[#F8FAFC] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Desktop Pure White Sidebar */}
      {!isTopNavWorkspace && (
        <aside className={`hidden md:flex flex-col justify-between bg-white text-[#172033] border-r border-[#DCE2EA] sticky top-0 h-screen z-40 transition-all duration-200 ${
          isCollapsed && mounted ? 'w-16 p-2' : 'w-56 p-4'
        }`}>
        <div className="flex flex-col h-full justify-between">
          <div>
            {/* Logo / Header area */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E8ECF2] mb-4">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-md bg-[#2563EB] flex items-center justify-center font-bold text-white text-xs flex-shrink-0">
                  S
                </div>
                {(!isCollapsed || !mounted) && (
                  <span className="font-semibold text-base text-[#172033] truncate">SmarTrack CRM</span>
                )}
              </div>
              
              <button
                onClick={handleToggleSidebar}
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="p-1 rounded-md text-[#7C8799] hover:bg-[#F2F6FF] hover:text-[#172033] transition-colors flex-shrink-0"
              >
                <svg className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (!item.exact && pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
                return (
                  <NextLink
                    key={item.name}
                    href={item.href}
                    title={isCollapsed && mounted ? item.name : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                        : 'text-[#556176] hover:bg-[#F2F6FF] hover:text-[#172033]'
                    } ${isCollapsed && mounted ? 'justify-center px-0' : ''}`}
                  >
                    <span className={isActive ? 'text-[#2563EB]' : 'text-[#556176]'}>{item.icon}</span>
                    {(!isCollapsed || !mounted) && <span className="truncate">{item.name}</span>}
                    {(!isCollapsed || !mounted) && item.name === 'Calendar' && todayApptsCount > 0 && (
                      <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-[#EEF4FF] text-[#2563EB] border border-[#BFDBFE]">
                        {todayApptsCount}
                      </span>
                    )}
                  </NextLink>
                );
              })}
            </nav>
          </div>

          {/* User profile / Footer area */}
          <div className="border-t border-[#E8ECF2] pt-4 mt-auto">
            {(!isCollapsed || !mounted) ? (
              <div className="flex flex-col space-y-3">
                <div className="flex items-center gap-2.5 px-1">
                  <div className="w-7 h-7 rounded-full bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold text-xs border border-[#BFDBFE] flex-shrink-0">
                    {userName ? userName.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-semibold text-[#172033] truncate">{userName || userEmail}</span>
                    <span className="text-[10px] text-[#7C8799]">Licensed Agent</span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 border border-[#DCE2EA] rounded-md font-medium text-xs text-[#556176] hover:bg-[#F8FAFC] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div 
                  title={userName || userEmail || 'Agent'} 
                  className="w-8 h-8 rounded-full bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold text-xs border border-[#BFDBFE]"
                >
                  {userName ? userName.charAt(0).toUpperCase() : 'A'}
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="p-2 text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033] rounded-md transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      )}

      {/* Main Container with Top Navigation Bar */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F6F8FC]">
        
        {/* Top White Navigation Bar */}
        {!isTopNavWorkspace && (
          <header className="hidden md:flex items-center justify-between px-6 py-2.5 bg-white border-b border-[#DCE2EA] sticky top-0 z-30 shadow-2xs">
            {/* Quick Actions */}
            <div className="flex items-center gap-2.5">
              <NextLink
                href="/clients"
                className="crm-btn-secondary text-xs px-3 py-1.5"
              >
                + New Client
              </NextLink>
              <NextLink
                href="/leads"
                className="crm-btn-primary text-xs px-3 py-1.5"
              >
                + New Lead
              </NextLink>
            </div>

            {/* Global Search & User Info */}
            <div className="flex items-center gap-3">
              <div className="w-48 sm:w-64 lg:w-80">
                <GlobalCrmSearch />
              </div>

              <div className="h-5 w-px bg-[#E8ECF2] mx-1" />

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold text-xs border border-[#BFDBFE]">
                  {userName ? userName.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-[#172033] leading-tight">{userName || 'Agent'}</span>
                  <span className="text-[10px] text-[#7C8799] leading-tight">Licensed Agent</span>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main className={`flex-1 overflow-y-auto ${isTopNavWorkspace ? 'p-0' : 'px-4 py-6 md:px-8 md:py-8'}`}>
          {children}
        </main>
      </div>

    </div>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex bg-[#F6F8FC] text-[#172033] font-sans antialiased">
          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      }
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
