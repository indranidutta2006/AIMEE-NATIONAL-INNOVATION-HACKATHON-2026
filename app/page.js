'use client';

import React, { useState } from 'react';

export default function Home() {
  const [isStockMarketsOpen, setIsStockMarketsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('us'); // Default viewing frame

  // Production Vercel Deployment URLs (Replace these with your actual Vercel generated strings)
  const US_APP_URL = "/us-market"; 
  const INDIA_APP_URL = "/india-market";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      
      {/* SIDEBAR NAVIGATION PANEL */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-bold text-lg bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Apex Traders Hub
            </span>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Management Portal</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <div>
            {/* MAIN MENU LISTING */}
            <button 
              onClick={() => setIsStockMarketsOpen(!isStockMarketsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition group text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-slate-500 group-hover:text-cyan-400 transition">📊</span>
                <span>Stock Markets</span>
              </div>
              <span className={`text-xs text-slate-500 transition-transform duration-200 ${isStockMarketsOpen ? 'rotate-90' : ''}`}>
                ▶
              </span>
            </button>

            {/* NESTED SUBMENU */}
            {isStockMarketsOpen && (
              <div className="mt-1 ml-6 pl-2 border-l border-slate-800 space-y-1 animate-fadeIn">
                <button
                  onClick={() => setActiveTab('us')}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    activeTab === 'us' 
                      ? 'bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  🇺🇸 United States Market
                </button>
                <button
                  onClick={() => setActiveTab('india')}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    activeTab === 'india' 
                      ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  🇮🇳 Indian NSE Market
                </button>
              </div>
            )}
          </div>
        </nav>
        
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500 text-center font-mono">
          System Status: Online
        </div>
      </aside>

      {/* MAIN VIEWPORT FRAMEWORK */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        
        {/* TOP HUB HEADER */}
        <header className="bg-slate-900/40 border-b border-slate-900 px-8 py-4 flex justify-between items-center backdrop-blur">
          <h2 className="text-xl font-bold text-slate-100">
            Welcome to Apex Traders
          </h2>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
            Active: {activeTab === 'us' ? 'US Core Engine' : 'India NSE Engine'}
          </span>
        </header>

        {/* EMBEDDED APPLICATION VIEWPORT */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center">
          <div className="w-full h-full rounded-2xl border border-slate-900 bg-slate-900/20 shadow-2xl relative overflow-hidden flex flex-col">
            
            {/* Contextual Fallback Message if API routes are syncing */}
            <div className="absolute top-2 left-3 text-[10px] font-mono text-slate-600 pointer-events-none">
              Sandbox Sandbox Mode Environment Active
            </div>

            {/* CONDITIONAL RENDER CHANNELS */}
            {activeTab === 'us' ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="text-4xl">🇺🇸</div>
                <h3 className="text-lg font-bold">US NYSE & NASDAQ Terminal</h3>
                <p className="text-sm text-slate-400 max-w-md">
                  Your US Stock Simulator code will run natively in this active application block. Click below to view the dedicated route.
                </p>
                <a href={US_APP_URL} className="text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-4 py-2 rounded-xl hover:bg-cyan-500/20 transition">
                  Open Direct US Frame →
                </a>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="text-4xl">🇮🇳</div>
                <h3 className="text-lg font-bold">Indian NSE Terminal</h3>
                <p className="text-sm text-slate-400 max-w-md">
                  Your Indian Stock Simulator code will run natively in this active application block. Click below to view the dedicated route.
                </p>
                <a href={INDIA_APP_URL} className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-xl hover:bg-emerald-500/20 transition">
                  Open Direct India Frame →
                </a>
              </div>
            )}

          </div>
        </div>
      </main>

    </div>
  );
}
