"""Business observability v1 payload validation and idempotent Datadog deployment.

Only the standard library is required. Importing this module performs no I/O.
Local checks validate the supported payload subset, not Datadog's query engine.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
MANAGED = "managed-by:stray-kitty-biz-obs"
MARKER = "[managed-by:stray-kitty-biz-obs;definition:{key}]"
REF = re.compile(r"\$\{([a-z][a-z0-9-]+)\}")


class DefinitionError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise DefinitionError(message)


def load_bundle(path=HERE / "business-observability.json"):
    with Path(path).open(encoding="utf-8-sig") as stream:
        bundle = json.load(stream)
    validate_bundle(bundle)
    return bundle


def metric_queries(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "query" and isinstance(item, str) and "kitty." in item:
                yield item
            else:
                yield from metric_queries(item)
    elif isinstance(value, list):
        for item in value:
            yield from metric_queries(item)


def validate_metric_query(query):
    # Policy checks deliberately fail closed on accidental IDs or QA/dev traffic.
    require("!qa:true" in query, "Metric queries must exclude QA with !qa:true")
    require("env:preview" in query, "Metric queries must isolate env:preview")
    require("player_id" not in query and "session_id" not in query,
            "Player/session identifiers must never be metric dimensions")
    for scope in re.findall(r"kitty\.[a-zA-Z0-9_.]+\{([^}]+)\}", query):
        require("!qa:true" in scope and "env:preview" in scope,
                "Every metric operand must independently filter QA and environment")


def validate_dashboard(payload, key):
    require(set(payload) <= {"title", "description", "layout_type", "widgets"},
            f"Unsupported dashboard field: {key}")
    require(payload.get("layout_type") == "ordered", "Dashboards use ordered layout")
    require(MARKER.format(key=key) in payload.get("description", ""),
            f"Dashboard ownership marker missing: {key}")
    require(payload.get("widgets"), f"Empty dashboard: {key}")
    for widget in payload["widgets"]:
        definition = widget["definition"]
        kind = definition["type"]
        require(kind in {"note", "timeseries", "query_value", "toplist", "sunburst",
                         "manage_status", "log_stream"}, f"Unsupported widget: {kind}")
        if kind == "note":
            require(bool(definition.get("content")), "Note content is required")
        elif kind == "manage_status":
            require("business-module:" in definition.get("query", ""),
                    "Monitor summaries must be scoped to their module")
        elif kind == "log_stream":
            query = definition.get("query", "")
            require("@session_id:*" in query and "env:preview" in query and "-@qa:true" in query,
                    "Session logs must filter environment and QA")
        else:
            require(bool(definition.get("requests")), f"Empty request: {kind}")
            for request in definition["requests"]:
                expected = "timeseries" if kind == "timeseries" else "scalar"
                require(request.get("response_format") == expected,
                        f"Unexpected response_format for {kind}")
                names = {query["name"] for query in request.get("queries", [])}
                require(len(names) == len(request.get("queries", [])) and names,
                        "Query names must be present and unique")
                for query in request["queries"]:
                    require(query["data_source"] == "metrics", "Unsupported query data_source")
                    require(query.get("aggregator") == "sum", "Counts must aggregate with sum")
                    validate_metric_query(query["query"])
                for formula in request.get("formulas", []):
                    variables = set(re.findall(r"[A-Za-z_][A-Za-z_0-9]*", formula["formula"]))
                    require(variables <= names, "Formula references unknown metric queries")


def validate_bundle(bundle):
    require(bundle.get("version") == 1, "Unsupported bundle version")
    require(bundle.get("site") == "us5.datadoghq.com", "This project belongs to Datadog US5")
    ids = set()
    monitor_ids = set()
    for spec in bundle.get("monitors", []):
        key, payload = spec["id"], spec["payload"]
        require(key not in ids, f"Duplicate definition ID: {key}")
        ids.add(key)
        require(MANAGED in payload.get("tags", []) and f"definition:{key}" in payload["tags"],
                f"Monitor ownership tags missing: {key}")
        require("team:stray-kitty" in payload["tags"] and "service:kitty-api" in payload["tags"],
                f"Monitor scope missing: {key}")
        require(payload.get("options", {}).get("notify_no_data") is False,
                f"No-data notifications must be disabled: {key}")
        query = payload["query"]
        if payload["type"] == "composite":
            refs = REF.findall(query)
            require(len(refs) == 2 and set(refs) <= monitor_ids,
                    f"Composite requires two earlier non-composite monitors: {key}")
            require(REF.sub("1", query) == "1 && 1", "Only AND composite queries are supported")
            require("thresholds" not in payload["options"], "Composite has no metric threshold")
        else:
            require(payload["type"] == "query alert", f"Unsupported monitor type: {key}")
            require("&&" not in query and not REF.findall(query), "Metric alerts cannot contain AND")
            require(query.startswith("sum(last_"), "Count monitors require sum time aggregation")
            validate_metric_query(query)
            if key == "story-no-progress":
                require("!node:prologue_1" in query,
                        "Story progress must exclude the session-created prologue_1 seed")
            threshold = re.search(r"(?:>=|<=|>|<)\s*([0-9.]+)$", query)
            require(threshold is not None, f"Missing numeric threshold: {key}")
            require(float(threshold[1]) == payload["options"]["thresholds"]["critical"],
                    f"Query and option thresholds differ: {key}")
            monitor_ids.add(key)
        if "role:component" in payload["tags"]:
            require("@" not in payload["message"], "Component monitors must not send notifications")
    for spec in bundle.get("dashboards", []):
        key = spec["id"]
        require(key not in ids, f"Duplicate definition ID: {key}")
        ids.add(key)
        validate_dashboard(spec["payload"], key)
    require(len(bundle.get("dashboards", [])) == 2, "Modules require two independent dashboards")
    for spec in bundle.get("pending_baselines", []):
        require(spec.get("status") == "pending_baseline" and spec.get("threshold") is None,
                "Unmeasured thresholds must stay pending and cannot be deployed")
        require("payload" not in spec, "Pending baselines must not contain deployable monitors")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, site, api_key, app_key):
        require(site == "us5.datadoghq.com", "Refusing non-US5 host for this project")
        require(bool(api_key) and bool(app_key), "DD_API_KEY and DD_APP_KEY are required for remote operations")
        self.base = f"https://api.{site}/api/v1"
        self.headers = {"DD-API-KEY": api_key, "DD-APPLICATION-KEY": app_key,
                        "Content-Type": "application/json"}
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, payload=None):
        require(path.startswith("/") and not path.startswith("//"), "API path must be relative")
        request = urllib.request.Request(self.base + path, method=method, headers=self.headers,
                                        data=None if payload is None else json.dumps(payload).encode())
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Deliberately omit request headers and arbitrary upstream response text.
            raise RuntimeError(f"Datadog {method} {path}: HTTP {error.code}; no further writes attempted") from None
        except urllib.error.URLError:
            raise RuntimeError(f"Datadog {method} {path}: network failure; rerun planning before retrying") from None


def inventory(client):
    monitors = []
    page = 0
    while True:
        found = client.request("GET", f"/monitor?page={page}&page_size=1000")
        require(isinstance(found, list), "Unexpected monitor inventory response")
        monitors.extend(found)
        if len(found) < 1000:
            break
        page += 1
    dashboards = client.request("GET", "/dashboard").get("dashboards")
    require(isinstance(dashboards, list), "Unexpected dashboard inventory response")
    return monitors, dashboards


def find_existing(spec, resources, kind):
    key, payload = spec["id"], spec["payload"]
    field = "name" if kind == "monitor" else "title"
    names = {payload[field], *spec.get("adopt_names", [])}
    marker = f"definition:{key}" if kind == "monitor" else MARKER.format(key=key)
    def owned(item):
        return (MANAGED in item.get("tags", []) and marker in item.get("tags", [])) if kind == "monitor" else marker in item.get("description", "")
    found = [item for item in resources if item.get(field) in names or owned(item)]
    require(len(found) <= 1, f"Ambiguous {kind} identity {key}; resolve duplicates before any write")
    if not found:
        return None
    item = found[0]
    require(owned(item) or item.get(field) in spec.get("adopt_names", []),
            f"Refusing to overwrite unowned {kind}: {payload[field]}")
    return item


def resolve_payload(spec, ids):
    payload = copy.deepcopy(spec["payload"])
    if payload.get("type") == "composite":
        refs = REF.findall(payload["query"])
        require(all(key in ids for key in refs), f"Composite dependencies are not deployed: {spec['id']}")
        payload["query"] = REF.sub(lambda match: str(ids[match[1]]), payload["query"])
    return payload


def deploy(bundle, client, apply=False):
    """Plan all identities and validate available queries before any resource mutation."""
    validate_bundle(bundle)
    monitors, dashboards = inventory(client)
    existing = {}
    # Dashboard inventory includes descriptions; use a details read if absent.
    for item in dashboards:
        if "description" not in item and any(item.get("title") == s["payload"]["title"] for s in bundle["dashboards"]):
            item.update(client.request("GET", f"/dashboard/{urllib.parse.quote(str(item['id']), safe='')}"))
    for kind, specs, resources in (("monitor", bundle["monitors"], monitors),
                                  ("dashboard", bundle["dashboards"], dashboards)):
        for spec in specs:
            existing[spec["id"]] = find_existing(spec, resources, kind)
    ids = {key: item["id"] for key, item in existing.items() if item is not None}
    for spec in bundle["monitors"]:
        if spec["payload"]["type"] != "composite" or all(key in ids for key in REF.findall(spec["payload"]["query"])):
            payload = resolve_payload(spec, ids)
            client.request("POST", "/monitor/validate", payload)
    result = []
    for kind, specs in (("monitor", bundle["monitors"]), ("dashboard", bundle["dashboards"])):
        for spec in specs:
            current = existing[spec["id"]]
            action = "update" if current else "create"
            record = {"kind": kind, "definition": spec["id"], "action": action,
                      "id": current["id"] if current else None}
            if apply:
                payload = resolve_payload(spec, ids)
                if kind == "monitor" and payload["type"] == "composite":
                    client.request("POST", "/monitor/validate", payload)
                path = f"/{kind}" + (f"/{urllib.parse.quote(str(current['id']), safe='')}" if current else "")
                response = client.request("PUT" if current else "POST", path, payload)
                require(response.get("id") is not None, f"Datadog returned no id for {spec['id']}; inspect before retry")
                ids[spec["id"]] = response["id"]
                record["id"] = response["id"]
            record["status"] = "applied" if apply else "planned"
            result.append(record)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check, plan or apply #18 business observability; default is offline check")
    parser.add_argument("--definitions", type=Path, default=HERE / "business-observability.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Offline policy/payload checks; no credentials or network")
    mode.add_argument("--plan", action="store_true", help="Read inventories and validate available monitor queries; no resource writes")
    mode.add_argument("--apply", action="store_true", help="Create/update the configured monitors and dashboards in US5")
    args = parser.parse_args(argv)
    try:
        bundle = load_bundle(args.definitions)
        if args.plan or args.apply:
            site = os.environ.get("DD_SITE", bundle["site"])
            client = Client(site, os.environ.get("DD_API_KEY"), os.environ.get("DD_APP_KEY"))
            records = deploy(bundle, client, apply=args.apply)
            print(json.dumps(records, ensure_ascii=False, indent=2))
            if args.plan:
                print("Composite queries with new dependencies validate after those IDs exist; dashboards have no validation endpoint.")
        else:
            print(f"Offline checks passed: {len(bundle['monitors'])} monitors, {len(bundle['dashboards'])} dashboards.")
        print(f"Pending baseline (not deployed): {', '.join(item['id'] for item in bundle['pending_baselines'])}")
        return 0
    except (DefinitionError, RuntimeError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
