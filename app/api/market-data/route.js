import { NextResponse } from 'next/server';

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

const FALLBACK_PRICES = {
  AAPL: { name: 'Apple Inc.', price: 175.0, change: 0.5, rsi: 72, volume: 'High' },
  TSLA: { name: 'Tesla Inc.', price: 220.0, change: -1.2, rsi: 38, volume: 'Extreme' },
  NVDA: { name: 'NVIDIA Corp.', price: 850.0, change: 2.4, rsi: 81, volume: 'Normal' },
  AMZN: { name: 'Amazon.com Inc.', price: 178.0, change: -0.3, rsi: 48, volume: 'Low' },
};

const formatDateKey = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
};

const isMarketClosedForDate = (value) => {
  const normalized = formatDateKey(value);
  if (!normalized) return { closed: true, message: 'Market Closed.' };

  const date = new Date(`${normalized}T12:00:00Z`);
  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return { closed: true, message: 'Market Closed.' };
  }

  if (MARKET_HOLIDAYS.has(normalized)) {
    return { closed: true, message: 'Market Closed.' };
  }

  return { closed: false, message: '' };
};

const parseHistoricalPayload = (data, symbols) => {
  const parsed = {};
  if (!data || data.status === 'error' || data.code >= 400) {
    return parsed;
  }

  if (data.values && Array.isArray(data.values)) {
    const latest = data.values[0];
    if (latest) {
      const price = parseFloat(latest.close || latest.price || 0);
      const previousClose = parseFloat(latest.previous_close || latest.open || 0);
      const change = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;
      parsed[symbols[0]] = {
        name: data.name || symbols[0],
        price,
        change: Number.isFinite(change) ? Number(change.toFixed(2)) : 0,
        volume: parseFloat(latest.volume || 0) > 50000000 ? 'High' : 'Normal',
        rsi: 50,
      };
    }
  }

  if (data.symbol) {
    const price = parseFloat(data.close || data.price || 0);
    const change = parseFloat(data.percent_change || 0);
    parsed[data.symbol] = {
      name: data.name || data.symbol,
      price,
      change: Number.isFinite(change) ? Number(change.toFixed(2)) : 0,
      volume: parseFloat(data.volume || 0) > 50000000 ? 'High' : 'Normal',
      rsi: 50,
    };
  }

  return parsed;
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const symbolsParam = searchParams.get('symbols') || 'AAPL,TSLA,NVDA,AMZN';
  const symbols = symbolsParam.split(',').map((symbol) => symbol.trim()).filter(Boolean);

  const marketStatus = isMarketClosedForDate(date);
  if (marketStatus.closed) {
    const closedStocks = {};
    symbols.forEach((symbol) => {
      closedStocks[symbol] = {
        name: symbol,
        price: null,
        change: 0,
        rsi: 50,
        volume: 'Normal',
        marketClosed: true,
      };
    });

    return NextResponse.json({
      marketClosed: true,
      message: marketStatus.message,
      stocks: closedStocks,
    });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY || process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY;

  if (!apiKey) {
    const fallbackStocks = {};
    symbols.forEach((symbol) => {
      const fallback = FALLBACK_PRICES[symbol] || { name: symbol, price: 100, change: 0, rsi: 50, volume: 'Normal' };
      fallbackStocks[symbol] = {
        ...fallback,
        price: parseFloat(fallback.price),
        change: parseFloat(fallback.change),
      };
    });

    return NextResponse.json({ marketClosed: false, stocks: fallbackStocks });
  }

  try {
    const responses = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&start_date=${date}&end_date=${date}&apikey=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        return { symbol, data };
      })
    );

    const stocks = {};
    responses.forEach(({ symbol, data }) => {
      const parsed = parseHistoricalPayload(data, [symbol]);
      if (parsed[symbol]) {
        stocks[symbol] = parsed[symbol];
      } else {
        const fallback = FALLBACK_PRICES[symbol] || { name: symbol, price: 100, change: 0, rsi: 50, volume: 'Normal' };
        stocks[symbol] = { ...fallback, price: parseFloat(fallback.price), change: parseFloat(fallback.change) };
      }
    });

    return NextResponse.json({ marketClosed: false, stocks });
  } catch (error) {
    console.error('Market data route error:', error);
    const fallbackStocks = {};
    symbols.forEach((symbol) => {
      const fallback = FALLBACK_PRICES[symbol] || { name: symbol, price: 100, change: 0, rsi: 50, volume: 'Normal' };
      fallbackStocks[symbol] = { ...fallback, price: parseFloat(fallback.price), change: parseFloat(fallback.change) };
    });

    return NextResponse.json({ marketClosed: false, stocks: fallbackStocks });
  }
}
