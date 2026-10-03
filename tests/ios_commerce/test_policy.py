import copy
import pytest
from fastapi import HTTPException
from ios_commerce_policy import approved_amazon_print_url, validate_product_entry, snapshot_window
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS
import sys,types

@pytest.mark.parametrize('url,allowed',[
 ('https://www.amazon.com/Printed-Yoga/dp/0123456789',True),
 ('https://amazon.in/gp/product/B000123456?tag=test',True),
 ('https://amazon.com/book-ebook/dp/B000123456',False),
 ('https://amazon.com/dp/B000123456?format=kindle',False),
 ('https://amazon.com.evil.test/dp/B000123456',False),
 ('https://evil@amazon.com/dp/B000123456',False),
 ('http://amazon.com/dp/B000123456',False),
 ('https://amzn.to/shortlink',False),('javascript:alert(1)',False)])
def test_amazon(url,allowed): assert approved_amazon_print_url(url)==allowed

@pytest.mark.parametrize('entry',[
 {'product_id':'com.tonyoga.app.course','item_id':'course','item_type':'program','apple_type':'nonRenewable','duration_days':30,'description':'30 days access'},
 {'product_id':'com.tonyoga.app.month','item_id':'month','item_type':'membership','apple_type':'autoRenewable','subscription_group_id':'12345','description':'Monthly'},
 {'product_id':'com.tonyoga.app.pass5','item_id':'class_pack','item_type':'class_pack','apple_type':'consumable','description':'5 credits'},
])
def test_valid_catalog(entry): assert validate_product_entry(entry)==entry

@pytest.mark.parametrize('change',[
 {'product_id':'fake'}, {'item_id':'REPLACE_ID'}, {'apple_type':'nonConsumable'},
 {'duration_days':0}, {'duration_days':3651}, {'description':''},
 {'apple_type':'autoRenewable'}, {'item_type':'teacher_training'},
])
def test_invalid_catalog(change):
    e={'product_id':'com.tonyoga.app.course','item_id':'course','item_type':'program','apple_type':'nonRenewable','duration_days':30,'description':'30 days'};e.update(change)
    with pytest.raises((ValueError,TypeError)): validate_product_entry(e)

def test_window_fixed_and_rolling():
    now=datetime(2026,10,3,tzinfo=timezone.utc); end=now+timedelta(days=30)
    assert snapshot_window({'duration_seconds':30*86400},now)==(now,end)
    assert snapshot_window({'starts_at':now.isoformat(),'ends_at':end.isoformat()},now+timedelta(days=5))==(now,end)

@pytest.mark.asyncio
async def test_external_physical_cart_only(env):
    m=env.module;u={'id':'u'}
    await env.db.orders.insert_one({'id':'order','user_id':'u','status':'pending','items':[{'product_id':'shirt'}]})
    await env.db.products.insert_one({'id':'shirt','type':'physical'})
    assert await m._external_allowed('cart','order',env.cfg,u)
    assert not await m._external_allowed('cart','order',env.cfg,{'id':'other'})
    await env.db.products.update_one({'id':'shirt'},{'$set':{'type':'ebook'}})
    assert not await m._external_allowed('cart','order',env.cfg,u)

@pytest.mark.asyncio
async def test_private_booking_ownership(env):
    await env.db.private_session_requests.insert_one({'id':'private','user_id':'u'})
    assert await env.module._external_allowed('private_session','private',env.cfg,{'id':'u'})
    with pytest.raises(HTTPException): await env.module._external_allowed('private_session','private',env.cfg,{'id':'other'})

@pytest.mark.asyncio
@pytest.mark.parametrize('kind',['program','membership','class_pack','drop_in','bundle','product','class_subscription','class_one_time'])
async def test_digital_never_falls_back_to_external(env,kind):
    assert not await env.module._external_allowed(kind,'x',env.cfg,{'id':'u'})

@pytest.mark.asyncio
async def test_workshop_quote_and_hybrid(env):
    env.cfg['in_person_workshop_ids']=['retreat']
    assert await env.module._external_allowed('workshop_deposit','retreat',env.cfg,quote_only=True)
    await env.db.workshop_registrations.insert_one({'id':'reg','user_id':'u','workshop_id':'retreat','wants_teacher_training':True})
    assert not await env.module._external_allowed('workshop_deposit','reg',env.cfg,{'id':'u'})

@pytest.mark.asyncio
async def test_external_paid_waits_for_delivery(env):
    await env.db.payment_transactions.insert_one({'session_id':'ORDER','provider':'paypal','user_id':'u','payment_status':'paid','item_type':'cart'})
    assert (await env.module.external_status('ORDER',{'id':'u'}))['status']=='processing'
    await env.db.payment_transactions.update_one({'session_id':'ORDER'},{'$set':{'fulfilled_at':'date'}})
    assert (await env.module.external_status('ORDER',{'id':'u'}))['status']=='paid'

@pytest.mark.asyncio
async def test_delivery_lock_serializes(env):
    from commerce_lock import delivery_lock
    async with delivery_lock(env.db,'x'):
        with pytest.raises(HTTPException) as e:
            async with delivery_lock(env.db,'x'): pass
        assert e.value.status_code==503
    async with delivery_lock(env.db,'x'): pass
