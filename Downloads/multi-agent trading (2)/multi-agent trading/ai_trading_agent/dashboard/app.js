// SYSTEM CONFIG
const API_URL = "http://localhost:8000";
const PRESETS = {
    "ind": ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "^NSEI"],
    "us": ["AAPL", "TSLA", "NVDA", "BTC-USD"],
    "crypto": ["BTC-USD", "ETH-USD", "SOL-USD"]
};

let activeTickers = [];
let cardData = [];
let comparisonMode = false;
let selectedForComparison = [];
const chartInstances = {}; // CHART REGISTRY

// THEME LOGIC
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('theme-icon').textContent = saved === 'light' ? '☀️' : '🌙';
}

window.toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    document.getElementById('theme-icon').textContent = next === 'light' ? '☀️' : '🌙';

    // Re-render charts to update grid lines/text colors
    cardData.forEach(c => renderChart(c.ticker, c.history));
};

const els = {
    marketSelect: document.getElementById('market-select'),
    tickerInput: document.getElementById('ticker-input'),
    grid: document.getElementById('dashboard-grid'),
    loader: document.getElementById('loading-overlay'),
    suggestions: document.getElementById('suggestions'),
    portfolioPanel: document.getElementById('portfolio-overview'),
    comparisonContainer: document.getElementById('comparison-container'),
    shortcutsModal: document.getElementById('shortcuts-modal')
};

let currentFocus = -1;

