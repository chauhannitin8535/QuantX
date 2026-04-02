# 💠 QUANT.OS - Professional AI Trading System

A high-performance Agentic AI system for quantitative analysis, real-time sentiment scanning, and algorithmic trading decisions. This project utilizes a multi-agent architecture to process market data from raw inputs to final trade recommendations.

## 🚀 Architecture & Tech Stack

### Backend (Python/FastAPI)
The core engine is built with **Python 3.11+** and **FastAPI**, providing a high-speed, asynchronous API that orchestrates the specialized agents.
- **FastAPI**: Handles API routing, CORS, and serves the static dashboard.
- **Uvicorn**: High-performance ASGI server.
- **yFinance**: Real-time financial data extraction (Equities, Forex, Crypto).
- **BeautifulSoup4 (BS4)**: Real-time web scraping for trending market news.
- **Transformers (FinBERT)**: Financial-specialized NLP model for sentiment analysis.
- **Pandas/NumPy**: Heavy-duty data processing and technical indicator calculation.

### Frontend (Vanilla JS/HTML5/CSS3)
A custom-built financial terminal designed with **Premium Glassmorphism Aesthetics**.
- **Vanilla JavaScript**: Zero-dependency frontend logic for maximum speed.
- **Chart.js**: Dynamic, interactive financial charting.
- **Web Speech API**: Integrated voice command system (enabled via Localhost).
- **CSS3 Animations**: High-performance scrolling news tickers and micro-interactions.

---

## 🤖 Multi-Agent System

Quant.OS operates using 6 specialized AI agents working in harmony:

1.  **📡 Data Collection Agent**: Fetches historical and real-time price data using `yfinance`. Supports multi-market tickers (NSE, US, Crypto).
2.  **📈 Data Analysis Agent**: The technical heart. Computes RSI, MACD, ATR, and Pivot Points. It also features a **Market Regime Detector** (Trending vs. Ranging) using ADX and ATR.
3.  **🧠 Sentiment Agent**: Analyzes news headlines using the `FinBERT` model. It classifies market sentiment as Bullish, Bearish, or Neutral.
4.  **⚖️ Trading Agent**: The scoring engine. Combines technical signals and sentiment data to generate a confidence score (0-100) and specific actions (BUY/SELL/HOLD).
5.  **💬 Communication Agent**: Translates complex quantitative data into professional, human-readable trade reports.
6.  **📰 News Scraper Agent**: A real-time web scraper that pulls "Hot Stock News" from Yahoo Finance, MarketWatch, and CNBC to power the **LIVE INTEL** feed.

---

## ⚡ Quick Start

To get the system up and running immediately, use the following commands:

```bash
# 1. Install all dependencies
pip install -r requirements.txt

# 2. Start the unified server
python api.py
```

*For Windows users, you can also simply double-click the **`run.bat`** file in the root directory.*

---

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.8 or higher installed on your system.
- An internet connection for real-time market data.

### 1. Initialize the Environment
Clone the repository and install the required dependencies:
```bash
pip install -r requirements.txt
```
*Dependencies include: `fastapi`, `uvicorn`, `pandas`, `numpy`, `yfinance`, `transformers`, `torch`, `beautifulsoup4`, `lxml`, `requests`.*

### 2. Run the Application
The system is now configured to run as a unified server. Launch it with:
```bash
python api.py
```
Wait for the logs to show: `Uvicorn running on http://0.0.0.0:8000`.

### 3. Access the Dashboard
Open your web browser and go to:
**`http://localhost:8000`**

*Note: You must use `localhost` (not the local file path) to enable the Voice Command microphone permissions.*

---

## 📊 Features

-   **Infinite LIVE INTEL**: A bottom-mounted news ticker that continuously scrolls trending financial news from global sources.
-   **Neural Prediction**: ATR-based 3-day volatility targets and probable price ranges.
-   **Voice Control**: Control your terminal hands-free. Say *"Analyze Nifty"*, *"Dark Mode"*, or *"Switch to US Tech"*.
-   **Dynamic Regime Detection**: Automatically adjusts analysis logic based on whether the market is in a "Trending" or "Squeeze/Ranging" mode.
-   **Report Export**: Generate PDF or CSV research reports for any asset with a single click.

---

## 📂 Project Structure
```text
ai_trading_agent/
├── agents/                  # Multi-Agent Logic
│   ├── data_collection_agent.py
│   ├── data_analysis_agent.py
│   ├── sentiment_agent.py
│   ├── trading_agent.py
│   ├── communication_agent.py
│   └── news_scraper_agent.py
├── dashboard/               # Frontend UI
│   ├── index.html           # Main UI Structure
│   ├── style.css            # Premium Aesthetics
│   ├── app.js               # Frontend Orchestration
│   └── tickers.js           # Market Preset Data
├── api.py                   # Unified Server (FastAPI)
└── requirements.txt         # Dependency Registry
```

---
*Built for the Modern Quant. Managed by Multi-Agent AI.*
http://localhost:8000/dashboard
