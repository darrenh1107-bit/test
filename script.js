const year = document.querySelector("#year");
const form = document.querySelector("#quote-form");
const input = document.querySelector("#stock-code");
const result = document.querySelector("#quote-result");

if (year) {
  year.textContent = new Date().getFullYear();
}

const formatPrice = (value) => {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatVolume = (value) => {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-TW").format(value);
};

const formatTime = (timestamp) => {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
};

const setResult = (html) => {
  result.innerHTML = html;
};

const setLoading = (code) => {
  setResult(`<div class="loading-state">正在查詢 ${code} 今日股價...</div>`);
};

const setError = (message) => {
  setResult(`<div class="error-state">${message}</div>`);
};

const getQuoteFromTaiwanProxy = async (code) => {
  const endpoint = `https://stock-quote-proxy.sukailin1124.workers.dev/quote?symbol=${code}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("資料來源沒有回應");
  }

  const data = await response.json();

  if (!data.ok || !Number.isFinite(data.price)) {
    throw new Error("查無報價");
  }

  return {
    code: data.symbol || code,
    symbol: data.symbol || code,
    exchange: data.market === "otc" ? "上櫃" : "上市",
    name: data.symbol || code,
    price: data.price,
    previousClose: Number(data.meta?.prevClose),
    open: Number(data.meta?.open),
    high: Number(data.meta?.high),
    low: Number(data.meta?.low),
    volume: Number(data.meta?.volume),
    time: data.meta?.time,
    currency: "TWD",
    source: data.source ? `Taiwan Stock API / ${data.source}` : "Taiwan Stock API",
  };
};

const getQuoteFromYahoo = async (code, suffix) => {
  const symbol = `${code}.${suffix}`;
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("資料來源沒有回應");
  }

  const data = await response.json();
  const quote = data.chart?.result?.[0];
  const meta = quote?.meta;

  if (!meta || !Number.isFinite(meta.regularMarketPrice)) {
    throw new Error("查無報價");
  }

  return {
    code,
    symbol: meta.symbol,
    exchange: suffix === "TW" ? "上市" : "上櫃",
    name: meta.shortName || meta.longName || meta.symbol,
    price: meta.regularMarketPrice,
    previousClose: meta.previousClose,
    open: meta.regularMarketOpen,
    high: meta.regularMarketDayHigh,
    low: meta.regularMarketDayLow,
    volume: meta.regularMarketVolume,
    time: meta.regularMarketTime,
    currency: meta.currency || "TWD",
    source: "Yahoo Finance",
  };
};

const getQuote = async (code) => {
  try {
    return await getQuoteFromTaiwanProxy(code);
  } catch (error) {
    // Fall back to Yahoo symbols if the Taiwan proxy is temporarily unavailable.
  }

  const markets = ["TW", "TWO"];
  let lastError;

  for (const market of markets) {
    try {
      return await getQuoteFromYahoo(code, market);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("查無報價");
};

const renderQuote = (quote) => {
  const previousClose = Number.isFinite(quote.previousClose) ? quote.previousClose : quote.price;
  const change = quote.price - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;
  const changeClass = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const sign = change > 0 ? "+" : "";

  setResult(`
    <article class="result-card">
      <div class="result-top">
        <div>
          <p class="stock-name">${quote.name}</p>
          <p class="stock-code">${quote.code} · ${quote.exchange} · ${quote.currency}</p>
        </div>
        <div>
          <p class="price">${formatPrice(quote.price)}</p>
          <span class="change ${changeClass}">
            ${sign}${formatPrice(change)} (${sign}${changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      <dl class="quote-grid">
        <div>
          <dt>開盤</dt>
          <dd>${formatPrice(quote.open)}</dd>
        </div>
        <div>
          <dt>最高</dt>
          <dd>${formatPrice(quote.high)}</dd>
        </div>
        <div>
          <dt>最低</dt>
          <dd>${formatPrice(quote.low)}</dd>
        </div>
        <div>
          <dt>昨收</dt>
          <dd>${formatPrice(quote.previousClose)}</dd>
        </div>
        <div>
          <dt>成交量</dt>
          <dd>${formatVolume(quote.volume)}</dd>
        </div>
        <div>
          <dt>更新時間</dt>
          <dd>${formatTime(quote.time)}</dd>
        </div>
        <div>
          <dt>資料代號</dt>
          <dd>${quote.symbol}</dd>
        </div>
        <div>
          <dt>資料來源</dt>
          <dd>${quote.source}</dd>
        </div>
      </dl>

      <p class="data-note">股價可能延遲，僅供參考，不構成投資建議。</p>
    </article>
  `);
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = input.value.trim().replace(/\D/g, "");
  input.value = code;

  if (!/^\d{4,6}$/.test(code)) {
    setError("請輸入正確的台股代號，例如 2330、0050、6488。");
    return;
  }

  setLoading(code);

  try {
    const quote = await getQuote(code);
    renderQuote(quote);
  } catch (error) {
    setError("目前查不到這個代號的報價。請確認股票代號是否正確，或稍後再試。");
  }
});
