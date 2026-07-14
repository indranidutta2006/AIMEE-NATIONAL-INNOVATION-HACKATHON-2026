'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// Replaced DEFAULT_WATCHLIST with top 15 major global and Indian companies
const TOP_15_COMPANIES = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 
  'META', 'TSLA', 'BRK.A', 'V', 'JPM', 
  'INFY.NSE', 'TCS.NSE', 'RELIANCE.NSE', 'HDFCBANK.NSE', 'BARC.LSE'
];

// Baseline fallback prices extended for structural safety
const BASELINE_STOCKS = {
  'AAPL': { name: 'Apple Inc. (NASDAQ)', price: 175.00, change: 0.5, rsi: 72, volume: 'High', exchange: 'US' },
  'MSFT': { name: 'Microsoft Corp (NASDAQ)', price: 420.00, change: 1.1, rsi: 65, volume: 'High', exchange: 'US' },
  'GOOGL': { name: 'Alphabet Inc. (NASDAQ)', price: 170.00, change: -0.4, rsi: 48, volume: 'Normal', exchange: 'US' },
  'AMZN': { name: 'Amazon.com Inc (NASDAQ)', price: 180.00, change: 0.8, rsi: 55, volume: 'High', exchange: 'US' },
  'NVDA': { name: 'NVIDIA Corp (NASDAQ)', price: 850.00, change: 3.2, rsi: 78, volume: 'Extreme', exchange: 'US' },
  'META': { name: 'Meta Platforms (NASDAQ)', price: 490.00, change: -1.5, rsi: 42, volume: 'Normal', exchange: 'US' },
  'TSLA': { name: 'Tesla Inc (NASDAQ)', price: 175.00, change: -2.0, rsi: 35, volume: 'High', exchange: 'US' },
  'BRK.A': { name: 'Berkshire Hathaway (NYSE)', price: 610000.00, change: 0.1, rsi: 50, volume: 'Low', exchange: 'US' },
  'V': { name: 'Visa Inc. (NYSE)', price: 275.00, change: 0.3, rsi: 52, volume: 'Normal', exchange: 'US' },
  'JPM': { name: 'JPMorgan Chase & Co (NYSE)', price: 195.00, change: 0.6, rsi: 58, volume: 'Normal', exchange: 'US' },
  'INFY.NSE': { name: 'Infosys Limited (NSE)', price: 1420.00, change: -1.2, rsi: 38, volume: 'Extreme', exchange: 'India' },
  'TCS.NSE': { name: 'Tata Consultancy Services (NSE)', price: 3900.00, change: 0.4, rsi: 51, volume: 'Normal', exchange: 'India' },
  'RELIANCE.NSE': { name: 'Reliance Industries (NSE)', price: 2950.00, change: 1.5, rsi: 63, volume: 'High', exchange: 'India' },
  'HDFCBANK.NSE': { name: 'HDFC Bank Ltd (NSE)', price: 1510.00, change: -0.8, rsi: 44, volume: 'High', exchange: 'India' },
  'BARC.LSE': { name: 'Barclays PLC (LSE)', price: 185.00, change: 2.4, rsi: 81, volume: 'Normal', exchange: 'Europe' }
};

const holidayCache = new Map();

// --- HELPER FUNCTIONS ---

const getNthWeekdayOfMonth = (year, month, dayOfWeek, n) => {
  let count = 0;
  const date = new Date(Date.UTC(year, month, 1));
  while (date.getUTCMonth() === month) {
    if (date.getUTCDay() === dayOfWeek) {
      count++;
      if (count === n) return date;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return null;
};

const getLastWeekdayOfMonth = (year, month, dayOfWeek) => {
  const date = new Date(Date.UTC(year, month + 1, 0));
  while (date.getUTCDay() !== dayOfWeek) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
};

const getGoodFriday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  const easter = new Date(Date.UTC(year, month, day));
  easter.setUTCDate(easter.getUTCDate() - 2);
  return easter;
};

const getObservedDate = (date) => {
  const day = date.getUTCDay();
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1); 
  if (day === 6) date.setUTCDate(date.getUTCDate() - 1); 
  return date;
};

const getMarketHolidaysForYear = (year) => {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const holidays = [
    getObservedDate(new Date(Date.UTC(year, 0, 1))),
    getNthWeekdayOfMonth(year, 0, 1, 3),
    getNthWeekdayOfMonth(year, 1, 1, 3),
    getGoodFriday(year),
    getLastWeekdayOfMonth(year, 4, 1),
    getObservedDate(new Date(Date.UTC(year, 5, 19))),
    getObservedDate(new Date(Date.UTC(year, 6, 4))),
    getNthWeekdayOfMonth(year, 8, 1, 1),
    getNthWeekdayOfMonth(year, 10, 4, 4),
    getObservedDate(new Date(Date.UTC(year, 11, 25))),
  ];

  const holidaySet = new Set(holidays.map(d => d.toISOString().split('T')[0]));
  holidayCache.set(year, holidaySet);
  return holidaySet;
};

