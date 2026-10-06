"""Claim check for card.svg: fails if buyer-facing text drifts from what dot cleared."""
import pathlib, re, sys

svg = (pathlib.Path(__file__).resolve().parent / "card.svg").read_text()
text = " ".join(re.findall(r">([^<]+)<", svg)).replace("&amp;", "&")
problems = []
for must in ["SAMPLE DATA", "ILLUSTRATIVE DEMO", "synthetic values", "Not real customer data", "Tested in LibreOffice Calc"]:
    if must not in text:
        problems.append(f"missing required label: {must!r}")
for banned in ["Excel", "Google", "Sheets", "tax", "earn", "income guarantee", "Etsy"]:
    if re.search(rf"\b{banned}\b", text, re.I):
        problems.append(f"unverified/banned claim: {banned!r}")
amounts = set(re.findall(r"\$[\d,]+", text))
if amounts - {"$450"}:
    problems.append(f"unexpected amounts: {sorted(amounts - {'$450'})}")
if 'width="1200"' not in svg or 'height="630"' not in svg:
    problems.append("canvas is not 1200x630")
print("PASS" if not problems else "FAIL\n" + "\n".join(problems))
sys.exit(1 if problems else 0)
