import type { TradeData } from "~/services/tracker";

export interface OHLCData {
  x: number; // timestamp ms
  o: number;
  h: number;
  c: number;
  l: number;
  v: number; // volume
}

/**
 * Aggregate trade data into OHLC candles grouped by timeframe.
 * @param trades - Array of trades with timestamps
 * @param timeframeMs - Candle duration in milliseconds
 * @returns Array of OHLCData sorted by time ascending
 */
export function aggregateOHLC(
  trades: TradeData[],
  timeframeMs: number,
): OHLCData[] {
  if (!trades.length) return [];

  // Sort trades by timestamp ascending
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  // Group trades into time buckets
  const buckets = new Map<number, TradeData[]>();

  for (const trade of sorted) {
    // Floor timestamp to the bucket start
    const bucketTs = Math.floor(trade.timestamp / timeframeMs) * timeframeMs;
    const bucket = buckets.get(bucketTs);
    if (bucket) {
      bucket.push(trade);
    } else {
      buckets.set(bucketTs, [trade]);
    }
  }

  // Build OHLC from buckets
  const candles: OHLCData[] = [];

  for (const [bucketTs, bucketTrades] of buckets) {
    if (bucketTrades.length === 0) continue;

    const prices = bucketTrades.map((t) => t.price);
    const o = prices[0];
    const c = prices[prices.length - 1];
    const h = Math.max(...prices);
    const l = Math.min(...prices);
    const v = bucketTrades.reduce((sum, t) => sum + t.total, 0);

    candles.push({
      x: bucketTs,
      o,
      h,
      c,
      l,
      v,
    });
  }

  // Sort by timestamp ascending
  candles.sort((a, b) => a.x - b.x);

  return candles;
}

/**
 * Generate simulated OHLC data for demo/testing when no real trades exist.
 * Creates realistic-looking price movement with random walk.
 */
export function generateSimulatedOHLC(
  count: number,
  startPrice: number,
  startTime: number,
  timeframeMs: number,
): OHLCData[] {
  const candles: OHLCData[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const volatility = price * 0.05; // 5% volatility
    const open = price;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.random() * 50000 + 5000;

    candles.push({
      x: startTime + i * timeframeMs,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume,
    });

    price = close;
  }

  return candles;
}
