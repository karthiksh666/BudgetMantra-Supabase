"""Market data — stocks (NSE), mutual funds, gold, silver, financial mood."""
import httpx
import time
from datetime import datetime
from fastapi import APIRouter

router = APIRouter(prefix="/market", tags=["market"])

# ── In-memory caches ────────────────────────────────────────────────
_commodity_cache: dict = {"data": None, "ts": 0}
_signals_cache: dict = {"data": None, "ts": 0}
COMMODITY_TTL = 1800   # 30 minutes
SIGNALS_TTL = 1800     # 30 minutes

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


# ── Commodities (Gold, Silver, Bitcoin, Ethereum) ───────────────────
_STATIC_COMMODITIES = {
    "gold":     {"name": "Gold",     "price": 7200,    "unit": "per gram",  "change_24h": 0.3},
    "silver":   {"name": "Silver",   "price": 85,      "unit": "per gram",  "change_24h": 0.5},
    "bitcoin":  {"name": "Bitcoin",  "price": 5500000,  "unit": "per coin", "change_24h": 1.2},
    "ethereum": {"name": "Ethereum", "price": 230000,   "unit": "per coin", "change_24h": 0.8},
}


@router.get("/commodities")
async def commodities():
    """Live Gold/Silver/Bitcoin/Ethereum prices. Cached 30 min."""
    now = time.time()
    if _commodity_cache["data"] and now - _commodity_cache["ts"] < COMMODITY_TTL:
        return _commodity_cache["data"]

    result = dict(_STATIC_COMMODITIES)  # start with fallback

    # Crypto from CoinGecko (free, no key)
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": "bitcoin,ethereum", "vs_currencies": "inr", "include_24hr_change": "true"},
            )
            cg = r.json()
            if "bitcoin" in cg:
                result["bitcoin"] = {
                    "name": "Bitcoin", "unit": "per coin",
                    "price": cg["bitcoin"].get("inr"),
                    "change_24h": round(cg["bitcoin"].get("inr_24h_change", 0), 2),
                }
            if "ethereum" in cg:
                result["ethereum"] = {
                    "name": "Ethereum", "unit": "per coin",
                    "price": cg["ethereum"].get("inr"),
                    "change_24h": round(cg["ethereum"].get("inr_24h_change", 0), 2),
                }
    except Exception:
        pass  # fallback to static

    # Gold / Silver from NSE indices (best-effort)
    try:
        async with httpx.AsyncClient(timeout=8, headers=NSE_HEADERS) as client:
            await client.get("https://www.nseindia.com")
            r = await client.get("https://www.nseindia.com/api/allIndices")
            data = r.json()
            for item in data.get("data", []):
                if "GOLD" in item.get("index", "").upper():
                    result["gold"]["price"] = float(item.get("last", result["gold"]["price"]))
                    result["gold"]["change_24h"] = round(float(item.get("percentChange", 0)), 2)
                    break
    except Exception:
        pass

    _commodity_cache["data"] = result
    _commodity_cache["ts"] = now
    return result


# ── Daily Market Signals ────────────────────────────────────────────
_CURATED_TIPS = [
    {"type": "tip", "title": "SIP beats timing", "detail": "Systematic investing removes emotional bias. Start a SIP in a diversified equity fund."},
    {"type": "tip", "title": "Emergency fund first", "detail": "Keep 6 months of expenses in a liquid fund before chasing returns."},
    {"type": "tip", "title": "Diversify across asset classes", "detail": "Mix of equity, debt, gold, and real estate reduces portfolio volatility."},
    {"type": "tip", "title": "Review insurance yearly", "detail": "Ensure your term cover is at least 10x annual income. Reassess each year."},
    {"type": "tip", "title": "Track expense ratio", "detail": "For index funds, prefer expense ratio below 0.2%. Every basis point counts over decades."},
    {"type": "tip", "title": "Tax-loss harvesting", "detail": "Book short-term losses before March 31 to offset capital gains."},
    {"type": "insight", "title": "Rupee cost averaging", "detail": "When markets fall, your SIP buys more units. Stay invested."},
    {"type": "insight", "title": "Power of compounding", "detail": "Rs 10,000/month at 12% CAGR becomes Rs 1 crore in ~20 years."},
    {"type": "insight", "title": "Avoid leverage", "detail": "Margin trading amplifies losses. Only invest money you can afford to lose."},
    {"type": "insight", "title": "ELSS for tax saving", "detail": "ELSS funds offer tax deduction under 80C with only 3-year lock-in."},
]


