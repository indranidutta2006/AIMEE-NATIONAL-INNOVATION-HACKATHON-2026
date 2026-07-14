'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// Default global watchlist containing multi-exchange assets
const DEFAULT_WATCHLIST = ['AAPL', 'INFY.NSE', 'BARC.LSE', '7203.T'];

// Baseline fallback prices for different global regions
const BASELINE_STOCKS = {
  'AAPL': { name: 'Apple Inc. (NASDAQ)', price: 175.00, change: 0.5, rsi: 72, volume: 'High', exchange: 'US' },
  'INFY.NSE': { name: 'Infosys Limited (NSE)', price: 1420.00, change: -1.2, rsi: 38, volume: 'Extreme', exchange: 'India' },
  'BARC.LSE': { name: 'Barclays PLC (LSE)', price: 185.00, change: 2.4, rsi: 81, volume: 'Normal', exchange: 'Europe' },
  '7203.T': { name: 'Toyota Motor Corp (TSE)', price: 3400.00, change: -0.3, rsi: 48, volume: 'Low', exchange: 'Asia' },
};

const MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-04', '2026-09-07', '2026-11-26', '2026-12-25',
]);

const isMarketClosedForDate = (value, timeValue = '12:00') => {
  if (!value) return true;
  const parsedDate = new Date(`${value}T${timeValue}`);
  if (Number.isNaN(parsedDate.getTime())) return true;
  const day = parsedDate.getDay();
  if (day === 0 || day === 6) return true;
  
  const normalizedDate = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
  if (MARKET_HOLIDAYS.has(normalizedDate)) return true;

  const minutes = parsedDate.getHours() * 60 + parsedDate.getMinutes();
  return minutes < 570 || minutes >= 960;
};

