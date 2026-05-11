const year = document.querySelector("#year");
const form = document.querySelector("#quote-form");
const input = document.querySelector("#stock-code");
const result = document.querySelector("#quote-result");

let latestChartPoints = [];

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

const parseRocDate = (value) => {
  const parts = String(value).split("/");
  if (parts.length !== 3) return "";
  const yearNumber = Number(parts[0]) + 1911;
  return `${yearNumber}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
};

const formatDisplayDate = (isoDate) => {
  if (!isoDate) return "--";
  const [y, m, d] = isoDate.split("-");
  return `${y}/${m}/${d}`;
};

const setResult = (html) => {
  result.innerHTML = html;
};

const setLoading = (code) => {
  latestChartPoints = [];
  setResult(`<div class="loading-state">正在查詢 ${code} 近三個月股價...</div>`);
};

const setError = (message) => {
  latestChartPoints = [];
  setResult(`<div class="error-state">${message}</div>`);
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

  if (!response.ok) {
    throw new Error("證交所資料沒有回應");
  }

  const data = await response.json();

  if (data.stat !== "OK" || !Array.isArray(data.data)) {
    return [];
  }

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
  const points = monthResults
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) {
    throw new Error("查無近三個月資料");
  }

  return points;
};

const getStockName = async (code) => {
  const endpoint = "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data";
  const response = await fetch(endpoint, { cache: "no-store" });

  if (!response.ok) return code;

  const csv = await response.text();
  const row = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",").map((field) => field.replace(/"/g, "").trim()))
    .find((fields) => fields[1] === code);

  return row && row[2] ? row[2] : code;
};

const summarizeHistory = (code, name, points) => {
  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : latest;
  const change = latest.close - previous.close;
  const changePercent = previous.close ? (change / previous.close) * 100 : 0;
  const highPoint = points.reduce((best, point) => (point.high > best.high ? point : best), points[0]);
  const lowPoint = points.reduce((best, point) => (point.low < best.low ? point : best), points[0]);

  return {
    code,
    name,
    exchange: "上市",
    price: latest.close,
    previousClose: previous.close,
    change,
    changePercent,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
    time: `${formatDisplayDate(latest.date)} 收盤`,
    rangeHigh: highPoint.high,
    rangeHighDate: highPoint.date,
    rangeLow: lowPoint.low,
    rangeLowDate: lowPoint.date,
    source: "證交所官方歷史股價",
  };
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

const renderHistory = (summary, points) => {
  const changeClass = summary.change > 0 ? "up" : summary.change < 0 ? "down" : "flat";
  const sign = summary.change > 0 ? "+" : "";
  const first = points[0];
  const last = points[points.length - 1];

  latestChartPoints = points;

  setResult(`
    <article class="result-card">
      <div class="result-top">
        <div>
          <p class="stock-name">${summary.name}</p>
          <p class="stock-code">${summary.code} · ${summary.exchange} · TWD</p>
        </div>
        <div>
          <p class="price">${formatPrice(summary.price)}</p>
          <span class="change ${changeClass}">
            ${sign}${formatPrice(summary.change)} (${sign}${summary.changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h3>近三個月收盤價走勢</h3>
            <p>${formatDisplayDate(first.date)} - ${formatDisplayDate(last.date)}</p>
          </div>
          <span>${points.length} 個交易日</span>
        </div>
        <canvas id="price-chart" class="price-chart" aria-label="近三個月收盤價走勢圖"></canvas>
      </div>

      <dl class="quote-grid">
        <div>
          <dt>最新收盤</dt>
          <dd>${formatPrice(summary.price)}</dd>
        </div>
        <div>
          <dt>開盤</dt>
          <dd>${formatPrice(summary.open)}</dd>
        </div>
        <div>
          <dt>最高</dt>
          <dd>${formatPrice(summary.high)}</dd>
        </div>
        <div>
          <dt>最低</dt>
          <dd>${formatPrice(summary.low)}</dd>
        </div>
        <div>
          <dt>成交量</dt>
          <dd>${formatVolume(summary.volume)}</dd>
        </div>
        <div>
          <dt>更新時間</dt>
          <dd>${summary.time}</dd>
        </div>
        <div>
          <dt>三個月高點</dt>
          <dd>${formatPrice(summary.rangeHigh)} · ${formatDisplayDate(summary.rangeHighDate).slice(5)}</dd>
        </div>
        <div>
          <dt>三個月低點</dt>
          <dd>${formatPrice(summary.rangeLow)} · ${formatDisplayDate(summary.rangeLowDate).slice(5)}</dd>
        </div>
      </dl>

      <p class="data-note">資料來源：${summary.source}。股價僅供參考，不構成投資建議。</p>
    </article>
  `);

  drawChart(document.querySelector("#price-chart"), points);
};

const lookupHistory = async (code) => {
  const points = await getThreeMonthHistory(code);
  const name = await getStockName(code);
  const summary = summarizeHistory(code, name, points);
  renderHistory(summary, points);
};

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const code = input.value.trim().replace(/\D/g, "");
    input.value = code;

    if (!/^\d{4,6}$/.test(code)) {
      setError("請輸入正確的台股代號，例如 2330、0050、2317。");
      return;
    }

    setLoading(code);

    try {
      await lookupHistory(code);
    } catch (error) {
      setError("目前查不到這個代號的三個月股價圖。請先確認是否為上市股票代號，或稍後再試。");
    }
  });
}

window.addEventListener("resize", () => {
  if (latestChartPoints.length) {
    drawChart(document.querySelector("#price-chart"), latestChartPoints);
  }
});
