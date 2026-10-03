"""In-memory Mongo stand-in for unit tests, NOT a substitute for staging Mongo tests."""
import copy
import importlib.util
import logging
import sys
import types
from pathlib import Path
from datetime import datetime, timezone
from types import SimpleNamespace
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))


def value(doc, path):
    for p in path.split('.'):
        if not isinstance(doc, dict) or p not in doc: return None
        doc = doc[p]
    return doc

def matches(doc, query):
    for key, wanted in query.items():
        if key == '$or':
            if not any(matches(doc, x) for x in wanted): return False
            continue
        got = value(doc, key)
        if isinstance(wanted, dict):
            for op, v in wanted.items():
                if op == '$exists' and ((got is not None) != v): return False
                if op == '$ne' and (got == v or isinstance(got, list) and v in got): return False
                if op == '$in' and got not in v: return False
                if op == '$nin' and got in v: return False
                if op in ('$gt', '$gte', '$lt', '$lte'):
                    if got is None: return False
                    if not {'$gt': lambda: got > v, '$gte': lambda: got >= v, '$lt': lambda: got < v, '$lte': lambda: got <= v}[op](): return False
        elif got != wanted: return False
    return True

def put(doc, key, val):
    parts = key.split('.')
    for p in parts[:-1]: doc = doc.setdefault(p, {})
    doc[parts[-1]] = copy.deepcopy(val)

def unset(doc, key):
    parts = key.split('.')
    for p in parts[:-1]:
        doc = doc.get(p, {})
    doc.pop(parts[-1], None)

class Cursor:
    def __init__(self, rows): self.rows = copy.deepcopy(rows)
    def sort(self, *args): return self
    async def to_list(self, n): return self.rows[:n]
    def __aiter__(self): self.it = iter(self.rows); return self
    async def __anext__(self):
        try: return next(self.it)
        except StopIteration: raise StopAsyncIteration

class Collection:
    def __init__(self): self.rows = []; self.fail_delete = False
    def find(self, query=None, projection=None): return Cursor([d for d in self.rows if matches(d, query or {})])
    async def find_one(self, query, projection=None): return next((copy.deepcopy(x) for x in self.rows if matches(x, query)), None)
    async def insert_one(self, doc):
        if doc.get('_id') is not None and any(x.get('_id') == doc['_id'] for x in self.rows): raise ValueError('duplicate')
        self.rows.append(copy.deepcopy(doc)); return SimpleNamespace(inserted_id=doc.get('_id'))
    async def update_one(self, query, updates, upsert=False):
        row = next((d for d in self.rows if matches(d, query)), None); inserted = row is None
        if inserted and not upsert: return SimpleNamespace(matched_count=0, modified_count=0)
        if inserted:
            row = {k: copy.deepcopy(v) for k, v in query.items() if not k.startswith('$') and not isinstance(v, dict)}; self.rows.append(row)
        for op, data in updates.items():
            for k, v in data.items():
                if op == '$set' or (op == '$setOnInsert' and inserted): put(row, k, v)
                if op == '$inc': put(row, k, (value(row, k) or 0) + v)
                if op == '$unset': unset(row, k)
                if op == '$addToSet':
                    values = list(value(row, k) or [])
                    if v not in values: values.append(v)
                    put(row, k, values)
        return SimpleNamespace(matched_count=0 if inserted else 1, modified_count=1)
    async def update_many(self, query, updates):
        selected = [copy.deepcopy(x) for x in self.rows if matches(x, query)]
        for x in selected: await self.update_one(x, updates)
    async def find_one_and_update(self, query, updates, **kwargs):
        old = await self.find_one(query)
        if old is None: return None
        await self.update_one(query, updates)
        return await self.find_one({'_id': old['_id']}) if kwargs.get('return_document') else old
    async def delete_many(self, query):
        if self.fail_delete: raise RuntimeError('database failure')
        self.rows = [x for x in self.rows if not matches(x, query)]
    async def delete_one(self, query):
        for i, x in enumerate(self.rows):
            if matches(x, query): self.rows.pop(i); break
    async def count_documents(self, query): return len([x for x in self.rows if matches(x, query)])

class DB:
    def __init__(self): self.collections = {}
    def __getattr__(self, name): return self[name]
    def __getitem__(self, name): return self.collections.setdefault(name, Collection())

class API:
    def __getattr__(self, _): return lambda *a, **kw: (lambda f: f)

@pytest.fixture
def env(monkeypatch, tmp_path):
    db = DB(); now = datetime(2026, 10, 3, 12, tzinfo=timezone.utc)
    core = types.ModuleType('core')
    core.api = API(); core.db = db; core.now_utc = lambda: now
    core.gen_id = lambda: 'mock-id'; core.verify_password = lambda p, h: p == h
    core.logger = logging.getLogger('unit-test')
    async def get_user(): return None
    core.get_current_user = get_user
    monkeypatch.setitem(sys.modules, 'core', core)
    mongo = types.ModuleType('pymongo'); mongo.ReturnDocument = SimpleNamespace(AFTER=True)
    errors = types.ModuleType('pymongo.errors'); errors.DuplicateKeyError = type('DuplicateKeyError', (Exception,), {})
    monkeypatch.setitem(sys.modules, 'pymongo', mongo); monkeypatch.setitem(sys.modules, 'pymongo.errors', errors)
    spec = importlib.util.spec_from_file_location('ios_unit_router', ROOT/'backend/routers/ios_commerce.py')
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    cfg = {'digital_products': [], 'sandbox_user_emails': ['unit@example.test'], 'amazon_print_product_ids':[], 'in_person_workshop_ids':[], 'in_person_training_ids':[]}
    monkeypatch.setattr(mod, 'config', lambda: cfg)
    return SimpleNamespace(module=mod, db=db, cfg=cfg, now=now, tmp=tmp_path, core=core)
