import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
import time
import requests

class DataCollectionAgent:
    def __init__(self, tickers):
        self.tickers = tickers

    def fetch_data(self, timeframe="1Y"):
        # Map timeframe to days
        timeframe_map = {
            "1M": 60,   # Fetch 60 days for 1M view to ensure regression context
            "3M": 150,  # Fetch 5 months for 3M view
            "6M": 250,
            "1Y": 400,  # Buffer for 1Y
            "MAX": 365 * 5
        }
        
        days = timeframe_map.get(timeframe, 365)
        end = datetime.now()
        start = end - timedelta(days=days)
        
        data = {}
        for t in self.tickers:
            print(f"Fetching price data for {t} ({timeframe})...")
            
            # --- 1. RESOLUTION / AUTO-CORRECT ---
            # If ticker has no dot and > 4 chars (likely a name like "NVIDIA"), or if it fails initially
            # We will try to resolve it first if it looks like a name? 
            # Actually, let's try direct first, then resolve if empty.
            
            resolved_t = t
            df = pd.DataFrame()
            
            # Attempt 1: Direct Download
            try:
                df = yf.download(t, start=start, end=end, progress=False, timeout=10)
            except: pass
            
            # Attempt 2: Auto-Correction (Name -> Symbol) if empty
            if df.empty or len(df) == 0:
                print(f"  > Data empty for '{t}'. Attempting Auto-Resolution...")
                try:
                    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={t}&quotesCount=1&newsCount=0"
                    headers = {'User-Agent': 'Mozilla/5.0'}
                    r = requests.get(url, headers=headers, timeout=2)
                    res = r.json()
                    if 'quotes' in res and len(res['quotes']) > 0:
                        candidate = res['quotes'][0]['symbol']
                        print(f"  > Auto-Resolved '{t}' -> '{candidate}'")
                        resolved_t = candidate
                        # Retry with resolved symbol
                        df = yf.download(resolved_t, start=start, end=end, progress=False, timeout=10)
                except Exception as e:
                    print(f"  > Resolution failed: {e}")

            # Attempt 3: Ticker.history (Fallback)
            if df.empty:
                print(f"  > Method 1 failed for '{resolved_t}', trying Ticker.history fallback...")
                try:
                    df = yf.Ticker(resolved_t).history(start=start, end=end)
                except: pass

            if not df.empty:
                # FLATTEN MULTI-INDEX
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                
                # Verify required columns
                if 'Close' not in df.columns:
                    print(f"  > Invalid dataframe for {t} (No Close col)")
                    continue
                    
                data[t] = df # Store under ORIGINAL key 't' so frontend matches
                print(f"  > Success: Fetched {len(df)} rows for {t}")
            else:
                print(f"  ❌ FAILED to fetch data for {t} after all attempts.")
                
        return data

    def fetch_news(self):
        news_map = {}
        for t in self.tickers:
            try:
                # Use resolved ticker if possible? 
                # For now just use t. yfinance handles names poorly for news usually, needs symbol.
                # But we don't store resolved_t in self.tickers. 
                # Ideally update self.tickers? No, risky.
                
                news = yf.Ticker(t).news
                headlines = []
                for n in news:
                    title = n.get('title') or n.get('content', {}).get('title')
                    link = n.get('link') or n.get('content', {}).get('canonicalUrl')
                    publisher = n.get('publisher')
                    
                    if title:
                        headlines.append({
                            "title": title,
                            "link": link or f"https://www.google.com/search?q={title}",
                            "publisher": publisher,
                            "uuid": n.get('uuid')
                        })
                news_map[t] = headlines[:5]
            except:
                news_map[t] = []
        return news_map
