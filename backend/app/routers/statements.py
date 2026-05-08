from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
import threading
import io
import uuid
import re
from datetime import datetime, date as _date
from app.auth import get_current_user
from app.database import get_admin_db

router = APIRouter(tags=["statements"])

# ── In-memory job store ──────────────────────────────────────────────────────
_pdf_parse_jobs: dict = {}


# ── PDF text parser ──────────────────────────────────────────────────────────

def _clean_merchant(raw: str) -> str:
    """Strip noise phrases and trailing artefacts from a merchant/description string."""
    name = raw.strip()
    # Remove common prefixes
    for prefix in ("Paid to", "Sent to", "Transfer to", "Payment to", "UPI-"):
        if name.lower().startswith(prefix.lower()):
            name = name[len(prefix):].strip()
    # Remove DEBIT / CREDIT label suffixes
    name = re.sub(r'\s+(DEBIT|CREDIT)\b.*$', '', name, flags=re.IGNORECASE).strip()
    # Remove trailing ₹NNN or Rs NNN amounts
    name = re.sub(r'\s*(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?\s*$', '', name, flags=re.IGNORECASE).strip()
    return name or raw.strip()


def _parse_pdf_text(text: str) -> list[dict]:
    """
    Extract transactions from raw PDF text.

    Rules:
    - Date: DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD
    - Amount: MUST have ₹ / Rs. / INR prefix — bare numbers are ignored
    - Dedup by (date, amount, merchant) fingerprint
    """
    date_pattern = re.compile(
        r'(\d{2}[/\-]\d{2}[/\-]\d{4}|\d{4}-\d{2}-\d{2})'
    )
    amount_pattern = re.compile(
        r'(?:₹|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)',
        re.UNICODE,
    )
    debit_pattern = re.compile(r'\b(debit|dr|paid|sent|withdrawal|purchase)\b', re.IGNORECASE)
    credit_pattern = re.compile(r'\b(credit|cr|received|refund|salary|cashback)\b', re.IGNORECASE)

    lines = text.splitlines()
    results: list[dict] = []
    seen: set[str] = set()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        date_match = date_pattern.search(line)
        amount_match = amount_pattern.search(line)
        if not date_match or not amount_match:
            continue

        raw_date = date_match.group(1)
        # Normalise to YYYY-MM-DD
        try:
            if re.match(r'\d{4}-\d{2}-\d{2}', raw_date):
                tx_date = raw_date
            else:
                sep = "/" if "/" in raw_date else "-"
                parts = raw_date.split(sep)
                tx_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
            # Validate
            _date.fromisoformat(tx_date)
        except (ValueError, IndexError):
            continue

        raw_amount = amount_match.group(1).replace(",", "")
        try:
            amount = float(raw_amount)
        except ValueError:
            continue

        # Determine transaction type from line keywords
        is_credit = bool(credit_pattern.search(line))
        is_debit = bool(debit_pattern.search(line))
        if is_credit and not is_debit:
            tx_type = "income"
        else:
            tx_type = "expense"

        # Extract merchant: text between the date match and the amount match,
        # or whatever precedes/follows them.
        between_start = date_match.end()
        between_end = amount_match.start()
        if between_start < between_end:
            raw_merchant = line[between_start:between_end]
        else:
            # amount appeared before date — take text after amount
            raw_merchant = line[amount_match.end():]
        merchant = _clean_merchant(raw_merchant) or "Unknown"

        # Fingerprint for dedup
        fingerprint = f"{tx_date}|{amount}|{merchant.lower()}"
        if fingerprint in seen:
            continue
        seen.add(fingerprint)

        # Suggested category heuristic (very simple keyword mapping)
        merchant_lower = merchant.lower()
        line_lower = line.lower()
        if any(k in merchant_lower or k in line_lower for k in ("swiggy", "zomato", "restaurant", "food", "cafe")):
            suggested_category = "Food & Dining"
        elif any(k in merchant_lower or k in line_lower for k in ("uber", "ola", "rapido", "metro", "petrol", "fuel")):
            suggested_category = "Transport"
        elif any(k in merchant_lower or k in line_lower for k in ("amazon", "flipkart", "myntra", "shop", "mall")):
            suggested_category = "Shopping"
        elif any(k in merchant_lower or k in line_lower for k in ("netflix", "hotstar", "spotify", "prime")):
            suggested_category = "Entertainment"
        elif any(k in merchant_lower or k in line_lower for k in ("salary", "payroll", "income")):
            suggested_category = "Salary"
        elif tx_type == "income":
            suggested_category = "Income"
        else:
            suggested_category = "Uncategorised"

        results.append({
            "id": str(uuid.uuid4()),
            "merchant": merchant,
            "amount": amount,
            "date": tx_date,
            "type": tx_type,
            "vpa": None,
            "suggested_category": suggested_category,
        })

    return results


# ── Background parse worker ──────────────────────────────────────────────────