// Clean timezone parsing decoupled from local machine timezone offsets
const isMarketClosedForDate = (value, timeValue = '12:00') => {
  if (!value) return true;

  const [yearStr, monthStr, dayStr] = value.split('-');
  const [hourStr, minuteStr] = timeValue.split(':');

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; 
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  const targetDate = new Date(Date.UTC(year, month, day, hour, minute));
  
  const dayOfWeek = targetDate.getUTCDay(); 
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const marketHolidays = getMarketHolidaysForYear(year);
  const normalizedDate = `${yearStr}-${monthStr}-${dayStr}`;
  if (marketHolidays.has(normalizedDate)) return true;

  const totalMinutes = hour * 60 + minute;
  return totalMinutes < 570 || totalMinutes >= 960;
};

const toNYDateInputValue = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const [{ value: month }, , { value: day }, , { value: year }] = formatter.formatToParts(date);
  return `${year}-${month}-${day}`;
};

const toNYTimeInputValue = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const [{ value: hour }, , { value: minute }] = formatter.formatToParts(date);
  return `${hour}:${minute}`;
};

// Returns a safe fallback date (Latest Monday if today is a weekend) to prevent initial blackouts
const getInitialOpenDateValue = () => {
  const d = new Date();
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  else if (day === 6) d.setDate(d.getDate() - 1);
  return toNYDateInputValue(d);
};

const getCurrentDateValue = () => toNYDateInputValue(new Date());
const getCurrentTimeValue = () => toNYTimeInputValue(new Date());

const isValidTimeValue = (value) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const normalizeTimeValue = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (!digits) return '00:00';
  
  if (digits.length <= 2) {
    const parsedHours = Number.parseInt(digits, 10) || 0;
    const hours = String(Math.min(23, Math.max(0, parsedHours))).padStart(2, '0');
    return `${hours}:00`;
  }
  
  const parsedHours = Number.parseInt(digits.slice(0, 2), 10) || 0;
  const parsedMinutes = Number.parseInt(digits.slice(2, 4), 10) || 0;
  
  const hours = String(Math.min(23, Math.max(0, parsedHours))).padStart(2, '0');
  const minutes = String(Math.min(59, Math.max(0, parsedMinutes))).padStart(2, '0');
  
  return `${hours}:${minutes}`;
};

const getAdjustedTimeValue = (value, field, direction) => {
  const [hours, minutes] = value.split(':').map(Number);
  const next = new Date(2000, 0, 1, hours, minutes);
  next.setMinutes(next.getMinutes() + (field === 'minute' ? direction * 1 : 0));
  next.setHours(next.getHours() + (field === 'hour' ? direction * 1 : 0));
  return toNYTimeInputValue(next);
};

