"""Execute the real verification/fulfillment functions against isolated fake storage."""
import ast
import importlib.util
from pathlib import Path
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
import copy
import pytest
from fastapi import HTTPException

ROOT=Path(__file__).resolve().parents[2]

def load_function(path,name,namespace):
    source=ast.parse(path.read_text())
    fn=next(x for x in source.body if isinstance(x,(ast.FunctionDef,ast.AsyncFunctionDef)) and x.name==name)
    exec(compile(ast.Module(body=[fn],type_ignores=[]),str(path),'exec'),namespace)
    return namespace[name]

@pytest.fixture
def verifier():
    return load_function(ROOT/'backend/routers/paypal.py','_verify_paypal_order',dict(HTTPException=HTTPException,Decimal=Decimal,InvalidOperation=InvalidOperation))

@pytest.fixture
def paid_order():
    return {'id':'ORDER','status':'COMPLETED','purchase_units':[{'custom_id':'user','payments':{'captures':[{'id':'CAPTURE','status':'COMPLETED','amount':{'currency_code':'EUR','value':'120.00'}}]}}]}

def test_paypal_server_result_match(verifier,paid_order):
    assert verifier(paid_order,{'session_id':'ORDER','user_id':'user','currency':'eur','amount':120.0})=='CAPTURE'

@pytest.mark.parametrize('change',['order','user','amount','currency','state','capture_state','extra_unit'])
def test_paypal_mismatch_denied(verifier,paid_order,change):
    d=copy.deepcopy(paid_order)
    if change=='order': d['id']='OTHER'
    if change=='user': d['purchase_units'][0]['custom_id']='other'
    if change=='amount': d['purchase_units'][0]['payments']['captures'][0]['amount']['value']='0.01'
    if change=='currency': d['purchase_units'][0]['payments']['captures'][0]['amount']['currency_code']='USD'
    if change=='state': d['status']='APPROVED'
    if change=='capture_state': d['purchase_units'][0]['payments']['captures'][0]['status']='PENDING'
    if change=='extra_unit': d['purchase_units']*=2
    with pytest.raises(HTTPException): verifier(d,{'session_id':'ORDER','user_id':'user','currency':'eur','amount':120.0})

@pytest.mark.asyncio
async def test_paypal_pass_replay_no_extra_credits(env):
    async def no_op(*a): pass
    fn=load_function(ROOT/'backend/routers/payments.py','_fulfill_payment',dict(db=env.db,now_utc=env.core.now_utc,gen_id=env.core.gen_id,HTTPException=HTTPException,_send_receipt=no_op))
    tx={'id':'tx','item_type':'class_pack','item_id':'class_pack','user_id':'u','amount':99,'currency':'eur'}
    await fn(tx); await env.db.class_passes.update_one({'id':'payment:tx'},{'$inc':{'remaining':-1}}); await fn(tx)
    assert len(env.db.class_passes.rows)==1
    assert env.db.class_passes.rows[0]['remaining']==4

@pytest.mark.asyncio
async def test_paypal_ebook_replay_single_order(env):
    async def no_op(*a): pass
    fn=load_function(ROOT/'backend/routers/payments.py','_fulfill_payment',dict(db=env.db,now_utc=env.core.now_utc,gen_id=env.core.gen_id,HTTPException=HTTPException,_send_receipt=no_op))
    await env.db.products.insert_one({'id':'book','type':'ebook','title':'Yoga'})
    tx={'id':'tx','item_type':'product','item_id':'book','user_id':'u','amount':19,'currency':'eur'}
    await fn(tx); await fn(tx)
    assert len(env.db.orders.rows)==1

@pytest.mark.asyncio
async def test_paypal_physical_replay_single_stock_decrement(env):
    async def no_op(*a): pass
    fn=load_function(ROOT/'backend/routers/payments.py','_fulfill_payment',dict(db=env.db,now_utc=env.core.now_utc,gen_id=env.core.gen_id,HTTPException=HTTPException,_send_receipt=no_op))
    await env.db.products.insert_one({'id':'mat','type':'physical','title':'Mat','stock_qty':10})
    tx={'id':'tx','item_type':'product','item_id':'mat','user_id':'u','amount':19,'currency':'eur','quantity':2}
    await fn(tx); await fn(tx)
    assert env.db.products.rows[0]['stock_qty']==8
    assert len(env.db.orders.rows)==1

@pytest.fixture
def account(env):
    # Load module via its real code while core is already patched by env.
    spec=importlib.util.spec_from_file_location('account_unit_router',ROOT/'backend/routers/account.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

@pytest.mark.asyncio
async def test_purge_keeps_nonrequested_and_future_accounts(env,account):
    await env.db.users.insert_one({'id':'ok','active':True})
    await env.db.users.insert_one({'id':'future','active':False,'deletion_scheduled_at':(env.now+timedelta(days=5)).isoformat()})
    result=await account._run_purge_deleted_accounts()
    assert result['purged']==0 and len(env.db.users.rows)==2

@pytest.mark.asyncio
async def test_purge_removes_due_account_and_related_data(env,account):
    await env.db.users.insert_one({'id':'due','email':'due@example.test','active':False,'deletion_scheduled_at':(env.now-timedelta(days=1)).isoformat()})
    await env.db.access_grants.insert_one({'user_id':'due'})
    await env.db.orders.insert_one({'id':'order','user_id':'due','shipping_address':{'name':'private'},'notes':'private','metadata':{'user_email':'private'}})
    r=await account._run_purge_deleted_accounts()
    assert r['purged']==1 and not env.db.users.rows and not env.db.access_grants.rows
    assert env.db.orders.rows[0]['user_id']=='deleted' and 'shipping_address' not in env.db.orders.rows[0]

@pytest.mark.asyncio
async def test_purge_failure_keeps_account_for_retry(env,account):
    await env.db.users.insert_one({'id':'due','email':'due@example.test','active':False,'deletion_scheduled_at':(env.now-timedelta(days=1)).isoformat()})
    env.db.access_grants.fail_delete=True
    r=await account._run_purge_deleted_accounts()
    assert r['failed']==1 and len(env.db.users.rows)==1

@pytest.mark.asyncio
async def test_cancel_after_deadline_denied(env,account):
    await env.db.users.insert_one({'id':'due','active':False,'deletion_scheduled_at':(env.now-timedelta(days=1)).isoformat()})
    with pytest.raises(HTTPException): await account.cancel_account_deletion({'id':'due'})
