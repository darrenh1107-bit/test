const year = document.querySelector("#year");
const form = document.querySelector("#quote-form");
const input = document.querySelector("#stock-query");
const result = document.querySelector("#quote-result");

const dailyEndpoint = "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data";
let latestChartPoints = [];
let listedStocksCache = null;

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

const parseNumber = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  const number = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : NaN;
};

const normalizeSearchText = (value) => {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/\s+/g, "")
    .replace(/[()（）.,，。_\-－]/g, "")
    .trim();
};

const parseCsvLine = (line) => {
  const fields = [];
  let current = "";
  let inQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuote = !inQuote;
    } else if (char === "," && !inQuote) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
};

const parseRocDate = (value) => {
  const parts = String(value).split("/");
  if (parts.length !== 3) return "";
  const yearNumber = Number(parts[0]) + 1911;
  return `${yearNumber}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
};

const formatRocCompactDate = (value) => {
  if (!/^\d{7}$/.test(value)) return value || "--";
  const fullYear = Number(value.slice(0, 3)) + 1911;
  return `${fullYear}/${value.slice(3, 5)}/${value.slice(5, 7)}`;
};

const formatDisplayDate = (isoDate) => {
  if (!isoDate) return "--";
  const parts = isoDate.split("-");
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
};

const setResult = (html) => {
  result.innerHTML = html;
};

const setLoading = (text) => {
  latestChartPoints = [];
  setResult(`<div class="loading-state">${text}</div>`);
};

const setError = (message) => {
  latestChartPoints = [];
  setResult(`<div class="error-state">${message}</div>`);
};

const getListedStocks = async () => {
  if (listedStocksCache) return listedStocksCache;

  const response = await fetch(dailyEndpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("證交所資料沒有回應");

  const csv = await response.text();
  listedStocksCache = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map(parseCsvLine)
    .filter((fields) => fields.length >= 11)
    .map((fields) => {
      const close = parseNumber(fields[8]);
      const change = parseNumber(fields[9]);
      return {
        date: fields[0],
        code: fields[1],
        name: fields[2],
        volume: parseNumber(fields[3]),
        open: parseNumber(fields[5]),
        high: parseNumber(fields[6]),
        low: parseNumber(fields[7]),
        close,
        change,
        previousClose: Number.isFinite(change) ? close - change : NaN,
        trades: parseNumber(fields[10]),
      };
    });

  return listedStocksCache;
};

const resolveStock = async (query) => {
  const normalized = normalizeSearchText(query);
  if (!normalized) throw new Error("請輸入公司名稱或股票代號");

  const stocks = await getListedStocks();
  const codeMatch = normalized.match(/\d{4,6}/);
  const codeInQuery = codeMatch ? codeMatch[0] : "";
  const byCode = stocks.find((stock) => stock.code === normalized || stock.code === codeInQuery);
  if (byCode) return byCode;

  const exactName = stocks.find((stock) => normalizeSearchText(stock.name) === normalized);
  if (exactName) return exactName;

  const partialName = stocks.find((stock) => normalizeSearchText(stock.name).includes(normalized));
  if (partialName) return partialName;

  throw new Error("查無符合的上市股票");
};

const getMonthStarts = (count) => {
  const now = new Date();
  const months = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const yearText = String(date.getFullYear());
    const monthText = String(date.getMonth() + 1).padStart(2, "0");
    months.push(`${yearText}${monthText}01`);
  }

  return months;
};

const fetchTwseMonth = async (code, dateText) => {
  const endpoint = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${dateText}&stockNo=${code}&response=json`;
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) throw new Error("證交所歷史資料沒有回應");

  const data = await response.json();
  if (data.stat !== "OK" || !Array.isArray(data.data)) return [];

  return data.data
    .map((row) => ({
      date: parseRocDate(row[0]),
      volume: parseNumber(row[1]),
      open: parseNumber(row[3]),
      high: parseNumber(row[4]),
      low: parseNumber(row[5]),
      close: parseNumber(row[6]),
      change: parseNumber(row[7]),
    }))
    .filter((point) => point.date && Number.isFinite(point.close));
};

const getThreeMonthHistory = async (code) => {
  const monthStarts = getMonthStarts(3);
  const monthResults = await Promise.all(monthStarts.map((month) => fetchTwseMonth(code, month)));
  const points = monthResults.flat().sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) throw new Error("查無近三個月資料");
  return points;
};

const drawChart = (canvas, points) => {
  if (!canvas || points.length < 2) return;

  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));
  const padding = { top: 22, right: 18, bottom: 42, left: 58 };
  const ctx = canvas.getContext("2d");

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const spread = max - min || 1;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const xFor = (index) => padding.left + (index / (points.length - 1)) * chartWidth;
  const yFor = (price) => padding.top + ((max - price) / spread) * chartHeight;

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d8d0c2";
  ctx.fillStyle = "#5d6964";
  ctx.font = "12px Noto Sans TC, sans-serif";

  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + (chartHeight / 4) * step;
    const price = max - (spread / 4) * step;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(formatPrice(price), 8, y + 4);
  }

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(11, 118, 103, 0.24)");
  gradient.addColorStop(1, "rgba(11, 118, 103, 0)");

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#0b7667";
  ctx.lineWidth = 3;
  ctx.stroke();

  const first = points[0];
  const last = points[points.length - 1];
  ctx.fillStyle = "#5d6964";
  ctx.fillText(formatDisplayDate(first.date).slice(5), padding.left, height - 14);
  ctx.textAlign = "right";
  ctx.fillText(formatDisplayDate(last.date).slice(5), width - padding.right, height - 14);
  ctx.textAlign = "left";

  const lastX = xFor(points.length - 1);
  const lastY = yFor(last.close);
  ctx.fillStyle = "#0b7667";
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
  ctx.fill();
};