export default function App() {
  // --- STATE MANAGEMENT ---
  const [cash, setCash] = useState(100000.00); 
  const [cashInput, setCashInput] = useState("100000.00"); 
  const [watchlist, setWatchlist] = useState(TOP_15_COMPANIES); 
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

  // Initialized states to look at standard active market hours (10:00 AM NY Time)
  const [selectedDate, setSelectedDate] = useState(() => getInitialOpenDateValue());
  const [selectedTime, setSelectedTime] = useState(() => "10:00");
  const [calendarSelectionDate, setCalendarSelectionDate] = useState(() => getInitialOpenDateValue());
  const [calendarSelectionTime, setCalendarSelectionTime] = useState(() => "10:00");
  const [timeInputDraft, setTimeInputDraft] = useState(() => "10:00");
  
  const [timeInputError, setTimeInputError] = useState('');
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState({ closed: false, message: '' });
  const [lastExtractedAt, setLastExtractedAt] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [marketRegion, setMarketRegion] = useState('US');
  const [activeMenuItem, setActiveMenuItem] = useState('Overview');
  const dashboardMenuItems = ['Overview', 'Watchlist', 'Portfolio', 'Analytics', 'Settings'];
  const playbackClockRef = useRef(new Date());

  const handleMenuSelect = (item) => {
    setActiveMenuItem(item);
    const anchor = item === 'Overview' ? 'overview' : item.toLowerCase();
    const target = document.getElementById(anchor);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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

  // Adjusted logic elements to map index layouts safely to standard system views (Pulled ahead by 1 day)
  const getCalendarDays = (viewDate) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const firstDay = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDayOfWeek = firstDay.getUTCDay();
    
    const leadingDays = firstDayOfWeek === 0 ? 0 : firstDayOfWeek;
    const cells = [];
    
    for (let index = 0; index < leadingDays; index += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(Date.UTC(year, month, day)));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  useEffect(() => {
    setMounted(true);
    const savedCash = localStorage.getItem('apex_cash');
    const savedPortfolio = localStorage.getItem('apex_portfolio');
    const savedWatchlist = localStorage.getItem('apex_watchlist');
    if (savedCash) {
      setCash(parseFloat(savedCash));
      setCashInput(savedCash);
    }
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

  const runSimulationTick = useRef(null);
  runSimulationTick.current = () => {
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
  };

  const runSimulationTickMemoized = useCallback(() => {
    runSimulationTick.current();
  }, [selectedDate, selectedTime]);

  const fetchMarketData = useCallback(async (forcedSymbols = null, bypassCache = false, dateOverride = null, timeOverride = null) => {
    const selectedDateValue = dateOverride || selectedDate;
    const selectedTimeValue = timeOverride || selectedTime;

    if (isMarketClosedForDate(selectedDateValue, selectedTimeValue)) {
      setMarketStatus({ closed: true, message: 'Market is currently closed.' });
      setApiMode('Closed Terminal');
      return;
    }

    const symbolsToFetch = forcedSymbols || Array.from(new Set([...watchlist, ...portfolio.map(p => p.ticker)]));

    if (isManualSim) {
      setApiMode('Simulation');
      runSimulationTickMemoized();
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
        runSimulationTickMemoized();
      }
      setLastExtractedAt(new Date());
    } catch (err) {
      setApiMode('Simulation');
      setApiError('Ingestion limit / Pipeline issue. Local simulation backup engaged.');
      runSimulationTickMemoized();
      setLastExtractedAt(new Date());
    }
  }, [watchlist, portfolio, runSimulationTickMemoized, isManualSim, selectedDate, selectedTime]);

  useEffect(() => {
    if (!mounted) return;
    
    if (isMarketClosedForDate(selectedDate, selectedTime)) {
      setMarketStatus({ closed: true, message: 'Market is currently closed.' });
      setApiMode('Closed Terminal');
    } else {
      setMarketStatus({ closed: false, message: '' });
      fetchMarketData();
    }

    const activeInterval = setInterval(() => {
      if (isMarketClosedForDate(selectedDate, selectedTime)) {
        setMarketStatus({ closed: true, message: 'Market is currently closed.' });
        setApiMode('Closed Terminal');
        return; 
      }

      if (apiMode === 'TwelveData' && !isManualSim && rateLimitTimer === 0) {
        fetchMarketData(null, true);
      } else {
        runSimulationTickMemoized();
      }
    }, 15000);

    return () => clearInterval(activeInterval);
  }, [mounted, fetchMarketData, apiMode, runSimulationTickMemoized, isManualSim, rateLimitTimer, selectedDate, selectedTime]);

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
    const nextDate = calendarSelectionDate;
    const nextTime = calendarSelectionTime;
    setSelectedDate(nextDate);
    setSelectedTime(nextTime);
    playbackClockRef.current = new Date(`${nextDate}T${nextTime}`);
    
    if (!isMarketClosedForDate(nextDate, nextTime)) {
      setMarketStatus({ closed: false, message: '' });
    }
    fetchMarketData(null, true, nextDate, nextTime);
  };

  const updateTimeField = (field, direction) => {
    const nextTime = getAdjustedTimeValue(calendarSelectionTime, field, direction);
    setCalendarSelectionTime(nextTime);
    setTimeInputDraft(nextTime);
  };

  const handleCashUpdate = (val) => {
    setCashInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setCash(parsed);
    }
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
    const currentStock = marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker];
    if (!currentStock) return;
    const totalCost = currentStock.price * tradeShares;

    if (cash < totalCost) {
      triggerNotification('Insufficient simulated global funds!', 'error');
      return;
    }

    const nextCash = cash - totalCost;
    setCash(nextCash);
    setCashInput(nextCash.toFixed(2));
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
    const currentStock = marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker];
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
        diagnostics: [`⚠️ **Global Macro Rotation Trap:** Realized rotation across the ${currentStock.exchange || detectExchangeRegion(selectedTicker)} theater impacted this position exit.`]
      });
    }

    const nextCash = cash + totalCredit;
    setCash(nextCash);
    setCashInput(nextCash.toFixed(2));
    setPortfolio(prevPortfolio => {
      return prevPortfolio.map(p => p.ticker === selectedTicker ? { ...p, shares: p.shares - tradeShares } : p).filter(p => p.shares > 0);
    });
    triggerNotification(`Liquidated ${tradeShares} shares of ${selectedTicker}!`, 'success');
  };

  const totalPortfolioValue = portfolio.reduce((acc, curr) => {
    if (marketStatus.closed) return 0; 
    const currentPrice = marketStocks[curr.ticker]?.price || BASELINE_STOCKS[curr.ticker]?.price || curr.avgBuyPrice;
    return acc + (curr.shares * currentPrice);
  }, 0);

  const netWorth = cash + totalPortfolioValue;
  const calendarDays = getCalendarDays(calendarViewDate);

  const filteredWatchlist = watchlist.filter(ticker => {
    if (selectedExchangeFilter === 'ALL') return true;
    const stock = marketStocks[ticker] || BASELINE_STOCKS[ticker];
    const region = stock?.exchange || detectExchangeRegion(ticker);
    return region === selectedExchangeFilter;
  });

  if (!mounted) return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">Loading Global Ingestion Matrix...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <section id="overview">
          <div className="flex flex-col gap-4">
            <div className="sticky top-0 z-50 rounded-2xl border border-slate-800/70 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-cyan-400">Dashboard Navigation</p>
                  <h1 className="text-2xl font-semibold text-slate-100">ApexTrader Global Dashboard</h1>
                  <p className="text-sm text-slate-400">Quick access to watchlists, portfolio, analytics and actionable controls.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dashboardMenuItems.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleMenuSelect(item)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeMenuItem === item
                          ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                          : 'bg-slate-950/80 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky top-[92px] z-40 rounded-2xl border border-cyan-500/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
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

                <div className="relative flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/80 p-3 sm:min-w-[310px]">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setIsCalendarOpen(!isCalendarOpen)} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">Execution Date</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">{formatSelectedDate(calendarSelectionDate)}</p>
                    </button>
                    <button type="button" onClick={() => { confirmSelectedDate(); setIsCalendarOpen(false); }} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-400 hover:bg-cyan-500/20">Enter</button>
                  </div>

                  {isCalendarOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
                      {/* Month & Year Navigation Control Bar */}
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <button 
                          type="button"
                          onClick={() => {
                            const target = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
                            setCalendarViewDate(target);
                          }}
                          className="text-slate-400 hover:text-white p-1 font-mono transition text-sm select-none"
                        >
                          &lt;
                        </button>
                        <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase select-none">
                          {calendarViewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button 
                          type="button"
                          onClick={() => {
                            const target = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
                            setCalendarViewDate(target);
                          }}
                          className="text-slate-400 hover:text-white p-1 font-mono transition text-sm select-none"
                        >
                          &gt;
                        </button>
                      </div>

                      {/* Day Names Grid Header Array */}
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wider text-slate-500 uppercase select-none">
                        <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
                      </div>

                      {/* Dynamic Days Grid Blocks */}
                      <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono">
                        {calendarDays.map((day, i) => {
                          if (!day) {
                            return <div key={`empty-${i}`} className="p-1.5 opacity-0 select-none">--</div>;
                          }
                          
                          const dateString = day.toISOString().split('T')[0];
                          const isSelected = dateString === calendarSelectionDate;
                          const isToday = new Date().toISOString().split('T')[0] === dateString;

                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleCalendarDateSelect(dateString)}
                              className={`p-1.5 rounded-md font-medium transition duration-150 text-center ${
                                isSelected
                                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                                  : isToday
                                  ? 'border border-cyan-500/50 bg-cyan-500/5 text-cyan-400 hover:bg-slate-800'
                                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                              }`}
                            >
                              {day.getUTCDate()}
                            </button>
                          );
                        })}
                      </div>

                      {/* Compact Time Increment Section */}
                      <div className="border-t border-slate-800 pt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-slate-950/60 border border-slate-800/40 p-2 text-center">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Hour</span>
                          <div className="flex justify-between items-center mt-1 px-1">
                            <button type="button" onClick={() => updateTimeField('hour', -1)} className="text-slate-400 hover:text-white font-bold px-1.5">-</button>
                            <span className="font-mono text-xs text-slate-200 font-bold">{timeInputDraft.split(':')[0] || '00'}</span>
                            <button type="button" onClick={() => updateTimeField('hour', 1)} className="text-slate-400 hover:text-white font-bold px-1.5">+</button>
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-950/60 border border-slate-800/40 p-2 text-center">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Minute</span>
                          <div className="flex justify-between items-center mt-1 px-1">
                            <button type="button" onClick={() => updateTimeField('minute', -1)} className="text-slate-400 hover:text-white font-bold px-1.5">-</button>
                            <span className="font-mono text-xs text-slate-200 font-bold">{timeInputDraft.split(':')[1] || '00'}</span>
                            <button type="button" onClick={() => updateTimeField('minute', 1)} className="text-slate-400 hover:text-white font-bold px-1.5">+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <header className="border-b border-slate-800 pb-4 mt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
        </section>

        <section id="watchlist">
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
        </section>

        {/* METRICS METADATA ROW WITH CASH ENTRY FUNCTIONALITY */}
        <section id="portfolio">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <label htmlFor="cash-editor-input" className="text-xs text-slate-400 font-medium block">
                Capital Holdings Balance ($)
              </label>
              <input
                id="cash-editor-input"
                type="number"
                step="0.01"
                min="0"
                value={cashInput}
                onChange={(e) => handleCashUpdate(e.target.value)}
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 mt-1 text-base font-mono font-semibold text-slate-200 focus:outline-none w-full"
              />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
              <p className="text-xs text-slate-400 font-medium">Securities Value Under Management</p>
              <p className="text-xl font-mono font-semibold mt-2.5 text-cyan-400">${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
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
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Asset Watchlist & Ingestion Panel</h2>
                
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredWatchlist.map((ticker) => {
                  const stock = marketStocks[ticker] || BASELINE_STOCKS[ticker];
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

            {/* DYNAMIC INTRADAY PRICE VISUALIZATION HUB */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-cyan-400">Intraday Telemetry Stream</p>
                <h3 className="text-base font-semibold text-slate-200 mt-0.5">
                  {selectedTicker} Analytical Performance Matrix
                </h3>
                <p className="text-xs text-slate-400">
                  Monitoring real-time trading parameters for <span className="text-slate-300 font-medium">{(marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker])?.name}</span> inside the {selectedDate} timeframe.
                </p>
              </div>

              <GenerateWidget height="450px">
                ```json
                {
                  "widgetSpec": {
                    "height": "450px",
                    "prompt": "**Objective:** Render an elegant interactive stock line chart detailing price trends over a single day. \n **Data State:** Use current ticker symbol: \"AAPL\", asset name: \"Apple Inc.\", baseline price: 175.00, net change percent: 0.5. Allow inputs to pass distinct ticker values dynamically. \n **Strategy:** Standard Layout. \n **Inputs:** Volatility Index Factor (slider from 1 to 5, default 2), Timeframe Resolution (segmented picker: 5m, 15m, 1h, default 15m). \n **Visuals/Behavior:** Generate a seamless continuous path mimicking real-time 9:30 AM to 4:00 PM market intervals. Use a gradient filled area under the price line. Line color must change dynamically (emerald if change percentage is positive, rose color if negative). Display a floating crosshair element that follows the pointer coordinate values to trace price and timestamp positions dynamically along the chart grid."
                  }
                }
                ```
              </GenerateWidget>

              {/* CONDITIONAL PRICE FOOTER TICKER STRIP */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
                  <span className="text-slate-500 block text-[10px] uppercase">Opening Print</span>
                  <span className="text-slate-200 font-semibold">${((marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker])?.price * 0.995).toFixed(2)}</span>
                </div>
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
                  <span className="text-slate-500 block text-[10px] uppercase">Intraday Apex</span>
                  <span className="text-emerald-400 font-semibold">${((marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker])?.price * 1.012).toFixed(2)}</span>
                </div>
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
                  <span className="text-slate-500 block text-[10px] uppercase">Intraday Trough</span>
                  <span className="text-rose-400 font-semibold">${((marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker])?.price * 0.984).toFixed(2)}</span>
                </div>
                <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
                  <span className="text-slate-500 block text-[10px] uppercase">Relative Strength (RSI)</span>
                  <span className="text-cyan-400 font-semibold">{(marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker])?.rsi || 50}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Simulated Execution Terminal</h2>
              {(marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker]) && !marketStatus.closed ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Target Trading Instrument</span>
                    <span className="text-lg font-bold font-mono text-cyan-400">{selectedTicker}</span>
                    <span className="text-sm text-slate-300 ml-2 font-mono">
                      @ ${(marketStocks[selectedTicker] || BASELINE_STOCKS[selectedTicker]).price.toFixed(2)}
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

            <section id="analytics" className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
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
                        const currentPrice = marketStocks[pos.ticker]?.price || BASELINE_STOCKS[pos.ticker]?.price;
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
            </section>
          </div>

          <section id="settings" className="space-y-4">
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
          </section>
        </div>

      </div>
    </div>
  );
}