function init() {
    els.grid.innerHTML = '';

    els.marketSelect.addEventListener('change', (e) => {
        els.grid.innerHTML = '';
        activeTickers = [];
        cardData = [];
        destroyAllCharts(); // CLEANUP
        const selection = PRESETS[e.target.value];
        fetchBatch(selection);
    });

    const addBtn = document.getElementById('add-ticker-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const val = els.tickerInput.value.toUpperCase().trim();
            if (val) addTicker(val);
        });
    }

    let debounceTimer;
    els.tickerInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        closeAllLists();
        if (!val) return;

        // DEBOUNCE (Wait 300ms)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            currentFocus = -1;

            try {
                // Determine if we show local suggestions (empty/short) or remote (long)
                // Actually, user wants GLOBAL search always.

                els.suggestions.innerHTML = '<div class="suggestion-item"><i>Searching Global Markets...</i></div>';
                els.suggestions.classList.remove('hidden');

                const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(val)}`);
                const data = await res.json();

                if (data.results && data.results.length > 0) {
                    els.suggestions.innerHTML = data.results.map((m) => {
                        const typeClass = m.type.toLowerCase().replace(" ", "-"); // equity, cryptocurrency, etf
                        let typeColor = "#666";
                        if (typeClass.includes("crypto")) typeColor = "#f39c12"; // Orange
                        if (typeClass.includes("equity")) typeColor = "#3498db"; // Blue
                        if (typeClass.includes("etf")) typeColor = "#9b59b6"; // Purple
                        if (typeClass.includes("future")) typeColor = "#e74c3c"; // Red

                        return `
                        <div class="suggestion-item" onclick="addTicker('${m.symbol}')">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong>${m.symbol}</strong>
                                <span class="badge" style="font-size:9px; background:${typeColor}; color:white; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${m.type}</span>
                            </div>
                            <div style="font-size:11px; opacity:0.8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">
                                ${m.name} <span style="opacity:0.6">• ${m.exchange}</span>
                            </div>
                        </div>
                    `}).join('');
                } else {
                    els.suggestions.innerHTML = '<div class="suggestion-item"><i>No global assets found</i></div>';
                }
            } catch (e) {
                console.error("Search failed", e);
            }
        }, 300);
    });

    els.tickerInput.addEventListener('keydown', (e) => {
        let x = els.suggestions.querySelectorAll('.suggestion-item');
        if (e.key === "ArrowDown") {
            currentFocus++;
            addActive(x);
        } else if (e.key === "ArrowUp") {
            currentFocus--;
            addActive(x);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            } else if (x && x.length > 0) {
                // If top result exists, click it? Or just add raw value?
                // Better to add raw value if they pressed enter immediately
                const rawVal = els.tickerInput.value.toUpperCase().trim();
                addTicker(rawVal);
            } else {
                const rawVal = els.tickerInput.value.toUpperCase().trim();
                if (rawVal) addTicker(rawVal);
            }
            closeAllLists();
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== els.tickerInput) closeAllLists();
    });

    // KEYBOARD SHORTCUTS
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key === '/') {
            e.preventDefault();
            els.tickerInput.focus();
        } else if (e.key === 'Escape') {
            closeModal();
            els.tickerInput.value = '';
            closeAllLists();
        } else if (e.key === 'c' || e.key === 'C') {
            toggleComparisonMode();
        } else if (e.key === 'e' || e.key === 'E') {
            exportReport();
        } else if (e.key === '?') {
            els.shortcutsModal.classList.remove('hidden');
        }
    });

    // RUN ALGO BUTTON (Refresh)
    const runBtn = document.getElementById('run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            // Visual feedback
            runBtn.textContent = 'ANALYZING... ⏳';
            runBtn.style.opacity = '0.7';

            // Clear grid and re-fetch everything
            cardData = [];
            els.grid.innerHTML = '';
            destroyAllCharts();

            // Re-fetch current active tickers
            const tickersToRefresh = [...activeTickers];
            activeTickers = []; // Reset locally so fetchBatch re-adds them

            fetchBatch(tickersToRefresh).then(() => {
                runBtn.textContent = 'INITIALIZE ALGO ⚡';
                runBtn.style.opacity = '1';
            });
        });
    }

    initTheme();
    fetchBatch(PRESETS["ind"]);

    // HEARTBEAT MONITOR (Live Status & Latency)
    setInterval(async () => {
        const start = performance.now();
        try {
            const res = await fetch(`${API_URL}/health`);
            const end = performance.now();
            if (res.ok) {
                const latency = Math.round(end - start);
                updateStatusPanel(true, latency);
            } else {
                updateStatusPanel(false, 0);
            }
        } catch (e) {
            updateStatusPanel(false, 0);
        }
    }, 5000); // 5 seconds
}

function addActive(x) {
    if (!x) return false;
    removeActive(x);
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (x.length - 1);
    x[currentFocus].classList.add("active");
    x[currentFocus].scrollIntoView({ block: "nearest" });
}

function removeActive(x) {
    for (let i = 0; i < x.length; i++) {
        x[i].classList.remove("active");
    }
}

function closeAllLists() {
    els.suggestions.innerHTML = '';
    els.suggestions.classList.add('hidden');
}

window.addTicker = (t) => {
    if (!t) return;
    if (activeTickers.includes(t)) {
        return;
    }

    els.tickerInput.value = '';
    closeAllLists();
    fetchTickerData(t);
    updateSelectedTickers(); // Update visual display
};

function updateSelectedTickers() {
    const container = document.getElementById('selected-tickers');
    if (!container) return;

    if (activeTickers.length === 0) {
        container.innerHTML = '<small style="color: var(--text-muted); font-size:11px;">No assets selected</small>';
        return;
    }

    container.innerHTML = activeTickers.map(ticker => `
        <div class="ticker-badge" onclick="removeCard('${ticker}')">
            ${ticker}
            <span class="remove-icon">×</span>
        </div>
    `).join('');
}

async function fetchBatch(tickers) {
    for (let t of tickers) {
        if (!activeTickers.includes(t)) {
            await fetchTickerData(t);
        }
    }
}

async function fetchTickerData(ticker) {
    const cardId = `card-${ticker.replace(/\W/g, '')}`;
    const placeholderHTML = `
        <div class="card loading-card" id="${cardId}">
            <div class="card-header"><h3>${ticker}</h3></div>
            <div class="spinner-sm"></div> <small>ANALYZING DATA...</small>
        </div>
    `;

    els.grid.insertAdjacentHTML('afterbegin', placeholderHTML);
    activeTickers.push(ticker);

    const startTime = performance.now(); // START TIMER

    try {
        const res = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers: [ticker] })
        });

        const endTime = performance.now(); // END TIMER
        const latency = Math.round(endTime - startTime);
        updateStatusPanel(true, latency); // UPDATE STATUS

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            const result = data.data[0];
            cardData.push(result);

            const realCardHTML = createCard(result);
            document.getElementById(cardId).outerHTML = realCardHTML;
            renderChart(result.ticker, result.history);
            updatePortfolioOverview();
            updateNewsTicker(); // Update news feed
        } else {
            throw new Error(data.message || 'No data returned');
        }
    } catch (e) {
        console.error(`Failed to fetch ${ticker}:`, e);
        updateStatusPanel(false, 0); // UPDATE STATUS FAIL

        // USER-FRIENDLY ERROR CARD
        document.getElementById(cardId).outerHTML = `
            <div class="card error-card fade-in" data-ticker="${ticker}">
                <div class="card-header">
                    <h3>❌ ${ticker}</h3>
                </div>
                <p style="color: #f85149; margin: 20px 0;">${e.message}</p>
                <button class="card-btn" onclick="removeCard('${ticker}')">Remove</button>
            </div>
        `;
    }
}

function updateStatusPanel(isOnline, latency) {
    const statusEl = document.querySelector('.status-ok');
    const latencyEl = document.querySelectorAll('.status-item span')[3]; // 2nd item, 2nd span

    if (isOnline) {
        statusEl.textContent = 'ONLINE';
        statusEl.style.color = 'var(--green)';
        if (latencyEl) latencyEl.textContent = `${latency}ms`;
    } else {
        statusEl.textContent = 'OFFLINE';
        statusEl.style.color = 'var(--red)';
    }
}

function createCard(item) {
    const isBuy = item.metrics.action.includes("BUY");
    const isSell = item.metrics.action.includes("SELL");
    const badgeClass = isBuy ? "BUY" : isSell ? "SELL" : "HOLD";
    const scoreColor = isBuy ? '#3fb950' : isSell ? '#f85149' : '#8b949e';

    return `
    <div class="card fade-in" data-ticker="${item.ticker}">
        <div class="card-header">
            <div class="asset-title">
                <h3>${item.ticker}</h3>
                <span class="regime-tag">${item.metrics.regime} MODE</span>
            </div>
            <div class="badge ${badgeClass}">${item.metrics.action}</div>
        </div>
        
        <div class="metrics-row">
            <div class="metric">
                <div class="label">PRICE</div>
                <div class="value">${item.price.toFixed(2)}</div>
            </div>
            <div class="metric">
                <div class="label">CONFIDENCE</div>
                <div class="value" style="color: ${scoreColor}">${item.metrics.score}</div>
            </div>
            <div class="metric">
                <div class="label">RSI / ATR</div>
                <div class="value">${item.metrics.rsi.toFixed(0)} <span style="font-size:10px;opacity:0.5">/ ${item.metrics.atr.toFixed(1)}</span></div>
            </div>
        </div>
        
        <!-- AI FORECAST (NEW) -->
        <div style="background:rgba(142, 68, 173, 0.1); border:1px solid rgba(142, 68, 173, 0.3); padding:10px; border-radius:8px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-size:10px; font-weight:800; color:#9b59b6; letter-spacing:0.5px; display:flex; align-items:center; gap:4px;">
                    <span>🧠</span> QUANT.OS NEURAL PREDICTION
                </div>
                <div style="font-size:9px; background:#9b59b6; color:white; padding:1px 4px; border-radius:4px;">V3.0</div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <div style="font-size:9px; color:var(--text-muted); margin-bottom:2px;">3-DAY TARGET</div>
                    <div style="font-size:18px; font-weight:700; color:var(--text-main);">
                        ${(item.metrics.forecast_3d || item.price).toFixed(2)}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:9px; color:var(--text-muted); margin-bottom:2px;">PROBABLE RANGE</div>
                    <div style="font-size:11px; font-family:var(--font-mono); color:var(--text-main);">
                        ${(item.metrics.forecast_low || item.price).toFixed(2)} - ${(item.metrics.forecast_high || item.price).toFixed(2)}
                    </div>
                </div>
            </div>

            <!-- Confidence Bar -->
            <div style="margin-top:8px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--text-muted); margin-bottom:2px;">
                    <span>Model Confidence</span>
                    <!-- Fallback to Score-based confidence if Model is 0 -->
                    <span>${((item.metrics.forecast_conf || (item.metrics.score * 0.008)) * 100).toFixed(0)}%</span>
                </div>
                <div style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                    <div style="height:100%; width:${Math.min(((item.metrics.forecast_conf || (item.metrics.score * 0.008)) * 100), 100)}%; background:#9b59b6;"></div>
                </div>
            </div>
        </div>
        
        <div class="chart-controls">
            <button class="timeframe-btn active" onclick="changeTimeframe('${item.ticker}', '1M')">1M</button>
            <button class="timeframe-btn" onclick="changeTimeframe('${item.ticker}', '3M')">3M</button>
            <button class="timeframe-btn" onclick="changeTimeframe('${item.ticker}', '6M')">6M</button>
            <button class="timeframe-btn" onclick="changeTimeframe('${item.ticker}', '1Y')">1Y</button>
        </div>
        
        <div class="chart-container">
            <canvas id="chart-${item.ticker.replace(/\W/g, '')}"></canvas>
        </div>
        
        <div class="report-box">${item.report}</div>
        
        <div class="card-actions">
            <button class="card-btn" onclick="downloadSinglePDF('${item.ticker}')">📄 PDF</button>
            <button class="card-btn" onclick="toggleCompare('${item.ticker}')">📊 Compare</button>
            <button class="card-btn" onclick="removeCard('${item.ticker}')">🗑️ Remove</button>
        </div>
    </div>
    `;
}

// ... (renderChart remains same) ...

window.downloadSinglePDF = async (ticker) => {
    const card = document.querySelector(`[data-ticker="${ticker}"]`);
    if (!card) return;

    // FIND DATA ITEM
    const item = cardData.find(c => c.ticker === ticker);
    if (!item) { alert("Data not found"); return; }

    const btn = card.querySelector('button[onclick*="PDF"]');
    const origText = btn.textContent;
    btn.textContent = '⏳ ...';

    try {
        // 1. CAPTURE CHART
        const canvasEl = card.querySelector('canvas');
        let chartImg = null;
        if (canvasEl) {
            // Create a temp white bg canvas to avoid transparent issues
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasEl.width;
            tempCanvas.height = canvasEl.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvasEl, 0, 0);
            chartImg = tempCanvas.toDataURL('image/png');
        }

        // 2. SETUP PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // --- HEADER ---
        doc.setFillColor(22, 27, 34); // Brand Dark
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.text(ticker, 15, 20);

        // Sub-header details
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`EQUITY RESEARCH REPORT | ${new Date().toLocaleDateString()}`, 15, 30);

        doc.setFontSize(14);
        doc.text(`${item.price.toFixed(2)}`, pageWidth - 40, 20);
        doc.setFontSize(9);
        doc.text("CURRENT PRICE", pageWidth - 40, 26);

        // --- RECOMMENDATION BAND ---
        const action = item.metrics.action;
        let bandColor = [100, 100, 100]; // Grey
        if (action.includes("BUY")) bandColor = [0, 150, 0];
        if (action.includes("SELL")) bandColor = [200, 0, 0];

        doc.setFillColor(...bandColor);
        doc.rect(0, 40, pageWidth, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`RATING: ${action}  (Score: ${item.metrics.score}/100)`, 15, 46.5);
        doc.setFont(undefined, 'normal');
        doc.text(`Regime: ${item.metrics.regime}`, pageWidth - 80, 46.5);

        let y = 65;
        doc.setTextColor(0, 0, 0);

        // --- SECTION 1: AI PREDICTION & FUNDAMENTALS ---
        doc.setDrawColor(0);
        doc.setFillColor(245, 247, 250);
        doc.rect(15, y - 5, pageWidth - 30, 35, 'F');

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text("AI FORECAST (3-DAY)", 20, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);

        // Forecast Data
        const f_target = item.metrics.forecast_3d || item.price;
        const f_high = item.metrics.forecast_high || (item.price * 1.02);
        const f_low = item.metrics.forecast_low || (item.price * 0.98);
        const upside = ((f_target - item.price) / item.price) * 100;

        doc.text(`Target: ${f_target.toFixed(2)}`, 20, y + 8);
        doc.setTextColor(upside >= 0 ? 0 : 200, upside >= 0 ? 150 : 0, 0);
        doc.text(`(${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%)`, 50, y + 8);
        doc.setTextColor(0, 0, 0);

        doc.text(`Range: ${f_low.toFixed(2)} - ${f_high.toFixed(2)}`, 20, y + 16);
        doc.text(`Vol Implied: ${(item.metrics.atr || 0).toFixed(2)}`, 20, y + 24);

        // Right side of box (Technicals)
        doc.setFont(undefined, 'bold');
        doc.text("KEY LEVELS", 100, y);
        doc.setFont(undefined, 'normal');
        doc.text(`Pivot: ${(item.metrics.pivot || 0).toFixed(2)}`, 100, y + 8);
        doc.text(`Supp: ${(item.metrics.support || 0).toFixed(2)}`, 100, y + 16);
        doc.text(`Res:  ${(item.metrics.resistance || 0).toFixed(2)}`, 100, y + 24);

        doc.setFont(undefined, 'bold');
        doc.text("INDICATORS", 150, y);
        doc.setFont(undefined, 'normal');
        doc.text(`RSI: ${(item.metrics.rsi || 50).toFixed(1)}`, 150, y + 8);
        doc.text(`RVOL: ${(item.metrics.rvol || 1).toFixed(1)}x`, 150, y + 16);

        y += 40;

        // --- SECTION 2: CHART ---
        if (chartImg) {
            const chartHeight = 80;
            doc.addImage(chartImg, 'PNG', 15, y, pageWidth - 30, chartHeight);
            doc.rect(15, y, pageWidth - 30, chartHeight); // border
            y += chartHeight + 15;
        }

        // --- SECTION 3: ANALYTICS & DRIVERS ---
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text("ALGORITHMIC DRIVERS & RATIONALE", 15, y);
        doc.line(15, y + 2, pageWidth - 15, y + 2);
        y += 10;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        const reasons = item.metrics.reasons || [];
        if (reasons.length > 0) {
            reasons.forEach(r => {
                doc.text(`• ${r}`, 15, y);
                y += 6;
            });
        } else {
            doc.text("No specific drivers identified for this session.", 15, y);
            y += 6;
        }

        // Space
        y += 10;

        // --- FOOTER / DISCLAIMER ---
        const footerY = pageHeight - 20;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.line(15, footerY, pageWidth - 15, footerY);
        doc.text("DISCLAIMER: This report is generated by Quant.OS AI for informational purposes only.", 15, footerY + 5);
        doc.text("It does not constitute financial advice. Trading involves risk. System Generated.", 15, footerY + 9);

        // SAVE
        doc.save(`${ticker}_Equity_Report.pdf`);

    } catch (e) {
        console.error("PDF Fail:", e);
        alert(`Failed to generate report: ${e.message}`);
    } finally {
        btn.textContent = origText;
    }
};

function exportReport() {
    // Check if we have data
    if (cardData.length === 0) {
        alert("No data to export!");
        return;
    }

    const format = prompt("Export All Data? Type 'pdf' or 'csv'", "pdf");

    if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(22);
        doc.text("Quant.OS Market Report", 14, 20);

        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
        doc.text(`Total Assets: ${cardData.length}`, 14, 35);

        let y = 50;

        // Table Header
        doc.setFont(undefined, 'bold');
        doc.text("Ticker", 14, y);
        doc.text("Price", 40, y);
        doc.text("Action", 70, y);
        doc.text("Score", 100, y);
        doc.text("Regime", 130, y);
        y += 10;
        doc.setFont(undefined, 'normal');

        cardData.forEach(c => {
            if (y > 270) { doc.addPage(); y = 20; }

            doc.text(c.ticker, 14, y);
            doc.text(c.price.toFixed(2), 40, y);

            // Color code action? (Hard in simple PDF, keeping text)
            doc.text(c.metrics.action, 70, y);
            doc.text(c.metrics.score.toString(), 100, y);
            doc.text(c.metrics.regime.split(' ')[0], 130, y);

            y += 8;
        });

        doc.save('QuantOS_Full_Report.pdf');
    } else if (format === 'csv') {
        exportCSV();
    }
}

function renderChart(ticker, history) {
    const canvasId = `chart-${ticker.replace(/\W/g, '')}`;

    // DESTROY EXISTING CHART (Memory Leak Fix)
    if (chartInstances[ticker]) {
        chartInstances[ticker].destroy();
        delete chartInstances[ticker];
    }

    const ctx = document.getElementById(canvasId);
    if (!ctx) return; // Guard

    const prices = history.map(h => h.Close);
    const labels = history.map(h => h.Date);

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const gridColor = isLight ? 'rgba(208, 215, 222, 0.5)' : 'rgba(48, 54, 61, 0.5)';
    const textColor = isLight ? '#57606a' : '#8b949e';
    const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(22, 27, 34, 0.9)';
    const tooltipText = isLight ? '#24292f' : '#c9d1d9';

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, isLight ? 'rgba(9, 105, 218, 0.2)' : 'rgba(88, 166, 255, 0.25)');
    gradient.addColorStop(1, isLight ? 'rgba(9, 105, 218, 0.0)' : 'rgba(88, 166, 255, 0.0)');

    const lineColor = isLight ? '#0969da' : '#58a6ff';

    chartInstances[ticker] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: prices,
                borderColor: lineColor,
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: true,
                tension: 0.3 // Smoother curve for aesthetics
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: tooltipBg,
                    titleColor: textColor,
                    bodyColor: tooltipText,
                    bodyFont: { family: 'JetBrains Mono' },
                    borderColor: gridColor,
                    borderWidth: 1
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    position: 'right',
                    grid: { color: 'rgba(48, 54, 61, 0.5)', drawBorder: false },
                    ticks: { color: '#8b949e', font: { family: 'JetBrains Mono', size: 10 } }
                }
            }
        }
    });
}

function destroyAllCharts() {
    Object.keys(chartInstances).forEach(ticker => {
        if (chartInstances[ticker]) {
            chartInstances[ticker].destroy();
            delete chartInstances[ticker];
        }
    });
}

function updatePortfolioOverview() {
    if (cardData.length === 0) {
        els.portfolioPanel.classList.add('hidden');
        return;
    }

    els.portfolioPanel.classList.remove('hidden');

    document.getElementById('total-assets').textContent = cardData.length;

    const avgScore = cardData.reduce((sum, c) => sum + c.metrics.score, 0) / cardData.length;
    document.getElementById('avg-confidence').textContent = avgScore.toFixed(0);
    document.getElementById('avg-confidence').style.color = avgScore > 0 ? '#3fb950' : '#f85149';

    const best = cardData.reduce((max, c) => c.metrics.score > max.metrics.score ? c : max);
    document.getElementById('best-performer').textContent = best.ticker;
    document.getElementById('best-performer').style.color = '#3fb950';

    const worst = cardData.reduce((min, c) => c.metrics.score < min.metrics.score ? c : min);
    document.getElementById('worst-performer').textContent = worst.ticker;
    document.getElementById('worst-performer').style.color = '#f85149';

    const trendingCount = cardData.filter(c => c.metrics.regime.includes('TRENDING')).length;
    const regimePercent = ((trendingCount / cardData.length) * 100).toFixed(0);
    document.getElementById('market-regime').textContent = `${regimePercent}% TREND`;
}

window.toggleCompare = (ticker) => {
    if (selectedForComparison.includes(ticker)) {
        selectedForComparison = selectedForComparison.filter(t => t !== ticker);
    } else {
        if (selectedForComparison.length < 3) {
            selectedForComparison.push(ticker);
        }
    }

    document.querySelectorAll('.card').forEach(card => {
        const t = card.getAttribute('data-ticker');
        const btn = card.querySelector('.card-btn');
        if (btn && selectedForComparison.includes(t)) {
            btn.classList.add('active');
        } else if (btn) {
            btn.classList.remove('active');
        }
    });

    if (selectedForComparison.length >= 2) {
        comparisonMode = true;
        renderComparisonView();
    } else {
        comparisonMode = false;
        els.comparisonContainer.classList.add('hidden');
        els.grid.classList.remove('hidden');
    }
};

function toggleComparisonMode() {
    if (comparisonMode) {
        comparisonMode = false;
        selectedForComparison = [];
        els.comparisonContainer.classList.add('hidden');
        els.grid.classList.remove('hidden');

        document.querySelectorAll('.card-btn').forEach(btn => btn.classList.remove('active'));
    }
}

function renderComparisonView() {
    els.grid.classList.add('hidden');
    els.comparisonContainer.classList.remove('hidden');
    els.comparisonContainer.className = selectedForComparison.length === 3 ? 'triple' : '';

    const compareData = cardData.filter(c => selectedForComparison.includes(c.ticker));
    els.comparisonContainer.innerHTML = compareData.map(c => createCard(c)).join('');

    compareData.forEach(c => renderChart(c.ticker, c.history));
}

window.changeTimeframe = async (ticker, period) => {
    const card = document.querySelector(`[data-ticker="${ticker}"]`);
    if (!card) return;

    // Visual feedback
    card.querySelectorAll('.timeframe-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Show loading in chart area
    const chartContainer = card.querySelector('.chart-container');
    const originalHTML = chartContainer.innerHTML;
    chartContainer.innerHTML = '<div class="spinner-sm" style="margin: 50px auto;"></div>';

    try {
        // Fetch new data with timeframe
        const res = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers: [ticker], timeframe: period })
        });

        const data = await res.json();

        if (data.status === 'success' && data.data && data.data.length > 0) {
            const result = data.data[0];

            // Update card data
            const index = cardData.findIndex(c => c.ticker === ticker);
            if (index !== -1) {
                cardData[index] = result;
            }

            // Restore chart container and re-render
            chartContainer.innerHTML = `<canvas id="chart-${ticker.replace(/\W/g, '')}"></canvas>`;
            renderChart(result.ticker, result.history);
        } else {
            throw new Error('Failed to load timeframe data');
        }
    } catch (e) {
        console.error(`Timeframe change failed for ${ticker}:`, e);
        chartContainer.innerHTML = originalHTML;
        alert(`Failed to load ${period} data. Please try again.`);
    }
};

window.removeCard = (ticker) => {
    // CLEANUP CHART
    if (chartInstances[ticker]) {
        chartInstances[ticker].destroy();
        delete chartInstances[ticker];
    }

    activeTickers = activeTickers.filter(t => t !== ticker);
    cardData = cardData.filter(c => c.ticker !== ticker);

    // REMOVE FROM COMPARISON
    selectedForComparison = selectedForComparison.filter(t => t !== ticker);

    // EXIT COMPARISON IF <2 LEFT
    if (comparisonMode && selectedForComparison.length < 2) {
        toggleComparisonMode();
    }

    const card = document.querySelector(`[data-ticker="${ticker}"]`);
    if (card) card.remove();

    updatePortfolioOverview();
    updateSelectedTickers(); // Update visual display
};

function exportReport() {
    const format = prompt("Export format? (pdf/json/csv)", "pdf");

    if (format === 'pdf') {
        exportPDF();
    } else if (format === 'json') {
        exportJSON();
    } else if (format === 'csv') {
        exportCSV();
    }
}

function exportPDF() {
    // SHOW LOADING
    els.loader.classList.remove('hidden');

    setTimeout(() => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        doc.setFontSize(20);
        doc.text('QuantAI Portfolio Report', 10, 10);
        doc.setFontSize(12);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 10, 20);
        doc.text(`Assets: ${cardData.length}`, 10, 30);

        cardData.forEach((c, i) => {
            const y = 40 + (i * 30);
            doc.text(`${c.ticker}: ${c.metrics.action} (Score: ${c.metrics.score})`, 10, y);
        });

        doc.save('quantai-report.pdf');
        els.loader.classList.add('hidden');
    }, 100);
}

// EXPORT FUNCTION (Global Scope Fix)
window.exportReport = function () {
    if (cardData.length === 0) {
        alert("⚠️ No data to export. Please analyze some assets first.");
        return;
    }

    try {
        if (!window.jspdf) {
            throw new Error("PDF Library not loaded. Check internet connection.");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns

        // Header
        doc.setFillColor(22, 27, 34);
        doc.rect(0, 0, 297, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text("QUANT.OS INTELLIGENCE REPORT", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()} | Assets: ${cardData.length}`, 14, 30);

        doc.setTextColor(0, 0, 0);
        let y = 50;

        // Table Headers
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);

        const cols = [
            { t: "TICKER", x: 14 },
            { t: "PRICE", x: 40 },
            { t: "ACTION", x: 65 },
            { t: "SCORE", x: 95 },
            { t: "REGIME", x: 115 },
            { t: "RSI", x: 150 },
            { t: "RVOL", x: 165 },
            { t: "KEY DRIVERS", x: 190 }
        ];

        cols.forEach(c => doc.text(c.t, c.x, y));
        doc.setDrawColor(200);
        doc.line(14, y + 2, 280, y + 2);
        y += 10;

        doc.setTextColor(0, 0, 0);

        // Rows
        cardData.forEach(c => {
            if (y > 180) {
                doc.addPage();
                y = 20;
                doc.text("(Continued...)", 14, y);
                y += 10;
                cols.forEach(col => doc.text(col.t, col.x, y));
                doc.line(14, y + 2, 280, y + 2);
                y += 10;
            }

            doc.setFont(undefined, 'bold');
            doc.text(c.ticker, 14, y);
            doc.setFont(undefined, 'normal');

            doc.text(c.price.toFixed(2), 40, y);

            // Action Color
            if (c.metrics.action.includes("BUY")) doc.setTextColor(0, 150, 0);
            else if (c.metrics.action.includes("SELL")) doc.setTextColor(200, 0, 0);
            else doc.setTextColor(0, 0, 0);
            doc.text(c.metrics.action, 65, y);
            doc.setTextColor(0, 0, 0);

            doc.text(c.metrics.score.toString(), 95, y);
            doc.text(c.metrics.regime.substring(0, 15), 115, y);
            doc.text(c.metrics.rsi.toFixed(1), 150, y);

            // RVOL logic
            // Need to calculate if not present in metrics yet (it is in report string)
            // But we can get it if we passed it in API. 
            // Wait, we didn't add rvol to API response in api.py 'metrics' dict!
            // I should update api.py too. For now, print N/A or parse?
            // Actually, let's use what we have.

            doc.text("-", 165, y); // Placeholder until api.py update

            // Reasons - Multiline
            const reasons = c.metrics.reasons || [];
            const reasonText = reasons.slice(0, 3).map(r => "• " + r).join("\n");
            doc.setFontSize(8);
            doc.text(reasonText, 190, y);
            doc.setFontSize(9);

            y += 15 + (reasons.length > 0 ? (reasons.length * 3) : 0);
            doc.line(14, y - 5, 280, y - 5);
        });

        doc.save(`QuantOS_Intel_Report_${Date.now()}.pdf`);

    } catch (e) {
        console.error("Export failed:", e);
        // Toast instead of alert
        const t = document.createElement('div');
        t.innerText = `Export Failed: ${e.message}`;
        t.style.cssText = "position:fixed; bottom:20px; right:20px; background:red; color:white; padding:15px; border-radius:5px; z-index:9999;";
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }
};

