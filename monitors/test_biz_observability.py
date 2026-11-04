"""Offline regression tests for mutation safety and business-query semantics."""
import copy
import unittest

from biz_observability import DefinitionError, MANAGED, deploy, find_existing, load_bundle, validate_bundle


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

    def test_composites_use_created_real_ids_and_silent_components(self):
        client = FakeDatadog(self.bundle)
        deploy(self.bundle, client, apply=True)
        ids = {item['id'] for item in client.monitors if item['type'] != 'composite'}
        composites = [item for item in client.monitors if item['type'] == 'composite']
        self.assertEqual(len(composites), 2)
        for item in composites:
            self.assertTrue(all(int(v.strip()) in ids for v in item['query'].split('&&')))
        for item in client.monitors:
            if 'role:component' in item['tags']:
                self.assertNotIn('@', item['message'])

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

    def test_composite_cannot_reference_missing_or_later_monitor(self):
        spec = next(s for s in self.bundle['monitors'] if s['payload']['type'] == 'composite')
        spec['payload']['query'] = '${story-session-volume} && ${not-deployed}'
        with self.assertRaisesRegex(DefinitionError, 'earlier'):
            validate_bundle(self.bundle)

    def test_financial_ratio_uses_actual_amount_not_event_count(self):
        dashboard = next(s for s in self.bundle['dashboards'] if s['id'] == 'economy-dashboard')
        for widget in dashboard['payload']['widgets']:
            definition = widget['definition']
            if '金额收支比' in definition.get('title', ''):
                for request in definition['requests']:
                    self.assertTrue(all('kitty.economy.amount{' in q['query'] for q in request['queries']))

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
