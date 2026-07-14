'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// Default global watchlist
const DEFAULT_WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'AMZN'];

// Baseline fallback prices
const BASELINE_STOCKS = {
  AAPL: { name: 'Apple Inc.', price: 175.00, change: 0.5, rsi: 72, volume: 'High' },
  TSLA: { name: 'Tesla Inc.', price: 220.00, change: -1.2, rsi: 38, volume: 'Extreme' },
  NVDA: { name: 'NVIDIA Corp.', price: 850.00, change: 2.4, rsi: 81, volume: 'Normal' },
  AMZN: { name: 'Amazon.com Inc.', price: 178.00, change: -0.3, rsi: 48, volume: 'Low' },
};

const MARKET_HOLIDAYS = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-04',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
  '2025-01-01',
  '2025-01-20',
  '2025-02-17',
  '2025-04-18',
  '2025-05-26',
  '2025-06-19',
  '2025-07-04',
  '2025-09-01',
  '2025-11-27',
  '2025-12-25',
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
  const [cash, setCash] = useState(10000.00);
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [marketStocks, setMarketStocks] = useState({});
  const [portfolio, setPortfolio] = useState([
    { ticker: 'AAPL', shares: 10, avgBuyPrice: 185.00 }, // Default holding at a loss for AI diagnostic demonstration
    { ticker: 'TSLA', shares: 5, avgBuyPrice: 210.00 }
  ]);
  const [selectedTicker, setSelectedTicker] = useState('AAPL');
  const [searchQuery, setSearchQuery] = useState('');
  const [tradeShares, setTradeShares] = useState(1);
  const [autopsyReport, setAutopsyReport] = useState(null);
  
  // Environment & Connection States
  const [apiMode, setApiMode] = useState('Checking...'); // 'TwelveData' | 'Simulation' | 'Checking...'
  const [isManualSim, setIsManualSim] = useState(false); // Let user freeze API manually to save credits
  const [apiError, setApiError] = useState(null);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [rateLimitTimer, setRateLimitTimer] = useState(0); // Tracks rate limit lock countdown
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

  const formatSelectedDate = (value) => {
    if (!value) return 'No date selected';
    const parsedDate = new Date(`${value}T12:00:00`);
    return parsedDate.toLocaleDateString('en', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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

    for (let index = 0; index < leadingDays; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  };

  // --- HYDROGUARD: Prevent Hydration Mismatch ---
  useEffect(() => {
    setMounted(true);
    // Load cash and portfolio if stored locally
    const savedCash = localStorage.getItem('apex_cash');
    const savedPortfolio = localStorage.getItem('apex_portfolio');
    const savedWatchlist = localStorage.getItem('apex_watchlist');
    if (savedCash) setCash(parseFloat(savedCash));
    if (savedPortfolio) setPortfolio(JSON.parse(savedPortfolio));
    if (savedWatchlist) setWatchlist(JSON.parse(savedWatchlist));
  }, []);

  // Save progress persistently on local actions
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('apex_cash', cash.toString());
    localStorage.setItem('apex_portfolio', JSON.stringify(portfolio));
    localStorage.setItem('apex_watchlist', JSON.stringify(watchlist));
  }, [cash, portfolio, watchlist, mounted]);

  // --- TOAST NOTIFICATIONS ---
  const triggerNotification = (message, type = 'info') => {
    setFeedbackMsg({ text: message, type });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // Saves current prices in sessionStorage to protect against aggressive hot reloads
  const saveCache = (data) => {
    try {
      const cacheObj = {
        timestamp: Date.now(),
        stocks: data
      };
      sessionStorage.setItem('apex_market_cache', JSON.stringify(cacheObj));
    } catch (e) {
      console.warn('Session caching not supported/allowed:', e);
    }
  };

  // Retrieves price cache if it is fresher than 60 seconds
  const loadCache = () => {
    try {
      const cached = sessionStorage.getItem('apex_market_cache');
      if (cached) {
        const { timestamp, stocks } = JSON.parse(cached);
        if (Date.now() - timestamp < 60000) {
          return stocks;
        }
      }
    } catch (e) {
      console.warn('Session cache load error:', e);
    }
    return null;
  };

  // --- PARSE TWELVE DATA API RESPONSES ---
  const parseTwelveDataQuotes = (data) => {
    if (!data || data.status === 'error' || data.code >= 400) {
      return null;
    }

    const parsed = {};
    
    // Case 1: Single symbol flat object
    if (data.symbol) {
      parsed[data.symbol] = {
        name: data.name || data.symbol,
        price: parseFloat(data.close || data.price || 0),
        change: parseFloat(data.percent_change || 0),
        volume: parseFloat(data.volume || 0) > 50000000 ? 'High' : 'Normal',
        rsi: parseFloat(data.rsi || (50 + (parseFloat(data.percent_change || 0) * 4)).toFixed(1))
      };
      return parsed;
    }

    // Case 2: Multi-symbol map
    Object.keys(data).forEach((key) => {
      const stock = data[key];
      if (stock && stock.symbol) {
        parsed[stock.symbol] = {
          name: stock.name || stock.symbol,
          price: parseFloat(stock.close || stock.price || 0),
          change: parseFloat(stock.percent_change || 0),
          volume: parseFloat(stock.volume || 0) > 50000000 ? 'High' : 'Normal',
          rsi: parseFloat((50 + (parseFloat(stock.percent_change || 0) * 4)).toFixed(1))
        };
      }
    });

    return Object.keys(parsed).length > 0 ? parsed : null;
  };

  // Price Simulation Core (Smooth random-walk progression starting from last actual prices)
  const runSimulationTick = useCallback(() => {
    setMarketStocks((prevStocks) => {
      const base = Object.keys(prevStocks).length > 0 ? prevStocks : BASELINE_STOCKS;
      const updated = { ...base };
      
      Object.keys(updated).forEach((ticker) => {
        if (!updated[ticker]) {
          updated[ticker] = { name: `${ticker} Corp.`, price: 100.00, change: 0, rsi: 50, volume: 'Normal' };
        }
        const percentChange = (Math.random() * 1.6 - 0.8) / 100; // -0.8% to +0.8% random walk
        updated[ticker].price = Math.max(1, +(updated[ticker].price * (1 + percentChange)).toFixed(2));
        updated[ticker].change = +(updated[ticker].change + percentChange * 10).toFixed(2);
        updated[ticker].rsi = Math.max(10, Math.min(95, +(updated[ticker].rsi + (Math.random() * 4 - 2)).toFixed(1)));
      });
      return updated;
    });
  }, []);

  // API Fetch Core with multi-tier failguards
  const fetchMarketData = useCallback(async (forcedSymbols = null, bypassCache = false, dateOverride = null, timeOverride = null) => {
    const symbolsToFetch = forcedSymbols || Array.from(new Set([...watchlist, ...portfolio.map(p => p.ticker)]));
    const selectedDateValue = dateOverride || selectedDate || getCurrentDateValue();
    const selectedTimeValue = timeOverride || selectedTime || getCurrentTimeValue();

    if (isManualSim) {
      setApiMode('Simulation');
      if (isMarketClosedForDate(selectedDateValue, selectedTimeValue)) {
        setMarketStatus({ closed: true, message: 'Market Closed.' });
        setLastExtractedAt(new Date());
        return;
      }
      runSimulationTick();
      setLastExtractedAt(new Date());
      return;
    }

    if (isMarketClosedForDate(selectedDateValue, selectedTimeValue)) {
      setMarketStatus({ closed: true, message: 'Market Closed.' });
      setMarketStocks((prevStocks) => {
        const nextStocks = { ...prevStocks };
        symbolsToFetch.forEach((ticker) => {
          nextStocks[ticker] = prevStocks[ticker]
            ? { ...prevStocks[ticker], price: null, marketClosed: true }
            : { name: ticker, price: null, change: 0, rsi: 50, volume: 'Normal', marketClosed: true };
        });
        return nextStocks;
      });
      setApiMode('TwelveData');
      setApiError(null);
      setLastExtractedAt(new Date());
      return;
    }

    if (!bypassCache && selectedDateValue === getCurrentDateValue()) {
      const cachedData = loadCache();
      if (cachedData) {
        setMarketStocks(cachedData);
        setMarketStatus({ closed: false, message: '' });
        setApiMode('TwelveData');
        setApiError(null);
        setLastExtractedAt(new Date());
        return;
      }
    }

    try {
      const response = await fetch(`/api/market-data?date=${encodeURIComponent(selectedDateValue)}&time=${encodeURIComponent(selectedTimeValue)}&symbols=${encodeURIComponent(symbolsToFetch.join(','))}`);
      const payload = await response.json();

      if (payload.marketClosed) {
        setMarketStatus({ closed: true, message: payload.message || 'Market Closed.' });
        setMarketStocks(payload.stocks || {});
        setApiMode('TwelveData');
        setApiError(null);
        setLastExtractedAt(new Date());
        return;
      }

      setMarketStatus({ closed: false, message: '' });
      setMarketStocks(payload.stocks || {});
      saveCache(payload.stocks || {});
      setApiMode('TwelveData');
      setApiError(null);
      setLastExtractedAt(new Date());
    } catch (err) {
      console.warn('Market data fetch issue, engaging simulation backup:', err);
      setApiMode('Simulation');
      setApiError('Connection issue. Local simulation backup engaged.');
      setMarketStatus({ closed: false, message: '' });
      runSimulationTick();
      setLastExtractedAt(new Date());
    }
  }, [watchlist, portfolio, runSimulationTick, isManualSim, selectedDate, selectedTime]);

  // Auto-refresh loops
  useEffect(() => {
    if (!mounted) return;
    fetchMarketData();

    const activeInterval = setInterval(() => {
      if (apiMode === 'TwelveData' && !isManualSim && rateLimitTimer === 0) {
        fetchMarketData(null, true); // Force actual fetch
      } else {
        runSimulationTick();
      }
    }, 15000); // Poll every 15s (safely batching watchlist together)

    return () => clearInterval(activeInterval);
  }, [mounted, fetchMarketData, apiMode, runSimulationTick, isManualSim, rateLimitTimer]);

  useEffect(() => {
    if (!mounted) return;

    const progressionInterval = setInterval(() => {
      const nextTick = new Date(playbackClockRef.current.getTime() + 60_000);
      playbackClockRef.current = nextTick;
      const nextDateValue = toDateInputValue(nextTick);
      const nextTimeValue = toTimeInputValue(nextTick);
      setSelectedDate(nextDateValue);
      setSelectedTime(nextTimeValue);
      setCalendarSelectionDate(nextDateValue);
      setCalendarSelectionTime(nextTimeValue);
      setTimeInputDraft(nextTimeValue);
      fetchMarketData(null, true, nextDateValue, nextTimeValue);
    }, 60000);

    return () => clearInterval(progressionInterval);
  }, [mounted, fetchMarketData]);

  // Timers countdown
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
    if (!isValidTimeValue(nextTime)) {
      setTimeInputError('Please use a valid time between 00:00 and 23:59.');
      return;
    }

    setSelectedDate(nextDate);
    setSelectedTime(nextTime);
    setCalendarSelectionDate(nextDate);
    setCalendarSelectionTime(nextTime);
    setTimeInputDraft(nextTime);
    setTimeInputError('');
    playbackClockRef.current = new Date(`${nextDate}T${nextTime}`);
    setCalendarViewDate(new Date(`${nextDate}T12:00:00`));
    fetchMarketData(null, true, nextDate, nextTime);
  };

  const handleTodaySelection = () => {
    const today = getCurrentDateValue();
    const now = getCurrentTimeValue();
    setCalendarSelectionDate(today);
    setCalendarSelectionTime(now);
    setTimeInputDraft(now);
    setTimeInputError('');
    setCalendarViewDate(new Date());
    setSelectedDate(today);
    setSelectedTime(now);
    playbackClockRef.current = new Date(`${today}T${now}`);
    fetchMarketData(null, true, today, now);
  };

  // Trigger manual sync
  const triggerManualRefresh = () => {
    if (refreshCooldown > 0) return;
    setRefreshCooldown(12);
    fetchMarketData(null, true);
  };

  const handleTimeDraftChange = (event) => {
    const rawValue = event.target.value;
    const digitsOnly = String(rawValue || '').replace(/\D/g, '').slice(0, 4);
    const nextDraft = digitsOnly.length <= 2 ? digitsOnly : `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2, 4)}`;
    const candidate = normalizeTimeValue(nextDraft);

    if (!nextDraft) {
      setTimeInputDraft('');
      setTimeInputError('');
      return;
    }

    if (isValidTimeValue(candidate)) {
      setCalendarSelectionTime(candidate);
      setTimeInputDraft(candidate);
      setTimeInputError('');
      return;
    }

    setTimeInputDraft(nextDraft);
    setTimeInputError('Please use a valid time between 00:00 and 23:59.');
  };

  const updateTimeField = (field, direction) => {
    const nextTime = getAdjustedTimeValue(calendarSelectionTime || getCurrentTimeValue(), field, direction);
    setCalendarSelectionTime(nextTime);
    setTimeInputDraft(nextTime);
    setTimeInputError('');
  };

  // Dynamic global search and lookup
  const handleAddTicker = async (e) => {
    e.preventDefault();
    const symbol = searchQuery.toUpperCase().trim();
    if (!symbol) return;

    if (watchlist.includes(symbol)) {
      triggerNotification('Asset is already on your watchlist!', 'warning');
      setSearchQuery('');
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY;

    if (!apiKey || isManualSim) {
      // Direct simulated addition
      const simulatedPrice = +(Math.random() * 400 + 10).toFixed(2);
      setMarketStocks((prev) => ({
        ...prev,
        [symbol]: { name: `${symbol} Corp. (Sim)`, price: simulatedPrice, change: 0, rsi: 50, volume: 'Normal' }
      }));
      setWatchlist((prev) => [...prev, symbol]);
      setSelectedTicker(symbol);
      setSearchQuery('');
      triggerNotification(`Added ${symbol} via Local Simulation Engine!`, 'success');
      return;
    }

    triggerNotification(`Verifying dynamic ticker "${symbol}" on Twelve Data global matrix...`, 'info');
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code === 400 || data.status === 'error') {
        triggerNotification(`Could not find global stock matching "${symbol}". Use format like AAPL, INFY.NSE, or BARC.LSE.`, 'error');
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
      triggerNotification('API connection error during verification lookup.', 'error');
    }
  };

  // Transaction routines
  const handleBuy = () => {
    const currentStock = marketStocks[selectedTicker];
    if (!currentStock) return;

    const currentPrice = currentStock.price;
    const totalCost = currentPrice * tradeShares;

    if (cash < totalCost) {
      triggerNotification('Insufficient simulated funds for this purchase!', 'error');
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
      return [...prevPortfolio, { ticker: selectedTicker, shares: tradeShares, avgBuyPrice: currentPrice }];
    });
    triggerNotification(`Successfully bought ${tradeShares} shares of ${selectedTicker}!`, 'success');
  };

  const handleSell = () => {
    const currentStock = marketStocks[selectedTicker];
    if (!currentStock) return;

    const currentPrice = currentStock.price;
    const position = portfolio.find(p => p.ticker === selectedTicker);

    if (!position || position.shares < tradeShares) {
      triggerNotification("You do not own enough shares of this asset to sell.", 'error');
      return;
    }

    const totalCredit = currentPrice * tradeShares;
    const lossRealized = currentPrice < position.avgBuyPrice;

    if (lossRealized) {
      triggerLossAutopsy(selectedTicker, position.avgBuyPrice, currentPrice, currentStock);
    } else {
      setAutopsyReport(null);
    }

    setCash(prev => prev + totalCredit);
    setPortfolio(prevPortfolio => {
      return prevPortfolio.map(p => {
        if (p.ticker === selectedTicker) {
          return { ...p, shares: p.shares - tradeShares };
        }
        return p;
      }).filter(p => p.shares > 0);
    });
    triggerNotification(`Successfully liquidated ${tradeShares} shares of ${selectedTicker}!`, 'success');
  };

  const triggerLossAutopsy = (ticker, buyPrice, sellPrice, marketMetadata) => {
    const dropPct = (((buyPrice - sellPrice) / buyPrice) * 100).toFixed(1);
    
    let diagnosticAlerts = [];
    if (marketMetadata.rsi > 70) {
      diagnosticAlerts.push(`⚠️ **Overbought Technical Trap (RSI: ${marketMetadata.rsi}):** You entered or held when the asset was overextended. Institutional algorithms frequently distribute/sell into retail hype cycles.`);
    }
    if (marketMetadata.rsi < 40) {
      diagnosticAlerts.push(`⚠️ **Falling Knife Vector (RSI: ${marketMetadata.rsi}):** The asset was experiencing structural downward pressure. Buying the dip without confirmed base-building support levels often triggers capital dilution.`);
    }
    if (marketMetadata.volume === 'High' || marketMetadata.volume === 'Extreme') {
      diagnosticAlerts.push(`⚠️ **High Volume Outflow:** The trade occurred during elevated institutional distribution block orders, meaning major players were aggressively rotating money out of the security.`);
    }

    if (diagnosticAlerts.length === 0) {
      diagnosticAlerts.push(`⚠️ **Macro Friction and Trend Exhaustion:** The position slipped past its entry defenses due to shifting global macro momentum trends and baseline index exhaustion.`);
    }

    setAutopsyReport({
      ticker,
      dropPct,
      buyPrice,
      sellPrice,
      diagnostics: diagnosticAlerts
    });
  };

  const calculatePortfolioValue = () => {
    return portfolio.reduce((acc, curr) => {
      const currentPrice = marketStocks[curr.ticker]?.price || curr.avgBuyPrice;
      return acc + (curr.shares * currentPrice);
    }, 0);
  };

  const totalPortfolioValue = calculatePortfolioValue();
  const netWorth = cash + totalPortfolioValue;
  const calendarDays = getCalendarDays(calendarViewDate);

  // Hydration protection loader
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto"></div>
          <p className="text-sm text-slate-400">Syncing Twelve Data Global Pipelines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="sticky top-0 z-40 rounded-2xl border border-cyan-500/20 bg-slate-900/95 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-cyan-400">Planning Dashboard</p>
              <h2 className="text-xl font-semibold text-slate-100">{formatSelectedDate(selectedDate)}</h2>
              <p className="text-sm text-slate-400">
                Extraction target: <span className="font-semibold text-slate-200">{formatSelectedDateTime(selectedDate, selectedTime)}</span>
              </p>
              <p className="text-sm text-slate-400">
                Last fetch: <span className="font-semibold text-slate-200">{formatTimestamp(lastExtractedAt)}</span>
              </p>
              {marketStatus.closed && (
                <p className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-300">
                  {marketStatus.message || 'Market Closed.'}
                </p>
              )}
            </div>

            <div className="relative flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/80 p-3 sm:min-w-[310px]">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((open) => !open)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left transition hover:border-cyan-500/40"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Calendar Date</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{formatSelectedDate(calendarSelectionDate)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmSelectedDate();
                    setIsCalendarOpen(false);
                  }}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-400 transition hover:bg-cyan-500/20"
                >
                  Enter
                </button>
              </div>

              <div className={`absolute right-0 top-full z-50 mt-2 w-full min-w-[280px] overflow-hidden rounded-xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl shadow-cyan-950/30 transition-all duration-300 ease-out ${isCalendarOpen ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                {isCalendarOpen ? (
                  <div className="space-y-3">
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Extraction Time</span>
                      <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Hours</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateTimeField('hour', -1)}
                                className="h-8 w-8 rounded-full border border-slate-700 text-sm text-slate-200"
                              >
                                −
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={timeInputDraft.split(':')[0] || '00'}
                                onChange={(event) => {
                                  const hours = String(event.target.value || '').replace(/\D/g, '').slice(0, 2);
                                  const nextValue = `${hours.padStart(2, '0')}:${(timeInputDraft.split(':')[1] || '00')}`;
                                  if (isValidTimeValue(nextValue)) {
                                    setCalendarSelectionTime(nextValue);
                                    setTimeInputDraft(nextValue);
                                    setTimeInputError('');
                                  } else {
                                    setTimeInputDraft(nextValue);
                                    setTimeInputError('Please use a valid time between 00:00 and 23:59.');
                                  }
                                }}
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateTimeField('hour', 1)}
                                className="h-8 w-8 rounded-full border border-slate-700 text-sm text-slate-200"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Minutes</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateTimeField('minute', -1)}
                                className="h-8 w-8 rounded-full border border-slate-700 text-sm text-slate-200"
                              >
                                −
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={timeInputDraft.split(':')[1] || '00'}
                                onChange={(event) => {
                                  const minutes = String(event.target.value || '').replace(/\D/g, '').slice(0, 2);
                                  const nextValue = `${(timeInputDraft.split(':')[0] || '00')}:${minutes.padStart(2, '0')}`;
                                  if (isValidTimeValue(nextValue)) {
                                    setCalendarSelectionTime(nextValue);
                                    setTimeInputDraft(nextValue);
                                    setTimeInputError('');
                                  } else {
                                    setTimeInputDraft(nextValue);
                                    setTimeInputError('Please use a valid time between 00:00 and 23:59.');
                                  }
                                }}
                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateTimeField('minute', 1)}
                                className="h-8 w-8 rounded-full border border-slate-700 text-sm text-slate-200"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={timeInputDraft}
                          onChange={handleTimeDraftChange}
                          placeholder="HH:MM"
                          className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                        />
                        {timeInputError ? <p className="mt-2 text-xs text-rose-400">{timeInputError}</p> : null}
                      </div>
                    </label>

                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1))}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-300"
                      >
                        ←
                      </button>
                      <span className="text-sm font-semibold text-slate-200">
                        {calendarViewDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1))}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-300"
                      >
                        →
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayLabel) => (
                        <span key={dayLabel} className="py-1 font-semibold uppercase tracking-[0.2em]">
                          {dayLabel}
                        </span>
                      ))}
                      {calendarDays.map((day, index) => {
                        if (!day) {
                          return <span key={`empty-${index}`} className="h-8 rounded-lg" />;
                        }

                        const dayValue = toDateInputValue(day);
                        const isSelected = dayValue === calendarSelectionDate;
                        const inCurrentMonth = day.getMonth() === calendarViewDate.getMonth();

                        return (
                          <button
                            key={dayValue}
                            type="button"
                            onClick={() => handleCalendarDateSelect(dayValue)}
                            className={`h-8 rounded-lg text-sm transition ${
                              isSelected
                                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                                : inCurrentMonth
                                  ? 'bg-slate-950 text-slate-200 hover:bg-slate-800'
                                  : 'bg-slate-900/70 text-slate-500 hover:bg-slate-800/70'
                            }`}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleTodaySelection();
                        setIsCalendarOpen(false);
                      }}
                      className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                    >
                      Jump to Today
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        
        {/* TOAST SYSTEM */}
        {feedbackMsg && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl border text-sm max-w-sm transition-all duration-300 ${
            feedbackMsg.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300' :
            feedbackMsg.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-300' :
            feedbackMsg.type === 'warning' ? 'bg-amber-950/90 border-amber-500/50 text-amber-300' :
            'bg-slate-900/90 border-slate-700/50 text-slate-300'
          }`}>
            {feedbackMsg.text}
          </div>
        )}

        {/* HEADER */}
        <header className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">ApexTrader Sim</h1>
              <span className={`text-[10px] uppercase tracking-wider font-mono font-bold px-2 py-0.5 rounded ${
                apiMode === 'TwelveData' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              }`}>
                {apiMode} Mode
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Real-Time Global Market Sandbox with Twelve Data Ingestion</p>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Net Worth (Simulated)</span>
            <div className="text-2xl md:text-3xl font-mono font-bold text-emerald-400">
              ${netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </header>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
            <p className="text-xs text-slate-400 font-medium">Available Fake Cash</p>
            <p className="text-xl font-mono font-semibold mt-1 text-slate-200">
              ${cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
            <p className="text-xs text-slate-400 font-medium">Invested Securities Value</p>
            <p className="text-xl font-mono font-semibold mt-1 text-cyan-400">
              ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-400 font-medium">Execution Engine</p>
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={() => setIsManualSim(!isManualSim)}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition ${
                    isManualSim 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                  }`}
                >
                  {isManualSim ? '⏸️ Saved Simulation' : '⚡ Live Quotes'}
                </button>
              </div>
            </div>
            <button 
              onClick={triggerManualRefresh}
              disabled={refreshCooldown > 0 || isManualSim}
              className={`p-2 rounded-lg border text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                refreshCooldown > 0 || isManualSim
                  ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed' 
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
              }`}
            >
              🔄 {refreshCooldown > 0 ? `${refreshCooldown}s` : 'Sync API'}
            </button>
          </div>
        </div>

        {/* FEEDBACK & DEBUG ALERTS */}
        {rateLimitTimer > 0 && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
            <span className="animate-pulse">🛑</span>
            <p>
              Twelve Data rate ceiling reached (8 calls/min limit). Auto-simulation engaged. Live pipeline reconnects in <strong>{rateLimitTimer}s</strong>.
            </p>
          </div>
        )}

        {apiError && rateLimitTimer === 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-center gap-2">
            <span>ℹ️</span>
            <p>{apiError}</p>
          </div>
        )}

        {/* MAIN BODY LAYOUT */}
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,280px)_minmax(0,2fr)]">
          <aside className="bg-slate-900 border border-slate-800/80 rounded-3xl p-4 transition-all duration-300">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Market Navigator</p>
                <h2 className="text-lg font-semibold text-slate-100">Regional Dashboard</h2>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/80 text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                {sidebarOpen ? '«' : '»'}
              </button>
            </div>

            <div className={`mt-6 space-y-3 ${sidebarOpen ? 'opacity-100' : 'opacity-30'} transition-opacity duration-300`}>
              <button
                type="button"
                onClick={() => setMarketRegion('US')}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${marketRegion === 'US' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900'}`}
              >
                <p className="text-sm font-semibold">US Stock Market</p>
                <p className="text-xs text-slate-400 mt-1">Current dashboard view</p>
              </button>

              <button
                type="button"
                onClick={() => setMarketRegion('IN')}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${marketRegion === 'IN' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900'}`}
              >
                <p className="text-sm font-semibold">Indian Stock Market</p>
                <p className="text-xs text-slate-400 mt-1">Clear dashboard layout for now</p>
              </button>
            </div>

            {sidebarOpen && (
              <div className="mt-6 rounded-3xl border border-slate-800/70 bg-slate-950/70 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Status</p>
                <p className="mt-3 text-sm text-slate-200">
                  {marketRegion === 'US'
                    ? 'US stock dashboard is active and live.'
                    : 'Indian stock dashboard is intentionally clear for this version.'}
                </p>
              </div>
            )}
          </aside>

          <div className="space-y-6">
            {marketRegion === 'IN' ? (
              <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-8 text-center">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 text-2xl">
                  🇮🇳
                </div>
                <h2 className="mt-6 text-xl font-semibold text-slate-100">Indian Stock Market Dashboard</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400 max-w-2xl mx-auto">
                  This regional view is intentionally kept clean for now. Select the US Stock Market to return to the active ApexTrader simulation dashboard.
                </p>
              </div>
            ) : (
              <>
                {/* LIVE BOARD & TICKER ADDER */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Asset Watchlist & Ingestion Panel</h2>
                    <form onSubmit={handleAddTicker} className="flex gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Add Ticker (e.g. INFY.NSE)"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono w-full sm:w-48"
                      />
                      <button
                        type="submit"
                        className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition whitespace-nowrap"
                      >
                        + Track
                      </button>
                    </form>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {watchlist.map((ticker) => {
                      const stock = marketStocks[ticker];
                      if (!stock) {
                        return (
                          <div key={ticker} className="p-4 rounded-lg border border-slate-800/50 bg-slate-950/20 flex justify-between items-center animate-pulse">
                            <span className="font-mono font-bold text-slate-500">{ticker}</span>
                            <span className="text-xs text-slate-600 font-mono">Resolving...</span>
                          </div>
                        );
                      }
                      const isPositive = stock.change >= 0;
                      const isClosedPrice = marketStatus.closed || stock.marketClosed || stock.price === null;
                      const displayPrice = isClosedPrice ? '--' : `$${stock.price.toFixed(2)}`;
                      const displayChange = isClosedPrice ? '--' : `${isPositive ? '+' : ''}${stock.change.toFixed(2)}%`;
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
                              <p className="font-mono font-bold text-base">{displayPrice}</p>
                              <span className={`text-xs font-mono font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {displayChange}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Simulated Execution Terminal</h2>
                  {marketStocks[selectedTicker] ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs text-slate-400 block mb-1">Target Trading Instrument</span>
                        <span className="text-lg font-bold font-mono text-cyan-400">{selectedTicker}</span>
                        <span className="text-sm text-slate-300 ml-2 font-mono">
                          @ {marketStatus.closed || marketStocks[selectedTicker].marketClosed || marketStocks[selectedTicker].price === null ? '--' : `$${marketStocks[selectedTicker].price.toFixed(2)}`}
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
                          disabled={marketStatus.closed}
                          className={`flex-1 sm:flex-none font-semibold px-6 py-2 rounded-lg transition text-sm text-center ${marketStatus.closed ? 'cursor-not-allowed bg-slate-700 text-slate-400' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                        >
                          Buy Order
                        </button>
                        <button
                          onClick={handleSell}
                          disabled={marketStatus.closed}
                          className={`flex-1 sm:flex-none font-semibold px-6 py-2 rounded-lg transition text-sm text-center ${marketStatus.closed ? 'cursor-not-allowed bg-slate-700 text-slate-400' : 'bg-rose-600 hover:bg-rose-500 text-white'}`}
                        >
                          Sell Order
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-2">Select a symbol from your watchlist or add one above to access transaction fields.</p>
                  )}
                </div>

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
                            const displayPrice = marketStatus.closed || currentPrice === null || currentPrice === undefined ? '--' : `$${(currentPrice).toFixed(2)}`;
                            const value = currentPrice === null || currentPrice === undefined ? 0 : pos.shares * currentPrice;
                            const pnl = currentPrice === null || currentPrice === undefined ? null : (currentPrice - pos.avgBuyPrice) * pos.shares;
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
              </>
            )}

            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                <span className="p-1.5 bg-purple-500/10 text-purple-400 rounded">💡</span>
                <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">AI Loss Autopsy Console</h2>
              </div>

              {autopsyReport ? (
                <div className="space-y-4 animate-fadeIn">
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs">
                    <p className="text-slate-300 font-medium">
                      Position exit completed on <span className="text-rose-400 font-bold">{autopsyReport.ticker}</span> at a <span className="font-bold text-rose-400">{autopsyReport.dropPct}% realized loss</span>.
                    </p>
                    <div className="mt-2 grid grid-cols-2 text-[11px] font-mono text-slate-400">
                      <div>Cost Basis: ${autopsyReport.buyPrice}</div>
                      <div>Liquidation Price: ${autopsyReport.sellPrice}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Identified Risk Core Vectors:</h3>
                    {autopsyReport.diagnostics.map((item, idx) => (
                      <div key={idx} className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800 leading-relaxed">
                        {item.split('**').map((chunk, i) => i % 2 === 1 ? <strong key={i} className="text-cyan-400 font-semibold">{chunk}</strong> : chunk)}
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500 leading-normal italic pt-2">
                    Note: This telemetry diagnostic checks relative indicator metrics (RSI, distribution volume levels) mapping out pre-sell triggers to improve structural trading discipline.
                  </p>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 p-4 space-y-2">
                  <p className="text-sm">Telemetry Engine Active...</p>
                  <p className="text-xs text-slate-600 max-w-[200px]">If you close out an active asset position at a loss, the system will execute an algorithmic autopsy here to explain what went wrong.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}