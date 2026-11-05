"""Offline regression tests for mutation safety and business-query semantics."""
import copy
import json
from pathlib import Path
import unittest

from biz_observability import (DefinitionError, MANAGED, deploy, find_existing, load_bundle,
                               validate_bundle, widget_definitions)


class FakeDatadog:
    def __init__(self, bundle, legacy=False):
        self.calls = []
        self.monitors = []
        self.dashboards = []
        self.next_id = 100
        self.reject_validation = False
        if legacy:
            for spec in bundle['monitors']:
                if spec.get('adopt_names'):
                    self.monitors.append({'id': self.next_id, 'name': spec['adopt_names'][0], 'tags': []})
                    self.next_id += 1

    def request(self, method, path, payload=None):
        self.calls.append((method, path, copy.deepcopy(payload)))
        if method == 'GET':
            if path.startswith('/monitor?'):
                return copy.deepcopy(self.monitors)
            if path == '/dashboard':
                return {'dashboards': copy.deepcopy(self.dashboards)}
            raise AssertionError((method, path))
        if path == '/monitor/validate':
            if self.reject_validation:
                raise RuntimeError('remote validation failed')
            if payload['type'] == 'composite':
                known = {m['id'] for m in self.monitors}
                self.assert_existing_ids(payload['query'], known)
            return {}
        kind, *tail = path.strip('/').split('/')
        items = self.monitors if kind == 'monitor' else self.dashboards
        item = copy.deepcopy(payload)
        if method == 'POST':
            item['id'] = self.next_id if kind == 'monitor' else f'dash-{self.next_id}'
            self.next_id += 1
            items.append(item)
        elif method == 'PUT':
            previous = next(value for value in items if str(value['id']) == tail[0])
            item['id'] = previous['id']
            items[items.index(previous)] = item
        else:
            raise AssertionError((method, path))
        return copy.deepcopy(item)

    @staticmethod
    def assert_existing_ids(query, known):
        assert all(int(part.strip()) in known for part in query.split('&&'))

    def writes(self):
        return [call for call in self.calls if call[0] != 'GET' and call[1] != '/monitor/validate']


class BusinessObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.bundle = load_bundle()

    def test_independent_publishers_cannot_recreate_or_overwrite_business_resources(self):
        root = Path(__file__).resolve().parent.parent
        titles = {spec['payload']['title'] for spec in self.bundle['dashboards']}
        for path in (root / 'dashboards').glob('*.json'):
            payload = json.loads(path.read_text(encoding='utf-8-sig'))
            self.assertNotIn(payload['title'], titles, f'Duplicate dashboard publisher: {path.name}')
        names = {spec['payload']['name'] for spec in self.bundle['monitors']}
        names.update(name for spec in self.bundle['monitors'] for name in spec.get('adopt_names', []))
        # A pending definition must not become deployable through the legacy
        # publisher, including any names recorded for later adoption.
        names.update(spec['name'] for spec in self.bundle['pending_baselines'])
        names.update(name for spec in self.bundle['pending_baselines'] for name in spec.get('adopt_names', []))
        legacy = json.loads((root / 'monitors' / 'monitors.json').read_text(encoding='utf-8-sig'))
        for monitor in legacy:
            self.assertNotIn(monitor['name'], names, 'Legacy publisher must not publish adopted or pending monitors')

    def test_deployment_adopts_legacy_monitors_and_reruns_without_duplicates(self):
        client = FakeDatadog(self.bundle, legacy=True)
        legacy_ids = {item['id'] for item in client.monitors}
        first = deploy(self.bundle, client, apply=True)
        self.assertEqual(len(client.monitors), 9)
        self.assertEqual(len(client.dashboards), 2)
        self.assertEqual({r['id'] for r in first if r['definition'] in {'payment-declined', 'advisor-fallback'}}, legacy_ids)
        client.calls.clear()
        second = deploy(self.bundle, client, apply=True)
        self.assertTrue(all(record['action'] == 'update' for record in second))
        self.assertFalse(any(method == 'POST' for method, _, _ in client.writes()))
        self.assertEqual(len(client.monitors), 9)
        self.assertEqual(len(client.dashboards), 2)

    def test_plan_never_mutates_resources_even_with_legacy_names(self):
        client = FakeDatadog(self.bundle, legacy=True)
        records = deploy(self.bundle, client)
        self.assertEqual(len(records), 11)
        self.assertFalse(client.writes())
        self.assertEqual(len(client.monitors), 2)

    def test_collision_on_last_dashboard_prevents_earlier_monitor_writes(self):
        client = FakeDatadog(self.bundle)
        client.dashboards = [{'id': 'someone-elses', 'title': self.bundle['dashboards'][-1]['payload']['title'], 'description': 'Manual dashboard'}]
        with self.assertRaisesRegex(DefinitionError, 'unowned'):
            deploy(self.bundle, client, apply=True)
        self.assertFalse(client.writes())

    def test_duplicate_old_and_new_identity_is_rejected_before_any_write(self):
        spec = next(s for s in self.bundle['monitors'] if s.get('adopt_names'))
        client = FakeDatadog(self.bundle, legacy=True)
        client.monitors.append(dict(copy.deepcopy(spec['payload']), id=999))
        with self.assertRaisesRegex(DefinitionError, 'Ambiguous'):
            deploy(self.bundle, client, apply=True)
        self.assertFalse(client.writes())

    def test_remote_query_validation_failure_aborts_before_resource_mutation(self):
        client = FakeDatadog(self.bundle)
        client.reject_validation = True
        with self.assertRaisesRegex(RuntimeError, 'validation failed'):
            deploy(self.bundle, client, apply=True)
        self.assertFalse(client.writes())

    def test_stall_monitors_use_ratio_form_and_reference_correct_signals(self):
        client = FakeDatadog(self.bundle)
        deploy(self.bundle, client, apply=True)
        # 本 org 对 composite monitor 的 PUT/POST 实测 400(2026-11-05),
        # 两条断流监控已改写为比率形态:结算或推进 ÷ 开局 < 0.5。
        composites = [item for item in client.monitors if item['type'] == 'composite']
        self.assertEqual(len(composites), 0, 'composite form was rejected by the org; must stay ratio-based')
        stalls = [m for m in client.monitors if '断流' in m['name'] or '没有结算' in m['name']]
        self.assertEqual(len(stalls), 2)
        for item in stalls:
            self.assertIn('< 0.5', item['query'])
        denominators = ' '.join(item['query'] for item in stalls)
        self.assertIn('sum:kitty.session.started', denominators)
        self.assertIn('sum:kitty.battle.start', denominators)
        # 组合语义被比率替代后,子监控无静默通知的纪律转为直接断言两条比率监控自身带通知
        for item in stalls:
            self.assertIn('@slack-bj_xsolla_school-hans-team', item['message'])

    def test_query_operand_cannot_accidentally_include_qa_or_other_environments(self):
        spec = next(s for s in self.bundle['monitors'] if s['id'] == 'payment-declined')
        spec['payload']['query'] = spec['payload']['query'].replace('env:preview,!qa:true', 'env:preview', 1)
        with self.assertRaisesRegex(DefinitionError, 'Every metric operand'):
            validate_bundle(self.bundle)

    def test_unmeasured_threshold_cannot_be_deployed(self):
        self.bundle['pending_baselines'][0]['threshold'] = 0.01
        with self.assertRaisesRegex(DefinitionError, 'pending'):
            validate_bundle(self.bundle)

    def test_story_stall_cannot_count_automatic_new_session_seed_as_progress(self):
        spec = next(s for s in self.bundle['monitors'] if s['id'] == 'story-no-progress')
        # Six new sessions emit six prologue_1 nodes even if ADVANCE_STORY is broken.
        # Including those seeds would make the volume and no-progress conditions
        # mutually exclusive. Reject that regression at definition-check time.
        spec['payload']['query'] = spec['payload']['query'].replace(',!node:prologue_1', '')
        with self.assertRaisesRegex(DefinitionError, 'session-created prologue_1'):
            validate_bundle(self.bundle)


    def test_financial_ratio_uses_actual_amount_not_event_count(self):
        dashboard = next(s for s in self.bundle['dashboards'] if s['id'] == 'economy-dashboard')
        matched = 0
        for definition in widget_definitions(dashboard['payload']['widgets']):
            if '金额收支比' in definition.get('title', '') or '实际货币收支数量' in definition.get('title', ''):
                matched += 1
                for request in definition['requests']:
                    self.assertTrue(all('kitty.economy.amount{' in q['query'] for q in request['queries']))
        self.assertEqual(matched, 3, 'The grouped amount and two ratio charts must all be checked')
        definition = next(d for d in widget_definitions(dashboard['payload']['widgets'])
                          if '金额收支比' in d.get('title', ''))
        query = definition['requests'][0]['queries'][0]
        query['query'] = query['query'].replace('kitty.economy.amount', 'kitty.economy.delta')
        with self.assertRaisesRegex(DefinitionError, 'Financial amounts'):
            validate_bundle(self.bundle)

    def test_grouped_dashboard_export_preserves_content_and_api_fields(self):
        for spec, count in zip(self.bundle['dashboards'], [19, 11]):
            payload = spec['payload']
            self.assertEqual(payload['reflow_type'], 'auto')
            self.assertIn('team:stray-kitty', payload['tags'])
            self.assertTrue(all(widget['definition']['type'] == 'group' for widget in payload['widgets']))
            self.assertTrue(all(isinstance(widget['id'], int) for widget in payload['widgets']))
            definitions = list(widget_definitions(payload['widgets']))
            self.assertEqual(sum(d['type'] != 'group' for d in definitions), count)
            self.assertEqual(len([d for d in definitions if d['type'] == 'manage_status']), 1)
            for group in (d for d in definitions if d['type'] == 'group'):
                self.assertTrue(all(isinstance(widget['id'], int) for widget in group['widgets']))
            self.assertNotIn('additionalProperties', json.dumps(payload))
            self.assertFalse({'id', 'restricted_roles', 'is_read_only', 'author_handle', 'created_at', 'url'} & payload.keys())
        story, economy = self.bundle['dashboards']
        self.assertIn('kitty.event.flag', json.dumps(story['payload']))
        self.assertNotIn('sack_cat_freed', json.dumps(economy['payload']))
        stream = next(d for d in widget_definitions(economy['payload']['widgets']) if d['type'] == 'list_stream')
        request = stream['requests'][0]
        self.assertEqual(request['query']['data_source'], 'logs_stream')
        self.assertEqual(request['response_format'], 'event_list')
        self.assertEqual([c['field'] for c in request['columns']].count('timestamp'), 1)

    def test_grouped_metric_queries_cannot_bypass_aggregation_or_traffic_filters(self):
        for kind, mutation, expected in [
            ('timeseries', lambda q: q.update(query=q['query'].replace(',!qa:true', '')), 'QA'),
            ('timeseries', lambda q: q.update(query=q['query'].replace('env:preview', 'env:dev')), 'preview'),
            ('timeseries', lambda q: q.update(query=q['query'].replace('sum:', 'avg:', 1)), 'sum and as_count'),
            ('timeseries', lambda q: q.update(query=q['query'].replace('.as_count()', '')), 'sum and as_count'),
            ('timeseries', lambda q: q.update(aggregator='avg'), 'aggregate with sum'),
            ('query_value', lambda q: q.pop('aggregator'), 'aggregate with sum'),
        ]:
            with self.subTest(kind=kind, expected=expected):
                bundle = copy.deepcopy(self.bundle)
                definition = next(d for d in widget_definitions(bundle['dashboards'][0]['payload']['widgets'])
                                  if d['type'] == kind)
                mutation(definition['requests'][0]['queries'][0])
                with self.assertRaisesRegex(DefinitionError, expected):
                    validate_bundle(bundle)
        # The exported timeseries queries intentionally omit this optional field.
        timeseries = [d for d in widget_definitions(self.bundle['dashboards'][0]['payload']['widgets'])
                      if d['type'] == 'timeseries']
        self.assertTrue(timeseries)
        self.assertTrue(all('aggregator' not in q for d in timeseries for r in d['requests'] for q in r['queries']))

    def test_grouped_session_logs_and_monitor_summaries_keep_their_scopes(self):
        for token in ['service:kitty-api', 'env:preview', '@player_id:*', '@session_id:*', '-@qa:true']:
            with self.subTest(log_filter=token):
                bundle = copy.deepcopy(self.bundle)
                stream = next(d for d in widget_definitions(bundle['dashboards'][1]['payload']['widgets'])
                              if d['type'] == 'list_stream')
                query = stream['requests'][0]['query']
                query['query_string'] = query['query_string'].replace(token, '')
                with self.assertRaisesRegex(DefinitionError, 'Session logs must filter'):
                    validate_bundle(bundle)
        for index, query in [(0, 'tag:business-module:1'), (0, 'tag:business-module:3 tag:role:alert'),
                             (1, 'tag:business-module:3 tag:role:component')]:
            with self.subTest(summary=query):
                bundle = copy.deepcopy(self.bundle)
                summary = next(d for d in widget_definitions(bundle['dashboards'][index]['payload']['widgets'])
                               if d['type'] == 'manage_status')
                summary['query'] = query
                with self.assertRaisesRegex(DefinitionError, 'module and role:alert'):
                    validate_bundle(bundle)

    def test_group_support_does_not_allow_unrecognized_or_permission_fields(self):
        for level, field in [('dashboard', 'restricted_roles'), ('group', 'additionalProperties'),
                             ('list_stream', 'responseFormat')]:
            with self.subTest(level=level, field=field):
                bundle = copy.deepcopy(self.bundle)
                payload = bundle['dashboards'][1]['payload']
                target = payload if level == 'dashboard' else next(
                    d for d in widget_definitions(payload['widgets']) if d['type'] == level)
                target[field] = []
                with self.assertRaisesRegex(DefinitionError, 'Unsupported'):
                    validate_bundle(bundle)

    def test_renamed_managed_monitor_uses_stable_definition_identity(self):
        spec = self.bundle['monitors'][0]
        renamed = dict(copy.deepcopy(spec['payload']), name='renamed in UI', id=55)
        self.assertEqual(find_existing(spec, [renamed], 'monitor')['id'], 55)

    def test_similarly_named_monitor_is_not_adopted_by_substring(self):
        spec = self.bundle['monitors'][0]
        lookalike = {'id': 55, 'name': spec['payload']['name'] + ' copy', 'tags': []}
        self.assertIsNone(find_existing(spec, [lookalike], 'monitor'))


if __name__ == '__main__':
    unittest.main()
