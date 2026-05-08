from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from typing import List, Optional
import uvicorn
import pandas as pd
import json
import math
import requests
import re

# Import Agents
from agents.data_collection_agent import DataCollectionAgent
from agents.data_analysis_agent import DataAnalysisAgent
from agents.sentiment_agent import SentimentAgent
from agents.communication_agent import CommunicationAgent
from agents.trading_agent import TradingAgent
from agents.news_scraper_agent import NewsScraperAgent
import os

app = FastAPI(title="QuantAI API", version="3.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Dashboard as Static Files
# This allows serving the frontend at http://localhost:8000/dashboard
dashboard_path = os.path.join(os.path.dirname(__file__), "dashboard")
app.mount("/dashboard", StaticFiles(directory=dashboard_path), name="dashboard")

# Initialize Agents
agents = {
    "data": DataCollectionAgent([]), 
    "analysis": DataAnalysisAgent(),
    "sentiment": SentimentAgent(),
    "comm": CommunicationAgent(),
    "trade": TradingAgent(),
    "news": NewsScraperAgent()
}

class AnalysisRequest(BaseModel):
    tickers: List[str]
    timeframe: Optional[str] = "1Y"

@app.get("/health")
def health_check():
    return {"status": "online", "system": "QuantAI v3.0"}

@app.get("/")
def root():
    return RedirectResponse(url="/dashboard/index.html")

@app.get("/search")
def search_ticker(q: str):
    try:
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=10&newsCount=0"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        r = requests.get(url, headers=headers, timeout=5)
        data = r.json()
        
        if 'quotes' in data:
            results = []
            for item in data['quotes']:
                if 'symbol' not in item: continue
                results.append({
                    "symbol": item['symbol'],
                    "name": item.get('longname') or item.get('shortname') or item['symbol'],
                    "exchange": item.get('exchange', 'UNKNOWN'),
                    "type": item.get('quoteType', 'EQUITY')
                })
            return {"count": len(results), "results": results}
        return {"count": 0, "results": []}
    except Exception as e:
        print(f"Search Error: {e}")
        return {"count": 0, "results": []}

@app.get("/trending-news")
def get_trending_news(limit: int = 20):
    """
    Fetch hot stock news of the hour through web scraping
    """
    try:
        news_items = agents["news"].fetch_trending_news(limit=limit)
        return {
            "status": "success",
            "count": len(news_items),
            "news": news_items
        }
    except Exception as e:
        print(f"Trending News Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "message": str(e),
            "count": 0,
            "news": []
        }

def json_sanitize(obj):
    if isinstance(obj, dict):
        return {k: json_sanitize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [json_sanitize(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj): return 0.0
        return obj
    return obj

@app.post("/analyze")
def run_analysis(req: AnalysisRequest):
    # Basic validation
    if not req.tickers: raise HTTPException(status_code=400, detail="No tickers")
    
    # Clean tickers strictly but allow typical symbols
    # We relax the regex to allow more global format
    # But actually, DataCollectionAgent will handle resolution now!
    
    # We just strip and upper
    cleaned_tickers = [t.strip().upper() for t in req.tickers if t.strip()]
    
    if not cleaned_tickers:
        raise HTTPException(status_code=400, detail="No valid tickers")
    
    try:
        agents["data"].tickers = cleaned_tickers
        
        raw_data = agents["data"].fetch_data(timeframe=req.timeframe)
        news_map = agents["data"].fetch_news()
        
        if not raw_data:
            return {"status": "error", "message": "No data could be fetched for any ticker", "data": []}
            
        signals = agents["analysis"].analyze(raw_data)
        
        results = []
        for t in cleaned_tickers:
            # Note: t is the ORIGINAL key. DataCollectionAgent stores result under this key even if resolved.
            if t not in signals: continue
            
            sig = signals[t]
            headlines = news_map.get(t, [])
            sentiment = agents["sentiment"].analyze(headlines)
            decision = agents["trade"].decide(sig, sentiment)
            report = agents["comm"].explain(t, sig, decision)
            
            df = raw_data[t].tail(100)
            df = df.reset_index()
            
            # Normalize Date column logic
            col_map = {c: 'Date' for c in df.columns if str(c).lower() in ['date', 'datetime', 'timestamp']}
            if col_map: df.rename(columns=col_map, inplace=True)
            elif 'index' in df.columns: df.rename(columns={'index': 'Date'}, inplace=True)
            else: df.rename(columns={df.columns[0]: 'Date'}, inplace=True)
            
            df['Date'] = df['Date'].astype(str)

            results.append({
                "ticker": t,
                "price": sig['price'],
                "metrics": {
                    "rsi": sig['rsi'],
                    "macd": sig['macd'],
                    "atr": sig['atr'],
                    "rvol": sig.get('rvol', 1.0),
                    "forecast_3d": sig.get('forecast_3d', 0),
                    "forecast_conf": sig.get('forecast_conf', 0),
                    "forecast_high": sig.get('forecast_range_high', 0),
                    "forecast_low": sig.get('forecast_range_low', 0),
                    "support": sig.get('support', 0),
                    "resistance": sig.get('resistance', 0),
                    "pivot": sig.get('pivot_points', {}).get('P', 0),
                    "score": decision['score'],
                    "action": decision['action'],
                    "regime": decision.get('regime', 'N/A'),
                    "reasons": decision.get('reasons', [])
                },
                "news": headlines[:3] if headlines else [
                    {"title": f"{t} trading update: Market analysis in progress", "link": f"https://finance.yahoo.com/quote/{t}", "publisher": "Market Intel"},
                    {"title": f"Latest developments for {t} - Real-time monitoring active", "link": f"https://finance.yahoo.com/quote/{t}", "publisher": "Trading Desk"}
                ],
                "report": report,
                "history": df.to_dict(orient='records')
            })
            
        return json_sanitize({"status": "success", "data": results})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


    
