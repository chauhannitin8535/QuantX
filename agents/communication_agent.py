class CommunicationAgent:
    def explain(self, t, analysis, decision):
        action = decision['action']
        score = decision['score']
        regime = decision.get('regime', 'UNKNOWN')
        reasons = decision.get('reasons', [])
        
        price = analysis.get('price', 0)
        rsi = analysis.get('rsi', 50)
        rvol = analysis.get('rvol', 1.0)
        
        # Prediction
        forecast = analysis.get('forecast_3d', price)
        f_high = analysis.get('forecast_range_high', price)
        f_low = analysis.get('forecast_range_low', price)
        pct_change = ((forecast - price) / price) * 100 if price > 0 else 0
        direction = "UP" if pct_change > 0 else "DOWN"
        
        # Format metrics
        vol_str = f"{rvol:.1f}x Avg" if rvol > 1.2 else "Normal"
        reason_str = "\n".join([f"• {r}" for r in reasons[-6:]]) 
        
        return (f"\nQUANT.OS INTELLIGENCE REPORT: {t}\n"
                f"{'-'*40}\n"
                f"ACTION  : {action} (Score: {score})\n"
                f"STRATEGY: {regime}\n"
                f"{'-'*40}\n"
                f"AI PREDICTION (3-Day):\n"
                f" • Target: {forecast:.2f} ({direction} {abs(pct_change):.2f}%)\n"
                f" • Range : {f_low:.2f} - {f_high:.2f}\n"
                f"{'-'*40}\n"
                f"TECHNICALS:\n"
                f" • Price: {price:.2f} | RSI: {rsi:.1f} | Vol: {vol_str}\n"
                f" • Trend: {'UP' if analysis.get('ema20',0)>analysis.get('ema50',0) else 'DOWN'}\n"
                f"{'-'*40}\n"
                f"KEY DRIVERS:\n{reason_str}\n"
                f"{'='*40}")