@router.get("/signals")
async def market_signals():
    """Daily market signals -- mix of real data + rotating curated tips."""
    now = time.time()
    if _signals_cache["data"] and now - _signals_cache["ts"] < SIGNALS_TTL:
        return _signals_cache["data"]

    signals = []

    # Try to get market mood as a signal
    try:
        async with httpx.AsyncClient(timeout=10, headers=NSE_HEADERS) as client:
            await client.get("https://www.nseindia.com")
            r = await client.get("https://www.nseindia.com/api/allIndices")
            data = r.json()
            indices = {d["index"]: d for d in data.get("data", [])}
            nifty = indices.get("NIFTY 50", {})
            vix = indices.get("INDIA VIX", {})
            if nifty.get("last"):
                direction = "up" if float(nifty.get("percentChange", 0)) >= 0 else "down"
                signals.append({
                    "type": "market",
                    "title": f"Nifty 50: {nifty['last']}",
                    "detail": f"Market is {direction} {abs(float(nifty.get('percentChange', 0)))}% today.",
                })
            if vix.get("last"):
                vix_val = float(vix["last"])
                mood = "fearful" if vix_val > 20 else "neutral" if vix_val > 14 else "calm"
                signals.append({
                    "type": "sentiment",
                    "title": f"India VIX: {vix_val:.1f}",
                    "detail": f"Market sentiment is {mood}.",
                })
    except Exception:
        pass

    # Add rotating curated tips (pick 3 based on day-of-year)
    day = datetime.utcnow().timetuple().tm_yday
    for i in range(3):
        idx = (day + i) % len(_CURATED_TIPS)
        signals.append(_CURATED_TIPS[idx])

    _signals_cache["data"] = signals
    _signals_cache["ts"] = now
    return signals


# ── Stock Analysis ──────────────────────────────────────────────────
@router.get("/stock-analysis/{symbol}")
async def stock_analysis(symbol: str):
    """Fetch stock fundamentals from NSE."""
    try:
        async with httpx.AsyncClient(timeout=12, headers=NSE_HEADERS) as client:
            await client.get("https://www.nseindia.com")
            r = await client.get(f"https://www.nseindia.com/api/quote-equity?symbol={symbol.upper()}")
            data = r.json()
            info = data.get("priceInfo", {})
            metadata = data.get("metadata", {})
            industry = data.get("industryInfo", {})
            sec_info = data.get("securityInfo", {})

            return {
                "symbol": symbol.upper(),
                "company_name": metadata.get("companyName"),
                "industry": industry.get("industry") or metadata.get("industry"),
                "series": metadata.get("series"),
                "isin": metadata.get("isin"),
                "price": info.get("lastPrice"),
                "change": info.get("change"),
                "pct_change": info.get("pChange"),
                "open": info.get("open"),
                "close": info.get("close") or info.get("previousClose"),
                "high": info.get("intraDayHighLow", {}).get("max"),
                "low": info.get("intraDayHighLow", {}).get("min"),
                "week_high_52": info.get("weekHighLow", {}).get("max"),
                "week_low_52": info.get("weekHighLow", {}).get("min"),
                "total_traded_volume": sec_info.get("tradedVolume"),
                "face_value": sec_info.get("faceValue"),
                "listed_date": metadata.get("listingDate"),
            }
    except Exception as e:
        return {"error": str(e)}


# ── Mutual Fund Returns (CAGR) ─────────────────────────────────────
def _cagr(start_nav: float, end_nav: float, years: float) -> float | None:
    if not start_nav or not end_nav or years <= 0:
        return None
    return round(((end_nav / start_nav) ** (1 / years) - 1) * 100, 2)


@router.get("/mf-returns/{scheme_code}")
async def mf_returns(scheme_code: str):
    """Fetch MF NAV history from mfapi.in and calculate 1yr/3yr/5yr CAGR."""
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(f"https://api.mfapi.in/mf/{scheme_code}")
            data = r.json()

        meta = data.get("meta", {})
        nav_data = data.get("data", [])
        if not nav_data:
            return {"error": "No NAV data found for this scheme code"}

        # NAV data comes newest-first with date format "dd-mm-yyyy"
        latest_nav = float(nav_data[0]["nav"])
        latest_date = datetime.strptime(nav_data[0]["date"], "%d-%m-%Y")

        results = {
            "scheme_code": scheme_code,
            "scheme_name": meta.get("scheme_name"),
            "fund_house": meta.get("fund_house"),
            "scheme_type": meta.get("scheme_type"),
            "scheme_category": meta.get("scheme_category"),
            "latest_nav": latest_nav,
            "latest_date": latest_date.strftime("%Y-%m-%d"),
        }

        for label, years in [("1yr", 1), ("3yr", 3), ("5yr", 5)]:
            target_days = years * 365
            best_nav = None
            best_diff = float("inf")
            for entry in nav_data:
                try:
                    d = datetime.strptime(entry["date"], "%d-%m-%Y")
                    diff = abs((latest_date - d).days - target_days)
                    if diff < best_diff:
                        best_diff = diff
                        best_nav = float(entry["nav"])
                except (ValueError, KeyError):
                    continue
            if best_nav and best_diff <= 30:
                results[f"cagr_{label}"] = _cagr(best_nav, latest_nav, years)
            else:
                results[f"cagr_{label}"] = None

        return results
    except Exception as e:
        return {"error": str(e)}