const renderDaily = (stock) => {
  const change = Number.isFinite(stock.change) ? stock.change : stock.close - stock.previousClose;
  const changePercent = stock.previousClose ? (change / stock.previousClose) * 100 : 0;
  const changeClass = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const sign = change > 0 ? "+" : "";

  latestChartPoints = [];
  setResult(`
    <article class="result-card">
      <div class="result-top">
        <div>
          <p class="stock-name">${stock.name}</p>
          <p class="stock-code">${stock.code} · 上市 · TWD</p>
        </div>
        <div>
          <p class="price">${formatPrice(stock.close)}</p>
          <span class="change ${changeClass}">
            ${sign}${formatPrice(change)} (${sign}${changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      <dl class="quote-grid">
        <div>
          <dt>收盤價</dt>
          <dd>${formatPrice(stock.close)}</dd>
        </div>
        <div>
          <dt>開盤</dt>
          <dd>${formatPrice(stock.open)}</dd>
        </div>
        <div>
          <dt>最高</dt>
          <dd>${formatPrice(stock.high)}</dd>
        </div>
        <div>
          <dt>最低</dt>
          <dd>${formatPrice(stock.low)}</dd>
        </div>
        <div>
          <dt>成交量</dt>
          <dd>${formatVolume(stock.volume)}</dd>
        </div>
        <div>
          <dt>成交筆數</dt>
          <dd>${formatVolume(stock.trades)}</dd>
        </div>
        <div>
          <dt>更新日期</dt>
          <dd>${formatRocCompactDate(stock.date)}</dd>
        </div>
        <div>
          <dt>資料來源</dt>
          <dd>證交所官方每日行情</dd>
        </div>
      </dl>

      <p class="data-note">股價僅供參考，不構成投資建議。</p>
    </article>
  `);
};

const renderHistory = (stock, points) => {
  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : latest;
  const change = latest.close - previous.close;
  const changePercent = previous.close ? (change / previous.close) * 100 : 0;
  const changeClass = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const sign = change > 0 ? "+" : "";
  const first = points[0];
  const highPoint = points.reduce((best, point) => (point.high > best.high ? point : best), points[0]);
  const lowPoint = points.reduce((best, point) => (point.low < best.low ? point : best), points[0]);

  latestChartPoints = points;
  setResult(`
    <article class="result-card">
      <div class="result-top">
        <div>
          <p class="stock-name">${stock.name}</p>
          <p class="stock-code">${stock.code} · 上市 · TWD</p>
        </div>
        <div>
          <p class="price">${formatPrice(latest.close)}</p>
          <span class="change ${changeClass}">
            ${sign}${formatPrice(change)} (${sign}${changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h3>近三個月收盤價走勢</h3>
            <p>${formatDisplayDate(first.date)} - ${formatDisplayDate(latest.date)}</p>
          </div>
          <span>${points.length} 個交易日</span>
        </div>
        <canvas id="price-chart" class="price-chart" aria-label="近三個月收盤價走勢圖"></canvas>
      </div>

      <dl class="quote-grid">
        <div>
          <dt>最新收盤</dt>
          <dd>${formatPrice(latest.close)}</dd>
        </div>
        <div>
          <dt>最新成交量</dt>
          <dd>${formatVolume(latest.volume)}</dd>
        </div>
        <div>
          <dt>三個月高點</dt>
          <dd>${formatPrice(highPoint.high)} · ${formatDisplayDate(highPoint.date).slice(5)}</dd>
        </div>
        <div>
          <dt>三個月低點</dt>
          <dd>${formatPrice(lowPoint.low)} · ${formatDisplayDate(lowPoint.date).slice(5)}</dd>
        </div>
      </dl>

      <p class="data-note">資料來源：證交所官方歷史股價。股價僅供參考，不構成投資建議。</p>
    </article>
  `);

  drawChart(document.querySelector("#price-chart"), points);
};

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const query = input.value.trim();
    const mode = new FormData(form).get("queryMode");

    if (!query) {
      setError("請輸入中文公司名稱或股票代號，例如 台積電、臺積電、鴻海、2330。");
      return;
    }

    setLoading(`正在查詢 ${query}...`);

    try {
      const stock = await resolveStock(query);
      input.value = stock.name;

      if (mode === "history") {
        setLoading(`正在查詢 ${stock.name} ${stock.code} 近三個月收盤價...`);
        const points = await getThreeMonthHistory(stock.code);
        renderHistory(stock, points);
      } else {
        renderDaily(stock);
      }
    } catch (error) {
      setError("目前查不到這個公司或代號。請確認是否為上市股票，例如 台積電、臺積電、鴻海、2330、0050。");
    }
  });
}

window.addEventListener("resize", () => {
  if (latestChartPoints.length) {
    drawChart(document.querySelector("#price-chart"), latestChartPoints);
  }
});
