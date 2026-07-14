'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';

interface UserProfile {
  name: string | null;
  email: string | null;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data, error } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('id', session.user.id)
            .single();

          if (error) {
            // Profile may not exist yet, default to auth session info
            setProfile({
              name: null,
              email: session.user.email || 'User',
            });
          } else {
            setProfile(data);
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl">
        {/* Header Section */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h1>
          <p className="text-slate-400 mt-1">Manage your customer information and application status.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Welcome Card */}
            <div className="md:col-span-3 bg-gradient-to-r from-violet-600/10 to-cyan-500/10 border border-violet-500/20 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-xl shadow-violet-500/5">
              <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial from-violet-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10 max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-400">Welcome Back</span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white mt-2">
                  Hello, {profile?.name || profile?.email || 'User'}!
                </h2>
                
                {profile?.name ? (
                  <p className="text-slate-300 mt-3 text-sm md:text-base leading-relaxed">
                    Your profile is active. You can review or edit your detailed personal information, address record, and income streams in the settings module.
                  </p>
                ) : (
                  <div>
                    <p className="text-slate-300 mt-3 text-sm md:text-base leading-relaxed">
                      You haven't completed your personal information record yet. Please complete your registration details to ensure your profile is fully set up.
                    </p>
                    <Link
                      href="/personal-information"
                      className="inline-flex items-center gap-2 mt-5 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-300 shadow-md shadow-violet-500/10 active:scale-[0.98]"
                    >
                      Complete Personal Info
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats/Links */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Personal Info</h3>
                <span className="w-8 h-8 rounded-lg bg-slate-850 flex items-center justify-center text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-white mt-4">
                {profile?.name ? 'Completed' : 'Pending'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Core user details & demographics</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Residence</h3>
                <span className="w-8 h-8 rounded-lg bg-slate-850 flex items-center justify-center text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-white mt-4">
                Active
              </p>
              <p className="text-xs text-slate-500 mt-1">Primary residence address data</p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Income Sources</h3>
                <span className="w-8 h-8 rounded-lg bg-slate-850 flex items-center justify-center text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-white mt-4">
                Configured
              </p>
              <p className="text-xs text-slate-500 mt-1">Manage multiple income records</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
