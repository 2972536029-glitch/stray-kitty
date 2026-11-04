#!/usr/bin/env python
"""按 monitors/ 定义重放两条公网拨测(幂等,按名称 upsert)。

用法:
  export DD_API_KEY=xxx DD_APP_KEY=yyy
  export DD_SITE=us5.datadoghq.com   # 站点必须与目标 org 一致(见 OBSERVABILITY.md §站点纪律)
  python monitors/apply-synthetics.py

与 apply-monitors.py 同一套纪律:定义进 git,org 可复现。
"""
import json
import os
import sys
import urllib.error
import urllib.request

DD_SITE = os.environ.get("DD_SITE", "us5.datadoghq.com")
API = f"https://api.{DD_SITE}/api/v1"
DD_API_KEY = os.environ.get("DD_API_KEY")
DD_APP_KEY = os.environ.get("DD_APP_KEY")
if not DD_API_KEY or not DD_APP_KEY:
    sys.exit("需要环境变量 DD_API_KEY / DD_APP_KEY")
HEADERS = {"DD-API-KEY": DD_API_KEY, "DD-APPLICATION-KEY": DD_APP_KEY,
           "Content-Type": "application/json"}

LOCATIONS = ["aws:ap-northeast-1", "aws:ap-northeast-2", "gcp:asia-northeast1"]

TESTS = [
    {
        "name": "[小猫回家记] 公网入口 /healthz 拨测",
        "type": "api",
        "subtype": "http",
        "message": ("试玩环境公网入口拨测失败——LB/nginx/域名/DNS 任一环节故障都会触发。"
                    "集群内监控全绿但本拨测失败 = 公网链路故障,查 LB Service 与 nginx pod。"),
        "locations": LOCATIONS,
        "status": "live",
        "config": {"request": {"method": "GET", "url": "https://starry-kitty.duckdns.org/healthz"},
                   "assertions": [{"type": "statusCode", "operator": "is", "target": 200}]},
        "options": {"tick_every": 300, "retry": {"count": 1, "interval": 300},
                    "monitor_options": {"renotify_interval": 0}},
    },
    {
        "name": "[小猫回家记] 公网 /api/payment/config 拨测",
        "type": "api",
        "subtype": "http",
        "message": "公网支付配置端点不可达。集群内监控全绿但本拨测失败 = 公网链路或 game 服务故障。",
        "locations": LOCATIONS,
        "status": "live",
        "config": {"request": {"method": "GET", "url": "https://starry-kitty.duckdns.org/api/payment/config"},
                   "assertions": [{"type": "statusCode", "operator": "is", "target": 200}]},
        "options": {"tick_every": 300, "retry": {"count": 1, "interval": 300},
                    "monitor_options": {"renotify_interval": 0}},
    },
]


def api(method, path, body=None):
    headers = dict(HEADERS)
    if body is None:
        headers.pop("Content-Type", None)  # GET 不带 Content-Type(实测带上会拿到空响应体)
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            try:
                return r.status, (json.loads(raw) if raw else {})
            except json.JSONDecodeError:
                sys.exit(f"非 JSON 响应 status={r.status} body={raw[:200]!r}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main():
    code, existing = api("GET", "/synthetics/tests")
    if code != 200:
        sys.exit(f"list tests failed: {code} {existing}")
    by_name = {t["name"]: t.get("public_id") for t in existing.get("tests", [])}

    for test in TESTS:
        pid = by_name.get(test["name"])
        if pid:
            code, r = api("PUT", f"/synthetics/tests/{pid}", test)
            print(f"{'updated' if code == 200 else 'FAILED'} #{pid}: {test['name']} {r if code != 200 else ''}")
        else:
            code, r = api("POST", "/synthetics/tests", test)
            new_id = r.get("public_id") if code == 200 else r
            print(f"{'created #' + str(new_id) if code == 200 else 'FAILED ' + str(code)}: {test['name']} {new_id or ''}")


if __name__ == "__main__":
    main()
