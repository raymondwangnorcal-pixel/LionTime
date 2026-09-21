#!/usr/bin/env python3
"""Check that the outreach sender mailbox can send (SMTP) and read (IMAP).

Reads credentials from the environment so no secret is written to the repo:

    export OUTREACH_USER="info@gaplesslabs.com"
    export OUTREACH_APP_PW="xxxxxxxxxxxxxxxx"   # 16-char app password, no spaces
    python3 scripts/check_mailbox_access.py

Gate 5 of docs/ad-sales-outreach-plan.md: the sender needs SMTP to send and
IMAP to read replies, bounces and opt-outs. Sending is what makes an opt-out
honored, so IMAP failing is as blocking as SMTP failing. This script sends no
mail; it only authenticates.
"""

import imaplib
import os
import smtplib
import sys

USER = os.environ.get("OUTREACH_USER", "info@gaplesslabs.com")
APP_PW = (os.environ.get("OUTREACH_APP_PW") or "").replace(" ", "")

if not APP_PW:
    sys.exit("OUTREACH_APP_PW is not set. Export it first; see the docstring.")

ok = True

try:
    s = smtplib.SMTP("smtp.gmail.com", 587, timeout=20)
    s.starttls()
    s.login(USER, APP_PW)
    s.quit()
    print(f"SMTP  OK   {USER} can send through smtp.gmail.com:587")
except Exception as exc:
    ok = False
    print(f"SMTP  FAIL {type(exc).__name__}: {exc}")

try:
    m = imaplib.IMAP4_SSL("imap.gmail.com", timeout=20)
    m.login(USER, APP_PW)
    count = len(m.list()[1])
    m.logout()
    print(f"IMAP  OK   {USER} can read the mailbox ({count} folders)")
except Exception as exc:
    ok = False
    print(f"IMAP  FAIL {type(exc).__name__}: {exc}")

print("\nBoth OK — mailbox access is ready." if ok else
      "\nSomething failed. 535 usually means a wrong password or app passwords "
      "are off; an IMAP error usually means IMAP is disabled in Admin under "
      "Apps > Google Workspace > Gmail > End User Access.")
sys.exit(0 if ok else 1)
