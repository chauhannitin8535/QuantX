import pandas as pd
import numpy as np

class DataAnalysisAgent:
    def analyze(self, data):
        signals = {}
        for t, df in data.items():
            # SAFE DEFAULT if data invalid
            if len(df) < 50:
                close = float(df['Close'].iloc[-1]) if len(df) > 0 and 'Close' in df else 0.0
                signals[t] = self._get_empty_signal(close)
                continue
            
            # Extract Series
            close = df['Close']
            low = df['Low']
            high = df['High'] 
            
            # --- VOLUME ---
            if 'Volume' in df.columns:
                vol = df['Volume']
                vol_sma20 = vol.rolling(20).mean()
                rvol = vol / vol_sma20.replace(0, 1)
                df['Vol_SMA20'] = vol_sma20
                df['RVOL'] = rvol
            else:
                df['Vol_SMA20'] = 0
                df['RVOL'] = 1.0

            # --- SUPPORT / RESISTANCE (50 Day) ---
            df['Support_50'] = low.rolling(50).min()
            df['Resistance_50'] = high.rolling(50).max()
            
            # --- FIBONACCI RETRACEMENT (Last 100 periods) ---
            recent_high = high.tail(100).max()
            recent_low = low.tail(100).min()
            diff = recent_high - recent_low
            fib_levels = {
                "0.0% (Low)": recent_low,
                "23.6%": recent_low + 0.236 * diff,
                "38.2%": recent_low + 0.382 * diff,
                "50.0%": recent_low + 0.5 * diff,
                "61.8%": recent_low + 0.618 * diff,
                "100.0% (High)": recent_high
            }
            
            # --- PIVOT POINTS (Standard) ---
            prev_high = float(high.iloc[-2])
            prev_low = float(low.iloc[-2])
            prev_close = float(close.iloc[-2])
            pivot = (prev_high + prev_low + prev_close) / 3
            pivot_points = {
                "P": pivot, 
                "R1": (2 * pivot) - prev_low, 
                "S1": (2 * pivot) - prev_high
            }

            # --- TREND & OSCILLATORS ---
            df['EMA20'] = close.ewm(span=20, adjust=False).mean()
            df['EMA50'] = close.ewm(span=50, adjust=False).mean()
            df['EMA200'] = close.ewm(span=200, adjust=False).mean()
            
            # MACD
            exp12 = close.ewm(span=12, adjust=False).mean()
            exp26 = close.ewm(span=26, adjust=False).mean()
            df['MACD'] = exp12 - exp26
            df['Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
            
            # RSI
            delta = close.diff()
            gain = (delta.where(delta > 0, 0)).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss.replace(0, 1e-10)
            df['RSI'] = 100 - (100 / (1 + rs))
            df['RSI'] = df['RSI'].fillna(50.0)
            
            # Stoch
            low_14 = low.rolling(14).min()
            high_14 = high.rolling(14).max()
            denom = (high_14 - low_14).replace(0, 1e-10)
            df['%K'] = 100 * ((close - low_14) / denom)
            df['%D'] = df['%K'].rolling(3).mean()
            df['%K'] = df['%K'].fillna(50.0)
            df['%D'] = df['%D'].fillna(50.0)
            
            # Bands
            df['SMA20'] = close.rolling(20).mean()
            df['STD20'] = close.rolling(20).std()
            df['Upper_Band'] = df['SMA20'] + (df['STD20'] * 2)
            df['Lower_Band'] = df['SMA20'] - (df['STD20'] * 2)
            df[['Upper_Band', 'Lower_Band']] = df[['Upper_Band', 'Lower_Band']].bfill()
            
            # ATR
            high_low = high - low
            high_close = np.abs(high - close.shift())
            low_close = np.abs(low - close.shift())
            tr = np.max(pd.concat([high_low, high_close, low_close], axis=1), axis=1)
            df['ATR'] = tr.rolling(14).mean().fillna(close * 0.01)

            # ADX Proxy
            ema20_s = df['EMA20']
            ema50_s = df['EMA50']
            df['Adx_Proxy'] = (abs(ema20_s - ema50_s) / close.replace(0, 1e-10)) * 100
            
            # --- ADVANCED PREDICTIVE ANALYTICS ---
            # Linear Regression for Short Term Forecast
            # Dynamic Lookback: Try 30, but adapt if data is short (min 10)
            available_points = len(close)
            lookback = 30
            
            if available_points < 30 and available_points >= 10:
                lookback = available_points
            
            forecast_target = float(close.iloc[-1])
            forecast_conf = 0.0 # R-Squared
            
            if available_points >= lookback and available_points >= 10:
                y = close.iloc[-lookback:].values
                x = np.arange(lookback)
                
                # Fit
                coeffs = np.polyfit(x, y, 1) # [slope, intercept]
                slope, intercept = coeffs
                
                # Calculate R-Squared
                # Calculate R-Squared (Standard Formula)
                p = np.poly1d(coeffs)
                yhat = p(x)
                ybar = np.sum(y)/len(y)
                ssres = np.sum((y - yhat)**2) # Residual sum of squares
                sstot = np.sum((y - ybar)**2) # Total sum of squares
                r_squared = 1 - (ssres / sstot) if sstot != 0 else 0.0
                
                # COMPOSITE CONFIDENCE SCORE (R2 + Trend)
                adx_score = df['Adx_Proxy'].iloc[-1] / 100.0
                adx_score = max(0.0, min(1.0, adx_score))
                
                # Weighted: 70% Math, 30% Trend. Min 5%.
                r_squared = max(0.0, min(1.0, r_squared))
                raw_conf = (r_squared * 0.7) + (adx_score * 0.3)
                forecast_conf = max(0.05, min(0.99, raw_conf))
                
                # Project +3 days
                forecast_target = (slope * (lookback + 2)) + intercept
                
                # Volatility Cone (ATR based, widened by uncertainty)
                curr_atr = df['ATR'].iloc[-1]
                uncertainty_mult = 2.0 + (1.0 - r_squared) # Widen if low confidence
                forecast_high = forecast_target + (curr_atr * uncertainty_mult)
                forecast_low = forecast_target - (curr_atr * uncertainty_mult)
            else:
                forecast_high = forecast_target * 1.02
                forecast_low = forecast_target * 0.98

            signals[t] = {
                'price': float(close.iloc[-1]),
                'ema20': float(df['EMA20'].iloc[-1]),
                'ema50': float(df['EMA50'].iloc[-1]),
                'ema200': float(df['EMA200'].iloc[-1]),
                'macd': float(df['MACD'].iloc[-1]),
                'macd_signal': float(df['Signal'].iloc[-1]),
                'rsi': float(df['RSI'].iloc[-1]),
                'stoch_k': float(df['%K'].iloc[-1]),
                'stoch_d': float(df['%D'].iloc[-1]),
                'upper_band': float(df['Upper_Band'].iloc[-1]),
                'lower_band': float(df['Lower_Band'].iloc[-1]),
                'atr': float(df['ATR'].iloc[-1]),
                'adx_proxy': float(df['Adx_Proxy'].iloc[-1]),
                'vol_sma20': float(df['Vol_SMA20'].iloc[-1]),
                'rvol': float(df['RVOL'].iloc[-1]),
                'support': float(df['Support_50'].iloc[-1]),
                'resistance': float(df['Resistance_50'].iloc[-1]),
                'fib_levels': fib_levels,
                'pivot_points': pivot_points,
                'forecast_3d': float(forecast_target),
                'forecast_range_high': float(forecast_high),
                'forecast_range_low': float(forecast_low),
                'forecast_conf': float(forecast_conf) # R-Squared
            }
            
            # Clean NaNs
            for k, v in signals[t].items():
                if isinstance(v, (int, float)) and (pd.isna(v) or np.isinf(v)):
                    signals[t][k] = 0.0
                
        return signals

    def _get_empty_signal(self, close):
        return {
            'price': close, 'ema20': close, 'ema50': close, 'ema200': close,
            'macd': 0.0, 'macd_signal': 0.0, 'rsi': 50.0,
            'stoch_k': 50.0, 'stoch_d': 50.0,
            'upper_band': close, 'lower_band': close, 'atr': 0.0,
            'adx_proxy': 0.0, 'vol_sma20': 0.0, 'rvol': 1.0,
            'support': close, 'resistance': close,
            'fib_levels': {}, 'pivot_points': {},
            'forecast_3d': close, 'forecast_high': close, 'forecast_low': close,
            'forecast_conf': 0.0
        }
