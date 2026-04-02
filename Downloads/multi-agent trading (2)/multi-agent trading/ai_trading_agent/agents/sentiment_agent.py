from transformers import pipeline
import numpy as np

class SentimentAgent:
    def __init__(self):
        self.model = pipeline("sentiment-analysis", model="ProsusAI/finbert")

    def analyze(self, headlines):
        # headlines is a list of strings
        if not headlines:
            return 0.0 # Neutral if no news
        
        try:
            results = self.model(headlines)
            score = 0
            for r in results:
                s = r['score']
                if r['label'] == 'negative':
                    score -= s
                elif r['label'] == 'positive':
                    score += s
                # neutral adds 0
            
            # Normalize to -1 to 1
            final_score = score / len(headlines)
            return final_score
        except Exception as e:
            print(f"Sentiment Error: {e}")
            return 0.0
