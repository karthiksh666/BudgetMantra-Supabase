"""Market data — stocks (NSE), mutual funds, gold, silver, financial mood."""
import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/market", tags=["market"])

NSE_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json",
               "Referer": "https://www.nseindia.com"}


@router.get("/stock-price")
async def stock_price(symbol: str):
    try:
        async with httpx.AsyncClient(timeout=10, headers=NSE_HEADERS) as client:
            # Warm cookie
            await client.get("https://www.nseindia.com")
            r = await client.get(f"https://www.nseindia.com/api/quote-equity?symbol={symbol.upper()}")
            data = r.json()
            info = data.get("priceInfo", {})
            return {
                "symbol": symbol.upper(),
                "price": info.get("lastPrice"),
                "change": info.get("change"),
                "pct_change": info.get("pChange"),
                "high": info.get("intraDayHighLow", {}).get("max"),
                "low": info.get("intraDayHighLow", {}).get("min"),
            }
    except Exception as e:
        return {"error": str(e)}


@router.get("/stock-search")
async def stock_search(q: str):
    try:
        async with httpx.AsyncClient(timeout=8, headers=NSE_HEADERS) as client:
            await client.get("https://www.nseindia.com")
            r = await client.get(f"https://www.nseindia.com/api/search/autocomplete?q={q}")
            data = r.json()
            return data.get("symbols", [])
    except Exception as e:
        return {"error": str(e)}


@router.get("/mf-search")
async def mf_search(q: str):
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"https://api.mfapi.in/mf/search?q={q}")
            return r.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/mf-nav/{scheme_code}")
async def mf_nav(scheme_code: str):
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"https://api.mfapi.in/mf/{scheme_code}/latest")
            return r.json()
    except Exception as e:
        return {"error": str(e)}


@router.get("/mood")
async def market_mood():
    """India VIX proxy for market sentiment."""
    try:
        async with httpx.AsyncClient(timeout=10, headers=NSE_HEADERS) as client:
            await client.get("https://www.nseindia.com")
            r = await client.get("https://www.nseindia.com/api/allIndices")
            data = r.json()
            indices = {d["index"]: d for d in data.get("data", [])}
            nifty = indices.get("NIFTY 50", {})
            vix   = indices.get("INDIA VIX", {})
            vix_val = float(vix.get("last", 0) or 0)
            mood = "fearful" if vix_val > 20 else "neutral" if vix_val > 14 else "greedy"
            return {
                "nifty50": nifty.get("last"),
                "nifty_change_pct": nifty.get("percentChange"),
                "india_vix": vix_val,
                "mood": mood,
            }
    except Exception as e:
        return {"error": str(e)}