def _run_pdf_parse(job_id: str, pdf_bytes: bytes, password: Optional[str]):
    _pdf_parse_jobs[job_id]["status"] = "processing"
    try:
        import pdfplumber

        buf = io.BytesIO(pdf_bytes)
        open_kwargs = {"password": password} if password else {}

        with pdfplumber.open(buf, **open_kwargs) as pdf:
            full_text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )

        transactions = _parse_pdf_text(full_text)
        _pdf_parse_jobs[job_id]["transactions"] = transactions
        _pdf_parse_jobs[job_id]["status"] = "done"
    except Exception as exc:
        _pdf_parse_jobs[job_id]["status"] = "error"
        _pdf_parse_jobs[job_id]["error"] = str(exc)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/upi/parse-pdf")
async def parse_pdf_upload(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Upload a PDF bank statement and start a background parse job."""
    pdf_bytes = await file.read()
    job_id = str(uuid.uuid4())
    uid = current_user["id"]

    _pdf_parse_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "user_id": uid,
        "transactions": [],
        "error": None,
    }

    t = threading.Thread(
        target=_run_pdf_parse,
        args=(job_id, pdf_bytes, password),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id, "status": "pending"}


@router.post("/upi/parse-bulk")
async def parse_bulk_alias(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Alias of /upi/parse-pdf — same logic."""
    pdf_bytes = await file.read()
    job_id = str(uuid.uuid4())
    uid = current_user["id"]

    _pdf_parse_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "user_id": uid,
        "transactions": [],
        "error": None,
    }

    t = threading.Thread(
        target=_run_pdf_parse,
        args=(job_id, pdf_bytes, password),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id, "status": "pending"}


@router.get("/upi/parse-pdf/{job_id}")
async def poll_parse_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Poll the status of a PDF parse job."""
    job = _pdf_parse_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your job")
    return {
        "status": job["status"],
        "transactions": job["transactions"],
        "error": job["error"],
    }


@router.post("/upi/bulk-import")
async def bulk_import_transactions(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """
    Bulk-import a list of parsed transactions into the DB.

    Body: {transactions: [...], import_type: 'both'|'expenses'|'income'}
    Only transactions where selected=True are imported.
    Deduplicates by (user_id, date, amount, description).
    """
    supabase = get_admin_db()
    uid = current_user["id"]
    import_type = body.get("import_type", "both")
    raw_transactions: list[dict] = body.get("transactions", [])

    selected = [t for t in raw_transactions if t.get("selected", False)]

    imported = 0
    duplicates = 0

    for tx in selected:
        tx_type = tx.get("type", "expense")
        amount = float(tx.get("amount", 0))
        tx_date = str(tx.get("date", ""))
        merchant = str(tx.get("merchant", "Unknown"))

        if tx_type == "expense" and import_type in ("both", "expenses"):
            # Dedup check
            existing = (
                supabase.table("transactions")
                .select("id")
                .eq("user_id", uid)
                .eq("date", tx_date)
                .eq("amount", amount)
                .eq("description", merchant)
                .execute()
            )
            if existing.data:
                duplicates += 1
                continue

            doc = {
                "id": tx.get("id") or str(uuid.uuid4()),
                "user_id": uid,
                "description": merchant,
                "amount": amount,
                "date": tx_date,
                "type": "expense",
                "category": "Uncategorised",
                "source": "statement_import",
                "created_at": datetime.utcnow().isoformat(),
            }
            try:
                supabase.table("transactions").insert(doc).execute()
                imported += 1
            except Exception:
                duplicates += 1

        elif tx_type == "income" and import_type in ("both", "income"):
            # Dedup check
            existing = (
                supabase.table("income_entries")
                .select("id")
                .eq("user_id", uid)
                .eq("date", tx_date)
                .eq("amount", amount)
                .eq("source", merchant)
                .execute()
            )
            if existing.data:
                duplicates += 1
                continue

            doc = {
                "id": tx.get("id") or str(uuid.uuid4()),
                "user_id": uid,
                "source": merchant,
                "amount": amount,
                "date": tx_date,
                "type": "other",
                "source_type": "import",
                "created_at": datetime.utcnow().isoformat(),
            }
            try:
                supabase.table("income_entries").insert(doc).execute()
                imported += 1
            except Exception:
                duplicates += 1

    return {
        "imported": imported,
        "duplicates": duplicates,
        "import_type": import_type,
    }


@router.post("/upi/import")
async def import_alias(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Alias of /upi/bulk-import — same logic."""
    return await bulk_import_transactions(body, current_user)


@router.get("/statements/history")
async def get_statement_history(current_user: dict = Depends(get_current_user)):
    """Return recent PDF import jobs for this user (from in-memory store)."""
    uid = current_user["id"]
    user_jobs = [
        {
            "job_id": jid,
            "status": job["status"],
            "transaction_count": len(job.get("transactions", [])),
            "error": job.get("error"),
        }
        for jid, job in _pdf_parse_jobs.items()
        if job.get("user_id") == uid
    ]
    # Newest first — jobs are stored in insertion order (Python 3.7+)
    user_jobs.reverse()
    return {"jobs": user_jobs}