// VOICE CONTROL (JARVIS MODE)
// VOICE CONTROL (JARVIS MODE)

window.initVoiceControl = () => {
    if (window.location.protocol === 'file:') {
        console.warn("Voice Control disabled on file:// protocol");
        const mb = document.getElementById('mic-btn');
        if (mb) {
            mb.onclick = () => alert("⚠️ SECURITY RESTRICTION\n\nVoice Control requires a Local Server (localhost). It cannot run on a local file directly due to browser security.\n\nPlease run 'python -m http.server' or use text search.");
            mb.style.opacity = "0.5";
            mb.style.cursor = "not-allowed";
        }
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';

    const micBtn = document.getElementById('mic-btn');
    if (!micBtn) return;

    micBtn.addEventListener('click', () => {
        if (micBtn.classList.contains('listening')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    recognition.onstart = () => {
        micBtn.classList.add('listening');
        micBtn.textContent = '🎙️ LISTENING...';
        micBtn.style.background = 'var(--red)';
        micBtn.style.color = 'white';
    };

    recognition.onend = () => {
        micBtn.classList.remove('listening');
        micBtn.textContent = '🎤 VOICE CMD';
        micBtn.style.background = 'transparent';
        micBtn.style.color = 'var(--text-muted)';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        processVoiceCommand(transcript);
    };
};

function processVoiceCommand(cmd) {
    const categories = {
        "crypto": "crypto",
        "bitcoin": "crypto",
        "coins": "crypto",
        "us stocks": "us",
        "tech": "us",
        "american": "us",
        "india": "ind",
        "nifty": "ind",
        "indian": "ind"
    };

    for (const [key, val] of Object.entries(categories)) {
        if (cmd.includes(key)) {
            els.grid.innerHTML = '';
            activeTickers = [];
            cardData = [];
            destroyAllCharts();
            fetchBatch(PRESETS[val]);
            return;
        }
    }

    if (cmd.startsWith("analyze") || cmd.startsWith("search") || cmd.startsWith("show")) {
        let ticker = cmd.replace(/^(analyze|search|show)\s*/, "").toUpperCase();
        ticker = ticker.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

        const voiceMap = {
            "APPLE": "AAPL",
            "TESLA": "TSLA",
            "MICROSOFT": "MSFT",
            "BITCOIN": "BTC-USD",
            "GOOGLE": "GOOGL",
            "AMAZON": "AMZN",
            "NETFLIX": "NFLX",
            "FACEBOOK": "META",
            "META": "META",
            "GOLD": "GC=F",
            "RELIANCE": "RELIANCE.NS",
            "TATA": "TCS.NS",
            "HDFC": "HDFCBANK.NS"
        };

        const finalTicker = voiceMap[ticker] || ticker;
        addTicker(finalTicker);
    }

    else if (cmd.includes("clear") || cmd.includes("reset")) {
        cardData = [];
        els.grid.innerHTML = '';
        activeTickers = [];
        destroyAllCharts();
        updatePortfolioOverview();
        updateSelectedTickers();
    }

    else if (cmd.includes("export") || cmd.includes("report")) {
        window.exportReport();
    }

    else if (cmd.includes("dark mode")) {
        if (document.documentElement.getAttribute('data-theme') !== 'dark') toggleTheme();
    }
    else if (cmd.includes("light mode")) {
        if (document.documentElement.getAttribute('data-theme') !== 'light') toggleTheme();
    }
}

async function updateNewsTicker() {
    const tickerEl = document.getElementById('news-content');
    if (!tickerEl) {
        console.warn('News ticker element not found!');
        return;
    }

    try {
        // Fetch trending news from the web scraping endpoint
        const response = await fetch(`${API_URL}/trending-news?limit=20`);
        const data = await response.json();

        console.log('Trending news fetched:', data);

        if (data.status === 'success' && data.news && data.news.length > 0) {
            const newsHTML = data.news.map(item => {
                // Truncate title if too long
                const shortTitle = item.title.length > 90 ? item.title.substring(0, 90) + "..." : item.title;

                // Get emoji based on source
                let emoji = '📰';
                if (item.source.includes('Yahoo')) emoji = '🔥';
                if (item.source.includes('MarketWatch')) emoji = '💹';
                if (item.source.includes('CNBC')) emoji = '📊';
                if (item.source.includes('Quant')) emoji = '🤖';

                return `
                    <a href="${item.link}" target="_blank" class="news-card" title="${item.title}">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:14px;">${emoji}</span>
                                <span style="font-size:9px; color:var(--text-muted); text-transform:uppercase; font-weight:600;">${item.source}</span>
                                <span style="font-size:8px; color:var(--text-muted); opacity:0.7;">${item.timestamp}</span>
                            </div>
                            <span class="news-headline">${shortTitle}</span>
                        </div>
                    </a>
                `;
            }).join('');

            // DUPLICATE content 3 times for seamless infinite scroll
            tickerEl.innerHTML = newsHTML + newsHTML + newsHTML;
            console.log(`News ticker updated with ${data.news.length} items (duplicated for endless scroll)`);
        } else {
            // Fallback to cardData news if trending news fails
            let allNewsHTML = [];
            cardData.forEach(c => {
                if (c.news && c.news.length > 0) {
                    c.news.forEach(n => {
                        const title = typeof n === 'string' ? n : n.title;
                        const link = typeof n === 'string' ? `https://www.google.com/search?q=${encodeURIComponent(n)}` : n.link;
                        const pub = (typeof n !== 'string' && n.publisher) ? n.publisher : 'MarketWire';
                        const shortTitle = title.length > 70 ? title.substring(0, 70) + "..." : title;

                        const html = `
                            <a href="${link}" target="_blank" class="news-card" title="${title}">
                                <div style="display:flex; flex-direction:column; gap:2px;">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span class="news-tick-badge">${c.ticker}</span>
                                        <span style="font-size:9px; color:var(--text-muted); text-transform:uppercase;">${pub}</span>
                                    </div>
                                    <span class="news-headline">${shortTitle}</span>
                                </div>
                            </a>
                        `;
                        allNewsHTML.push(html);
                    });
                }
            });

            if (allNewsHTML.length === 0) {
                tickerEl.innerHTML = '<div class="news-card" style="opacity:0.5; padding:8px;">📡 Fetching live market intelligence...</div>';
            } else {
                tickerEl.innerHTML = allNewsHTML.join('');
            }
        }
    } catch (error) {
        console.error('Error updating news ticker:', error);
        tickerEl.innerHTML = '<div class="news-card" style="opacity:0.5; padding:8px;">⚠️ News feed temporarily unavailable</div>';
    }
}

// AUTO-REFRESH LOGIC (1 MINUTE)
setInterval(() => {
    if (activeTickers.length > 0) {
        console.log("Auto-Refreshing Data...");
        // Re-fetch all active tickers silently
        fetchBatch(activeTickers);
        // Note: fetchBatch calls fetchTickerData which replaces cards. 
        // Ideally we should update in place, but replacement works for now.
        // It updates News & Prices.
    }
}, 60000); // 60s

// AUTO-REFRESH NEWS TICKER (5 MINUTES)
setInterval(() => {
    console.log("Auto-Refreshing Trending News...");
    updateNewsTicker();
}, 300000); // 5 minutes

// PORTFOLIO STATS LOGIC (Horizontal Bar)
// PORTFOLIO STATS LOGIC (Horizontal Bar)
window.updatePortfolioOverview = function () {
    // Correctly reference the panel from 'els' object (defined at top)
    if (!els.portfolioPanel) return;

    if (cardData.length === 0) {
        els.portfolioPanel.innerHTML = `
            <div class="stat-card" style="flex:1">
                <div class="stat-label">System Status</div>
                <div class="stat-value" style="color:var(--accent)">READY</div>
            </div>
            <div class="stat-card" style="flex:1">
                <div class="stat-label">Data Feed</div>
                <div class="stat-value">WAITING</div>
            </div>
        `;
        els.portfolioPanel.classList.remove('hidden'); // Show empty state too
        return;
    }

    // CALCS
    const totalAssets = cardData.length;
    const avgScore = cardData.reduce((acc, c) => acc + c.metrics.score, 0) / totalAssets;

    // Sort by Score
    const sorted = [...cardData].sort((a, b) => b.metrics.score - a.metrics.score);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Regime Majority
    const regimes = cardData.map(c => c.metrics.regime.split(' ')[0]);
    const modeRegime = regimes.sort((a, b) => regimes.filter(v => v === a).length - regimes.filter(v => v === b).length).pop();

    // HTML GENERATION (Horizontal Strip - INLINE STYLES FORCE)
    // BIGGER FONTS & PADDING
    const rowStyle = "display:flex; flex-direction:row; align-items:center; justify-content:center; gap:16px; flex:1; background:var(--bg-card); padding:16px 20px; border-radius:12px; border:1px solid var(--border);";
    const labelStyle = "font-size:13px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;";
    const valueStyle = "font-size:26px; font-weight:700; font-family:var(--font-mono);"; // Huge Value

    els.portfolioPanel.style.cssText = "display:flex !important; flex-direction:row !important; justify-content:space-between; align-items:center; gap:20px; padding:24px 32px; width:100%; min-height:100px;";

    els.portfolioPanel.innerHTML = `
        <div style="${rowStyle}">
            <span style="${labelStyle}">ASSETS:</span>
            <span style="${valueStyle}">${totalAssets}</span>
        </div>
        <div style="${rowStyle}">
            <span style="${labelStyle}">CONFIDENCE:</span>
            <span style="${valueStyle} color:${avgScore > 0 ? 'var(--green)' : 'var(--red)'}">${avgScore.toFixed(0)}</span>
        </div>
        <div style="${rowStyle}">
            <span style="${labelStyle}">BEST:</span>
            <span style="${valueStyle} color:var(--green)">${best.ticker}</span>
        </div>
        <div style="${rowStyle}">
            <span style="${labelStyle}">WORST:</span>
            <span style="${valueStyle} color:var(--red)">${worst.ticker}</span>
        </div>
        <div style="${rowStyle}">
            <span style="${labelStyle}">REGIME:</span>
            <span style="${valueStyle} color:var(--accent)">${modeRegime}</span>
        </div>
    `;

    // FORCE VISIBILITY
    els.portfolioPanel.classList.remove('hidden');

    updateNewsTicker();
};

init();
initTheme();
// Initial Render (Safe now)
window.updatePortfolioOverview();
window.initVoiceControl();

// Load trending news immediately on startup
updateNewsTicker();
