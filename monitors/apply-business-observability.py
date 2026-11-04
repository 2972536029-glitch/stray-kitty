#!/usr/bin/env python3
"""Entry point; default checks offline. --apply explicitly writes to Datadog US5."""
from biz_observability import main

if __name__ == "__main__":
    raise SystemExit(main())
