class TradingAgent:
    def decide(self, analysis, sentiment_score):
        score = 0
        reasons = []
        
        price = analysis.get('price', 0)
        adx = analysis.get('adx_proxy', 0)
        atr = analysis.get('atr', 0)
        rvol = analysis.get('rvol', 1.0)
        
        # Forecast Data
        forecast = analysis.get('forecast_3d', price)
        
        upper = analysis.get('upper_band', 0)
        lower = analysis.get('lower_band', 0)
        ema20 = analysis.get('ema20', 0)
        
        # --- FORECAST INFUSION ---
        # If forecast is > 2% higher than price, it's bullish
        forecast_diff_pct = ((forecast - price) / price) * 100 if price > 0 else 0
        
        if forecast_diff_pct > 2.0:
            score += 15
            reasons.append(f"AI Forecast Bullish (+{forecast_diff_pct:.1f}% Upside)")
        elif forecast_diff_pct < -2.0:
            score -= 15
            reasons.append(f"AI Forecast Bearish ({forecast_diff_pct:.1f}% Downside)")
            
        # --- VOLUME CONFIRMATION ---
        if rvol > 1.5:
            reasons.append(f"High Relative Volume ({rvol:.1f}x avg)")
            
        # --- SQUEEZE LOGIC ---
        is_squeeze = False
        if price > 0:
            bb_width = (upper - lower) / price
            is_squeeze = bb_width < 0.05
            if is_squeeze: reasons.append("Volatility Squeeze (Potential Explosion)")
            
        # --- REGIME ---
        is_trending = adx > 1.0
        regime = "TRENDING" if is_trending else "RANGING"
        if is_squeeze: regime += " (SQUEEZE)"
        reasons.append(f"Regime: {regime}")
        
        if is_trending:
            if ema20 > analysis.get('ema50', 0):
                score += 25
                reasons.append("Uptrend (EMA20 > EMA50)")
                if price > ema20: score += 10
                if analysis.get('macd', 0) > analysis.get('macd_signal', 0): 
                    score += 15
                    reasons.append("MACD Bullish Cross")
            else:
                score -= 25
                reasons.append("Downtrend (EMA20 < EMA50)")
                if price < ema20: score -= 10
                if analysis.get('macd', 0) < analysis.get('macd_signal', 0): 
                    score -= 15
                    reasons.append("MACD Bearish Cross")
        else:
            # Mean Reversion
            if analysis.get('rsi', 50) < 30: 
                score += 20
                reasons.append(f"RSI Oversold ({analysis.get('rsi'):.0f})")
            if price < lower: 
                score += 15
            if analysis.get('rsi', 50) > 70: 
                score -= 20
                reasons.append(f"RSI Overbought ({analysis.get('rsi'):.0f})")
            if price > upper: 
                score -= 15

        # --- SENTIMENT ---
        if sentiment_score > 0.2: 
            score += 10
            reasons.append("Sentiment Positive")
        elif sentiment_score < -0.2: 
            score -= 10
            reasons.append("Sentiment Negative")
            
        final_score = min(100, max(-100, score))
        
        action = "HOLD"
        if final_score >= 60: action = "STRONG BUY"
        elif final_score >= 25: action = "BUY"
        elif final_score <= -60: action = "STRONG SELL"
        elif final_score <= -25: action = "SELL"
            
        return {
            "action": action,
            "score": final_score,
            "regime": regime,
            "sentiment_contribution": sentiment_score * 40,
            "reasons": reasons
        }