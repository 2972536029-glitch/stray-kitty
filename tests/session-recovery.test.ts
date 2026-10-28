import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError, HttpGameApi} from '../web/src/adapters/api/client.ts';
import {BrowserSessionStore} from '../web/src/adapters/storage/BrowserSessionStore.ts';
import type {CommandRequest, GameState, Session} from '../web/src/contracts/index.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {return this.values.size;}
  clear() {this.values.clear();}
  getItem(key: string) {return this.values.get(key) ?? null;}
  key(index: number) {return [...this.values.keys()][index] ?? null;}
  removeItem(key: string) {this.values.delete(key);}
  setItem(key: string, value: string) {this.values.set(key, String(value));}
}

function installStorage() {
  const original = globalThis.localStorage;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage});
  return {storage, restore: () => Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: original})};
}

const oldSession: Session = {playerId: 'old-player', token: 'old-session-token'};
const oldRequest = {expectedRevision: 2, command: {type: 'CONTINUE'}} as CommandRequest;

test('unauthorized restore preserves the saved session and pending command for another backend', async () => {
  const {storage, restore} = installStorage();
  const originalFetch = globalThis.fetch;
  try {
    const cache = new BrowserSessionStore();cache.write(oldSession);cache.savePending({playerId: oldSession.playerId, key: 'pending-command-1', request: oldRequest});
    globalThis.fetch = async () => new Response(JSON.stringify({error: {code: 'UNAUTHORIZED', message: 'session unavailable'}}), {status: 401});
    const api = new HttpGameApi(cache);
    await assert.rejects(api.initialize(), (error: unknown) => error instanceof ApiError && error.code === 'UNAUTHORIZED');
    assert.deepEqual(cache.read(), oldSession);
    assert.deepEqual(cache.pending(oldSession.playerId)?.request, oldRequest);
    assert.equal(storage.getItem('stray-kitty.unavailable-sessions.v1'), null);
  } finally {globalThis.fetch = originalFetch;restore();}
});

test('explicit fresh journey archives the unavailable session and starts with a new backend token', async () => {
  const {storage, restore} = installStorage();
  const originalFetch = globalThis.fetch;
  try {
    const cache = new BrowserSessionStore();cache.write(oldSession);cache.savePending({playerId: oldSession.playerId, key: 'pending-command-1', request: oldRequest});
    const newSession: Session = {playerId: 'new-player', token: 'new-session-token'};
    const freshState = {revision: 0, phase: 'dialogue'} as GameState;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/sessions')) return new Response(JSON.stringify(newSession), {status: 201});
      assert.ok(url.endsWith('/state'));
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${newSession.token}`);
      return new Response(JSON.stringify(freshState), {status: 200});
    };
    const api = new HttpGameApi(cache);
    assert.deepEqual(await api.startNewJourney(), freshState);
    assert.deepEqual(cache.read(), newSession);
    assert.equal(cache.pending(newSession.playerId), null);
    const archives = JSON.parse(storage.getItem('stray-kitty.unavailable-sessions.v1')!) as Array<{session: Session; pending: unknown}>;
    assert.deepEqual(archives[0].session, oldSession);
    assert.deepEqual(archives[0].pending, {playerId: oldSession.playerId, key: 'pending-command-1', request: oldRequest});
  } finally {globalThis.fetch = originalFetch;restore();}
});
