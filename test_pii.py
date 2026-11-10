import sys
sys.path.insert(0, r"D:\myportfolio-acl-recovery\cybergarde-backend")
from pii_scanner import scan_text

# Test Saudi ID (9 digits)
r = scan_text("12345678901")
print("Saudi ID:", r.detected, r.matches, "->", r.redacted_text)

# Test Egyptian ID (14 digits) 
r = scan_text("29010101234567")
print("Egypt ID:", r.detected, r.matches, "->", r.redacted_text)

# Test IBAN
r = scan_text("SA0380000000608010167519")
print("IBAN:", r.detected, r.matches, "->", r.redacted_text)

# Test Gulf phone
r = scan_text("0501234567")
print("Gulf Phone:", r.detected, r.matches, "->", r.redacted_text)

# Test Egypt phone
r = scan_text("01234567890")
print("Egypt Phone:", r.detected, r.matches, "->", r.redacted_text)

# Test clean text
r = scan_text("regular text no sensitive data")
print("Clean text:", r.detected, r.matches, "->", r.redacted_text)