const toDateInputValue = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toTimeInputValue = (date) => {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const getCurrentDateValue = () => toDateInputValue(new Date());
const getCurrentTimeValue = () => toTimeInputValue(new Date());

const isValidTimeValue = (value) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const normalizeTimeValue = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (!digits) return '00:00';
  if (digits.length <= 2) {
    const hours = String(Math.min(23, Math.max(0, Number.parseInt(digits || '0', 10) || 0))).padStart(2, '0');
    return `${hours}:00`;
  }
  const hours = String(Math.min(23, Math.max(0, Number.parseInt(digits.slice(0, 2), 10) || 0))).padStart(2, '0');
  const minutes = String(Math.min(59, Math.max(0, Number.parseInt(digits.slice(2, 4), 10) || 0))).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const getAdjustedTimeValue = (value, field, direction) => {
  const [hours, minutes] = value.split(':').map(Number);
  const next = new Date(2000, 0, 1, hours, minutes);
  next.setMinutes(next.getMinutes() + (field === 'minute' ? direction * 1 : 0));
  next.setHours(next.getHours() + (field === 'hour' ? direction * 1 : 0));
  return toTimeInputValue(next);
};

export default function App() {
  // --- STATE MANAGEMENT ---
  const [cash, setCash] = useState(100000.00); 
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [marketStocks, setMarketStocks] = useState({});
  const [selectedExchangeFilter, setSelectedExchangeFilter] = useState('ALL'); 
  const [portfolio, setPortfolio] = useState([
    { ticker: 'AAPL', shares: 10, avgBuyPrice: 185.00 }, 
    { ticker: 'INFY.NSE', shares: 25, avgBuyPrice: 1450.00 }
  ]);
  const [selectedTicker, setSelectedTicker] = useState('AAPL');
  const [searchQuery, setSearchQuery] = useState('');
  const [tradeShares, setTradeShares] = useState(1);
  const [autopsyReport, setAutopsyReport] = useState(null);
  
  // Environment & Connection States
  const [apiMode, setApiMode] = useState('Checking...');
  const [isManualSim, setIsManualSim] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [rateLimitTimer, setRateLimitTimer] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => getCurrentDateValue());
  const [selectedTime, setSelectedTime] = useState(() => getCurrentTimeValue());
  const [calendarSelectionDate, setCalendarSelectionDate] = useState(() => getCurrentDateValue());
  const [calendarSelectionTime, setCalendarSelectionTime] = useState(() => getCurrentTimeValue());
  const [timeInputDraft, setTimeInputDraft] = useState(() => getCurrentTimeValue());
  const [timeInputError, setTimeInputError] = useState('');
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState({ closed: false, message: '' });
  const [lastExtractedAt, setLastExtractedAt] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [marketRegion, setMarketRegion] = useState('US');
  const playbackClockRef = useRef(new Date());

  // Detect and append regional exchange strings to help structure UI metadata
  const detectExchangeRegion = (symbol) => {
    if (symbol.endsWith('.NSE') || symbol.endsWith('.BSE')) return 'India';
    if (symbol.endsWith('.LSE') || symbol.endsWith('.PA') || symbol.endsWith('.DE')) return 'Europe';
    if (symbol.endsWith('.T') || symbol.endsWith('.HK') || symbol.endsWith('.SS')) return 'Asia';
    return 'US'; 
  };

  const formatSelectedDate = (value) => {
    if (!value) return 'No date selected';
    const parsedDate = new Date(`${value}T12:00:00`);
    return parsedDate.toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTimestamp = (value) => {
    if (!value) return 'Awaiting market extraction';
    return `${value.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })} on ${value.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const formatSelectedDateTime = (dateValue, timeValue) => {
    if (!dateValue) return 'No selection';
    const parsedDate = new Date(`${dateValue}T${timeValue || '12:00'}`);
    return `${parsedDate.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${parsedDate.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}`;
  };

  const getCalendarDays = (viewDate) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const cells = [];
    for (let index = 0; index < leadingDays; index += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  // --- HYDROGUARD: Prevent Hydration Mismatch ---
  useEffect(() => {
    setMounted(true);
    const savedCash = localStorage.getItem('apex_cash');
    const savedPortfolio = localStorage.getItem('apex_portfolio');
    const savedWatchlist = localStorage.getItem('apex_watchlist');
    if (savedCash) setCash(parseFloat(savedCash));
    if (savedPortfolio) setPortfolio(JSON.parse(savedPortfolio));
    if (savedWatchlist) setWatchlist(JSON.parse(savedWatchlist));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('apex_cash', cash.toString());
    localStorage.setItem('apex_portfolio', JSON.stringify(portfolio));
    localStorage.setItem('apex_watchlist', JSON.stringify(watchlist));
  }, [cash, portfolio, watchlist, mounted]);

  const triggerNotification = (message, type = 'info') => {
    setFeedbackMsg({ text: message, type });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const saveCache = (data) => {
    try {
      const cacheObj = { timestamp: Date.now(), stocks: data };
      sessionStorage.setItem('apex_market_cache', JSON.stringify(cacheObj));
    } catch (e) {
      console.warn(e);
    }
  };

  const parseTwelveDataQuotes = (data) => {
    if (!data || data.status === 'error' || data.code >= 400) return null;
    const parsed = {};

    if (data.symbol) {
      parsed[data.symbol] = {
        name: data.name || data.symbol,
        price: parseFloat(data.close || data.price || 0),
        change: parseFloat(data.percent_change || 0),
        volume: parseFloat(data.volume || 0) > 50000000 ? 'High' : 'Normal',
        rsi: parseFloat(data.rsi || (50 + (parseFloat(data.percent_change || 0) * 4)).toFixed(1)),
        exchange: detectExchangeRegion(data.symbol)
      };
      return parsed;
    }

    Object.keys(data).forEach((key) => {
      const stock = data[key];
      if (stock && stock.symbol) {
        parsed[stock.symbol] = {
          name: stock.name || stock.symbol,
          price: parseFloat(stock.close || stock.price || 0),
          change: parseFloat(stock.percent_change || 0),
          volume: parseFloat(stock.volume || 0) > 50000000 ? 'High' : 'Normal',
          rsi: parseFloat((50 + (parseFloat(stock.percent_change || 0) * 4)).toFixed(1)),
          exchange: detectExchangeRegion(stock.symbol)
        };
      }
    });

    return Object.keys(parsed).length > 0 ? parsed : null;
  };

  const runSimulationTick = useCallback(() => {
    // ENFORCEMENT: If market bounds fall outside hours, explicitly stop the simulation tick
    if (isMarketClosedForDate(selectedDate, selectedTime)) {
      setMarketStatus({ closed: true, message: 'Market is currently closed.' });
      setApiMode('Closed Terminal');
      return;
    }

    setMarketStocks((prevStocks) => {
      const base = Object.keys(prevStocks).length > 0 ? prevStocks : BASELINE_STOCKS;
      const updated = { ...base };
      
      Object.keys(updated).forEach((ticker) => {
        if (!updated[ticker]) {
          updated[ticker] = { name: `${ticker} Instrument`, price: 250.00, change: 0, rsi: 50, volume: 'Normal', exchange: detectExchangeRegion(ticker) };
        }
        const percentChange = (Math.random() * 1.6 - 0.8) / 100;
        updated[ticker].price = Math.max(1, +(updated[ticker].price * (1 + percentChange)).toFixed(2));
        updated[ticker].change = +(updated[ticker].change + percentChange * 10).toFixed(2);
        updated[ticker].rsi = Math.max(10, Math.min(95, +(updated[ticker].rsi + (Math.random() * 4 - 2)).toFixed(1)));
      });
      return updated;
    });
  }, [selectedDate, selectedTime]);

  const fetchMarketData = useCallback(async (forcedSymbols = null, bypassCache = false, dateOverride = null, timeOverride = null) => {
    const selectedDateValue = dateOverride || selectedDate || getCurrentDateValue();
    const selectedTimeValue = timeOverride || selectedTime || getCurrentTimeValue();

    // ENFORCEMENT: Block pipeline completely if outside operating metrics
    if (isMarketClosedForDate(selectedDateValue, selectedTimeValue)) {
      setMarketStatus({ closed: true, message: 'Market is currently closed.' });
      setApiMode('Closed Terminal');
      return;
    }

    const symbolsToFetch = forcedSymbols || Array.from(new Set([...watchlist, ...portfolio.map(p => p.ticker)]));

    if (isManualSim) {
      setApiMode('Simulation');
      runSimulationTick();
      setLastExtractedAt(new Date());
      return;
    }

    try {
      const response = await fetch(`/api/market-data?date=${encodeURIComponent(selectedDateValue)}&time=${encodeURIComponent(selectedTimeValue)}&symbols=${encodeURIComponent(symbolsToFetch.join(','))}`);
      const payload = await response.json();

      if (payload.stocks) {
        const structuralMap = {};
        Object.keys(payload.stocks).forEach(sym => {
          structuralMap[sym] = {
            ...payload.stocks[sym],
            exchange: detectExchangeRegion(sym)
          };
        });
        setMarketStatus({ closed: false, message: '' });
        setMarketStocks(structuralMap);
        saveCache(structuralMap);
        setApiMode('TwelveData');
        setApiError(null);
      } else {
        runSimulationTick();
      }
      setLastExtractedAt(new Date());
    } catch (err) {
      setApiMode('Simulation');
      setApiError('Ingestion limit / Pipeline issue. Local simulation backup engaged.');
      runSimulationTick();
      setLastExtractedAt(new Date());
    }
  }, [watchlist, portfolio, runSimulationTick, isManualSim, selectedDate, selectedTime]);

  // Synchronous Core Loop Initialization
  useEffect(() => {
    if (!mounted) return;
    
    // Assess operational availability on state load 
    if (isMarketClosedForDate(selectedDate, selectedTime)) {
      setMarketStatus({ closed: true, message: 'Market is currently closed.' });
      setApiMode('Closed Terminal');
    } else {
      fetchMarketData();
    }

    const activeInterval = setInterval(() => {
      // Re-evaluate boundaries at every clock tick segment
      if (isMarketClosedForDate(selectedDate, selectedTime)) {
        setMarketStatus({ closed: true, message: 'Market is currently closed.' });
        setApiMode('Closed Terminal');
        return; 
      }

      if (apiMode === 'TwelveData' && !isManualSim && rateLimitTimer === 0) {
        fetchMarketData(null, true);
      } else {
        runSimulationTick();
      }
    }, 15000);

    return () => clearInterval(activeInterval);
  }, [mounted, fetchMarketData, apiMode, runSimulationTick, isManualSim, rateLimitTimer, selectedDate, selectedTime]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (refreshCooldown > 0) setRefreshCooldown(prev => prev - 1);
      if (rateLimitTimer > 0) setRateLimitTimer(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshCooldown, rateLimitTimer]);

  const handleCalendarDateSelect = (dateValue) => {
    setCalendarSelectionDate(dateValue);
    setCalendarViewDate(new Date(`${dateValue}T12:00:00`));
  };

  const confirmSelectedDate = () => {
    const nextDate = calendarSelectionDate || getCurrentDateValue();
    const nextTime = calendarSelectionTime || getCurrentTimeValue();
    setSelectedDate(nextDate);
    setSelectedTime(nextTime);
    playbackClockRef.current = new Date(`${nextDate}T${nextTime}`);
    fetchMarketData(null, true, nextDate, nextTime);
  };

  const handleTimeDraftChange = (event) => {
    const rawValue = event.target.value;
    const digitsOnly = String(rawValue || '').replace(/\D/g, '').slice(0, 4);
    const nextDraft = digitsOnly.length <= 2 ? digitsOnly : `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2, 4)}`;
    setTimeInputDraft(nextDraft);
  };

  const updateTimeField = (field, direction) => {
    const nextTime = getAdjustedTimeValue(calendarSelectionTime || getCurrentTimeValue(), field, direction);
    setCalendarSelectionTime(nextTime);
    setTimeInputDraft(nextTime);
  };

  const handleAddTicker = async (e) => {
    e.preventDefault();
    const symbol = searchQuery.toUpperCase().trim();
    if (!symbol) return;

    if (watchlist.includes(symbol)) {
      triggerNotification('Asset is already monitored!', 'warning');
      setSearchQuery('');
      return;
    }

    // Early exit restriction if user attempts an ingestion expansion when market flags closed variables
    if (isMarketClosedForDate(selectedDate, selectedTime)) {
      triggerNotification('Terminal asset intake suspended: Market is Closed.', 'warning');
      setSearchQuery('');
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY;

    if (!apiKey || isManualSim) {
      const simulatedPrice = +(Math.random() * 800 + 50).toFixed(2);
      setMarketStocks((prev) => ({
        ...prev,
        [symbol]: { name: `${symbol} Global Equities Corp.`, price: simulatedPrice, change: 0, rsi: 50, volume: 'Normal', exchange: detectExchangeRegion(symbol) }
      }));
      setWatchlist((prev) => [...prev, symbol]);
      setSelectedTicker(symbol);
      setSearchQuery('');
      triggerNotification(`Added ${symbol} into Global Sandboxed Engine!`, 'success');
      return;
    }

    triggerNotification(`Verifying global ticker "${symbol}" on Twelve Data network...`, 'info');
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code === 400 || data.status === 'error') {
        triggerNotification(`Could not resolve "${symbol}". For international markets use format like INFY.NSE, BARC.LSE, or 7203.T`, 'error');
        return;
      }

      const parsed = parseTwelveDataQuotes(data);
      if (parsed && parsed[symbol]) {
        setMarketStocks((prev) => ({ ...prev, ...parsed }));
        setWatchlist((prev) => [...prev, symbol]);
        setSelectedTicker(symbol);
        setSearchQuery('');
        triggerNotification(`Successfully added global asset ${symbol}!`, 'success');
      }
    } catch (err) {
      triggerNotification('API connection error during global verification.', 'error');
    }
  };

  const handleBuy = () => {
    if (marketStatus.closed) return;
    const currentStock = marketStocks[selectedTicker];
    if (!currentStock) return;
    const totalCost = currentStock.price * tradeShares;

    if (cash < totalCost) {
      triggerNotification('Insufficient simulated global funds!', 'error');
      return;
    }

    setCash(prev => prev - totalCost);
    setPortfolio(prevPortfolio => {
      const existing = prevPortfolio.find(p => p.ticker === selectedTicker);
      if (existing) {
        const newShares = existing.shares + tradeShares;
        const newAvg = ((existing.shares * existing.avgBuyPrice) + totalCost) / newShares;
        return prevPortfolio.map(p => p.ticker === selectedTicker ? { ...p, shares: newShares, avgBuyPrice: +newAvg.toFixed(2) } : p);
      }
      return [...prevPortfolio, { ticker: selectedTicker, shares: tradeShares, avgBuyPrice: currentStock.price }];
    });
    triggerNotification(`Bought ${tradeShares} shares of global security ${selectedTicker}!`, 'success');
  };

  const handleSell = () => {
    if (marketStatus.closed) return;
    const currentStock = marketStocks[selectedTicker];
    if (!currentStock) return;
    const position = portfolio.find(p => p.ticker === selectedTicker);

    if (!position || position.shares < tradeShares) {
      triggerNotification("Insufficient shares in portfolio.", 'error');
      return;
    }

    const totalCredit = currentStock.price * tradeShares;
    if (currentStock.price < position.avgBuyPrice) {
      const dropPct = (((position.avgBuyPrice - currentStock.price) / position.avgBuyPrice) * 100).toFixed(1);
      setAutopsyReport({
        ticker: selectedTicker,
        dropPct,
        buyPrice: position.avgBuyPrice,
        sellPrice: currentStock.price,
        diagnostics: [`⚠️ **Global Macro Rotation Trap:** Realized rotation across the ${currentStock.exchange} theater impacted this position exit.`]
      });
    }

    setCash(prev => prev + totalCredit);
    setPortfolio(prevPortfolio => {
      return prevPortfolio.map(p => p.ticker === selectedTicker ? { ...p, shares: p.shares - tradeShares } : p).filter(p => p.shares > 0);
    });
    triggerNotification(`Liquidated ${tradeShares} shares of ${selectedTicker}!`, 'success');
  };

  const totalPortfolioValue = portfolio.reduce((acc, curr) => {
    if (marketStatus.closed) return 0; // Asset pricing drops if overall market displays closed attributes
    const currentPrice = marketStocks[curr.ticker]?.price || curr.avgBuyPrice;
    return acc + (curr.shares * currentPrice);
  }, 0);

  const netWorth = cash + totalPortfolioValue;
  const calendarDays = getCalendarDays(calendarViewDate);

  const filteredWatchlist = watchlist.filter(ticker => {
    if (selectedExchangeFilter === 'ALL') return true;
    const stock = marketStocks[ticker];
    const region = stock?.exchange || detectExchangeRegion(ticker);
    return region === selectedExchangeFilter;
  });

  if (!mounted) return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">Loading Global Ingestion Matrix...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* TOP STATUS DASHBOARD CONTROLS */}
        <div className="sticky top-0 z-40 rounded-2xl border border-cyan-500/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-cyan-400">Global Cross-Market Terminal</p>
              <h2 className="text-xl font-semibold text-slate-100">{formatSelectedDate(selectedDate)}</h2>
              <p className="text-sm text-slate-400">Extraction target: <span className="font-semibold text-slate-200">{formatSelectedDateTime(selectedDate, selectedTime)}</span></p>
              {marketStatus.closed && (
                <span className="mt-1 inline-block text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded animate-pulse">
                  🛑 Operational Limit Reached: Market Closed
                </span>
              )}
            </div>

            {/* TIME ADJUSTMENT HUB */}
            <div className="relative flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/80 p-3 sm:min-w-[310px]">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => setIsCalendarOpen(!isCalendarOpen)} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Execution Date</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{formatSelectedDate(calendarSelectionDate)}</p>
                </button>
                <button type="button" onClick={() => { confirmSelectedDate(); setIsCalendarOpen(false); }} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-400 hover:bg-cyan-500/20">Enter</button>
              </div>

              {isCalendarOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-full bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-950 p-2 text-center">
                        <span className="text-[10px] uppercase text-slate-500 block">Hours</span>
                        <div className="flex justify-center gap-2 mt-1">
                          <button onClick={() => updateTimeField('hour', -1)} className="text-slate-400 font-bold px-1">-</button>
                          <span className="font-mono text-sm">{timeInputDraft.split(':')[0] || '00'}</span>
                          <button onClick={() => updateTimeField('hour', 1)} className="text-slate-400 font-bold px-1">+</button>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950 p-2 text-center">
                        <span className="text-[10px] uppercase text-slate-500 block">Minutes</span>
                        <div className="flex justify-center gap-2 mt-1">
                          <button onClick={() => updateTimeField('minute', -1)} className="text-slate-400 font-bold px-1">-</button>
                          <span className="font-mono text-sm">{timeInputDraft.split(':')[1] || '00'}</span>
                          <button onClick={() => updateTimeField('minute', 1)} className="text-slate-400 font-bold px-1">+</button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
                      {calendarDays.map((day, i) => day && (
                        <button key={i} onClick={() => handleCalendarDateSelect(toDateInputValue(day))} className={`p-1 rounded ${toDateInputValue(day) === calendarSelectionDate ? 'bg-cyan-600 text-white' : 'hover:bg-slate-800'}`}>
                          {day.getDate()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FINANCIAL SUMMARY ROW */}
        <header className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">ApexTrader Global</h1>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${marketStatus.closed ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'}`}>{apiMode}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Multi-Exchange Sandbox Environment supporting US, NSE, LSE, and TSE execution structures.</p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Combined Global Net Worth</span>
            <div className="text-2xl md:text-3xl font-mono font-bold text-emerald-400">
              ${netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </header>

        {/* REGIONAL EXCHANGE CONTROLS / FILTER HUB */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider px-2">Market Core Hubs:</span>
          {['ALL', 'US', 'India', 'Europe', 'Asia'].map((exchange) => (
            <button
              key={exchange}
              onClick={() => setSelectedExchangeFilter(exchange)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedExchangeFilter === exchange
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {exchange === 'ALL' ? '🌍 Global Universe' : exchange}
            </button>
          ))}
        </div>

        {/* METRICS METADATA ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 font-medium">Fake Capital Holdings Balance</p>
            <p className="text-xl font-mono font-semibold mt-1 text-slate-200">${cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 font-medium">Securities Value Under Management</p>
            <p className="text-xl font-mono font-semibold mt-1 text-cyan-400">${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-400 font-medium">Simulation Mode Toggle</p>
              <button onClick={() => !marketStatus.closed && setIsManualSim(!isManualSim)} disabled={marketStatus.closed} className={`text-xs mt-1 px-2.5 py-1 rounded font-semibold border ${marketStatus.closed ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                {marketStatus.closed ? '🔒 Engine Paused' : isManualSim ? '⏸️ Sandbox Sim Active' : '⚡ Live Matrix'}
              </button>
            </div>
            <button onClick={() => fetchMarketData(null, true)} disabled={isManualSim || marketStatus.closed} className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold disabled:opacity-40 disabled:cursor-not-allowed">🔄 Sync API</button>
          </div>
        </div>

        {/* MAIN BODY LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COLUMN 1 & 2: MARKET TILES AND TRADE CONTROL PANEL */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* LIVE BOARD & TICKER ADDER */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Asset Watchlist & Ingestion Panel</h2>
                
                {/* Search Form */}
                <form onSubmit={handleAddTicker} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={marketStatus.closed}
                    placeholder={marketStatus.closed ? "Market Closed" : "Add Ticker (e.g. INFY.NSE)"}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono w-full sm:w-48 disabled:cursor-not-allowed disabled:bg-slate-900/40"
                  />
                  <button
                    type="submit"
                    disabled={marketStatus.closed}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition whitespace-nowrap disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    + Track
                  </button>
                </form>
              </div>

              {/* Watchlist Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredWatchlist.map((ticker) => {
                  const stock = marketStocks[ticker];
                  if (!stock || marketStatus.closed) {
                    return (
                      <div key={ticker} className="p-4 rounded-lg border border-slate-800/50 bg-slate-950/20 flex justify-between items-center opacity-70">
                        <span className="font-mono font-bold text-slate-400">{ticker}</span>
                        <span className="text-xs text-slate-500 font-mono">--</span>
                      </div>
                    );
                  }
                  const isPositive = stock.change >= 0;
                  return (
                    <div 
                      key={ticker} 
                      onClick={() => setSelectedTicker(ticker)}
                      className={`p-4 rounded-lg border transition cursor-pointer ${
                        selectedTicker === ticker 
                          ? 'bg-slate-800/80 border-cyan-500' 
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono font-bold text-lg">{ticker}</span>
                          <p className="text-[11px] text-slate-400 truncate max-w-[150px]">{stock.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-base">${stock.price.toFixed(2)}</p>
                          <span className={`text-xs font-mono font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{stock.change.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TRANSACTION TERMINAL */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Simulated Execution Terminal</h2>
              {marketStocks[selectedTicker] && !marketStatus.closed ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Target Trading Instrument</span>
                    <span className="text-lg font-bold font-mono text-cyan-400">{selectedTicker}</span>
                    <span className="text-sm text-slate-300 ml-2 font-mono">
                      @ ${marketStocks[selectedTicker].price.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">Shares Volume:</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={tradeShares}
                      onChange={(e) => setTradeShares(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center font-mono focus:outline-none focus:border-cyan-500 text-white"
                    />
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                      onClick={handleBuy}
                      className="flex-1 sm:flex-none font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg transition text-sm text-center"
                    >
                      Buy Order
                    </button>
                    <button 
                      onClick={handleSell}
                      className="flex-1 sm:flex-none font-semibold bg-rose-600 hover:bg-rose-500 text-white px-6 py-2 rounded-lg transition text-sm text-center"
                    >
                      Sell Order
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-2">
                  {marketStatus.closed ? "Orders suspended. Terminal execution fields are locked outside market operational frameworks." : "Select a symbol from your watchlist to access transaction fields."}
                </p>
              )}
            </div>

            {/* PORTFOLIO LIST */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Your Position Portfolio</h2>
              {portfolio.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No active stock holdings found. Expand your watchlist to begin.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs">
                        <th className="pb-2">Ticker</th>
                        <th className="pb-2">Shares Owned</th>
                        <th className="pb-2">Avg Buy Price</th>
                        <th className="pb-2">Current Value</th>
                        <th className="pb-2 text-right">Unrealized Net P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {portfolio.map((pos) => {
                        const currentPrice = marketStocks[pos.ticker]?.price;
                        const displayPrice = marketStatus.closed || !currentPrice ? '--' : `$${currentPrice.toFixed(2)}`;
                        const pnl = marketStatus.closed || !currentPrice ? null : (currentPrice - pos.avgBuyPrice) * pos.shares;
                        return (
                          <tr key={pos.ticker} className="hover:bg-slate-800/30">
                            <td className="py-3 font-bold text-slate-200">{pos.ticker}</td>
                            <td className="py-3 text-slate-300">{pos.shares}</td>
                            <td className="py-3 text-slate-400">${pos.avgBuyPrice.toFixed(2)}</td>
                            <td className="py-3 font-semibold text-slate-200">{displayPrice}</td>
                            <td className={`py-3 text-right font-bold ${pnl !== null && pnl >= 0 ? 'text-emerald-400' : pnl !== null ? 'text-rose-400' : 'text-slate-400'}`}>
                              {pnl === null ? '--' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* SIDEBAR: AI DIAGNOSTICS */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 min-h-[300px]">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                <span className="text-purple-400">💡</span>
                <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Cross-Market Diagnostics</h2>
              </div>

              {autopsyReport ? (
                <div className="space-y-4">
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-slate-300">
                    Position liquidation completed on <strong className="text-rose-400">{autopsyReport.ticker}</strong> at a <span className="font-bold text-rose-400">{autopsyReport.dropPct}% loss</span>.
                  </div>
                  {autopsyReport.diagnostics.map((item, idx) => (
                    <div key={idx} className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800 leading-relaxed">
                      {item.split('**').map((chunk, i) => i % 2 === 1 ? <strong key={i} className="text-cyan-400 font-semibold">{chunk}</strong> : chunk)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs p-4">
                  <p>{marketStatus.closed ? "Terminal System Offline" : "Telemetry Engine Online..."}</p>
                  <p className="text-slate-600 mt-2">
                    {marketStatus.closed ? "Data ingestion pipelines are closed due to schedule limits. Adjust date settings above to simulate trading hours." : "Realized cross-market exits failing baseline profitability thresholds automatically execute analytical loss post-mortems here."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
