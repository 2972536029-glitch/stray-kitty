#!/usr/bin/env python
"""一键应用指定 JSON 里的全部 Monitor(创建或更新,幂等)。

用法:
  export DD_API_KEY=xxx DD_APP_KEY=yyy DD_SITE=datadoghq.com
  python monitors/apply-monitors.py

行为说明:
- 先按名字查已有 monitor:存在则 PUT 更新,不存在则 POST 创建(可从 git 复现告警配置)
- 个别 monitor 失败只警告不中断,失败项列在最后
- Slack 通知:在 monitor 的 message 里 @ 提 Slack 频道(需先在
  Datadog UI → Integrations → Slack 连接频道,一次性手工步骤)

为什么是 Python 不是 bash+jq:团队机器(Windows)默认没有 jq;Python 标准库即可。
(移植自旅行牛牛项目同款脚本,行为一致。)
"""
import json
import argparse
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
parser = argparse.ArgumentParser(description="按名称创建或更新 Datadog Monitor（读取进程环境变量，不自动加载 .env）")
parser.add_argument("definitions", nargs="?", default=os.path.join(HERE, "monitors.json"),
                    help="Monitor JSON 文件；默认脚本同目录的 monitors.json，相对路径按当前工作目录解析")
args = parser.parse_args()

DD_SITE = os.environ.get("DD_SITE", "datadoghq.com")
API = f"https://api.{DD_SITE}/api/v1"
DD_API_KEY = os.environ.get("DD_API_KEY")
DD_APP_KEY = os.environ.get("DD_APP_KEY")
if not DD_API_KEY or not DD_APP_KEY:
    sys.exit("需要环境变量 DD_API_KEY / DD_APP_KEY")

with open(args.definitions, encoding="utf-8-sig") as definitions_file:
    MONITORS = json.load(definitions_file)


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
for m in MONITORS:
    name = m["name"]
    qname = urllib.parse.quote(name)
    _, found = api("GET", f"/monitor?name={qname}")
    existing = found[0]["id"] if isinstance(found, list) and found else None

    if existing:
        body = dict(m, id=existing)
        code, resp = api("PUT", f"/monitor/{existing}", body)
        label = f"updated #{existing}"
    else:
        code, resp = api("POST", "/monitor", m)
        label = "created"

    if code == 200:
        print(f"✅ {label}: {name}")
    else:
        print(f"⚠️  {code}: {name} — {json.dumps(resp)[:160]}")
        print(f"   (该条定义保留在 {args.definitions};常见原因:org 未启用对应 monitor 类型,可到 UI 创建)")
        failures.append(name)

print()
if failures:
    print(f"完成,但有 {len(failures)} 条需人工处理: {failures}")
else:
    print("全部 monitor 已从 git 复现。")
