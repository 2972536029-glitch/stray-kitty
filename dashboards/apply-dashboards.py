#!/usr/bin/env python
"""一键应用 dashboards/*.json 里的看板(按 title 幂等创建或更新)。

用法:
  export DD_API_KEY=xxx DD_APP_KEY=yyy DD_SITE=us5.datadoghq.com
  python dashboards/apply-dashboards.py

行为说明(与 monitors/apply-monitors.py 同款行为,可从 git 复现看板配置):
- 按 title 在 org 内查已有看板:存在则 PUT 更新,不存在则 POST 创建
- 默认应用脚本同目录全部 *.json(文件名即模块归属)
- 模块一/三统一由 monitors/business-observability.json 维护，使用
  monitors/apply-business-observability.py；勿在此目录重复定义同名看板。
"""
import glob
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DD_SITE = os.environ.get("DD_SITE", "datadoghq.com")
API = f"https://api.{DD_SITE}/api/v1"
DD_API_KEY = os.environ.get("DD_API_KEY")
DD_APP_KEY = os.environ.get("DD_APP_KEY")
if not DD_API_KEY or not DD_APP_KEY:
    sys.exit("需要环境变量 DD_API_KEY / DD_APP_KEY")


def api(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"DD-API-KEY": DD_API_KEY, "DD-APPLICATION-KEY": DD_APP_KEY,
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


failures = []
for path in sorted(glob.glob(os.path.join(HERE, "*.json"))):
    with open(path, encoding="utf-8-sig") as f:
        dash = json.load(f)
    title = dash["title"]
    qtitle = urllib.parse.quote(title)
    _, found = api("GET", f"/dashboard?name={qtitle}")
    existing = None
    if isinstance(found, dict) and found.get("dashboards"):
        for d in found["dashboards"]:
            if d.get("title") == title:
                existing = d["id"]
                break
    if existing:
        body = dict(dash, id=existing)
        code, resp = api("PUT", f"/dashboard/{existing}", body)
        label = f"updated #{existing}"
    else:
        code, resp = api("POST", "/dashboard", dash)
        label = "created"
    if code == 200:
        print(f"OK {label}: {title}")
    else:
        print(f"WARN {code}: {title} - {json.dumps(resp, ensure_ascii=False)[:160]}")
        failures.append(title)

print()
if failures:
    print(f"完成,但有 {len(failures)} 个需人工处理: {failures}")
else:
    print("全部看板已从 git 复现。")
