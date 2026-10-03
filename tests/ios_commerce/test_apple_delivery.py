from types import SimpleNamespace as NS
from datetime import timedelta
import pytest
from fastapi import HTTPException

pytestmark = pytest.mark.asyncio
TOKEN = '11111111-1111-4111-8111-111111111111'
USER = {'id':'user1','email':'unit@example.test','active':True,'role':'student'}

def transaction(env, **kw):
    ms = int(env.now.timestamp()*1000)
    values = dict(appAccountToken=TOKEN, productId='com.tonyoga.app.core30', bundleId='com.tonyoga.app',
        type='Non-Renewing Subscription', quantity=1, purchaseDate=ms, expiresDate=None,
        transactionId='100001', originalTransactionId='100001', signedDate=ms, revocationDate=None,
        price=199000,currency='EUR',isUpgraded=False, subscriptionGroupIdentifier=None)
    values.update(kw); return NS(**values)

async def seed(env, **snap):
    await env.db.users.insert_one(USER)
    s = {'item_type':'program','item_id':'core','apple_type':'nonRenewable','duration_days':30,'currency':'eur',
        'grants':[{'kind':'program','target_id':'core','duration_seconds':30*86400}]}
    s.update(snap)
    await env.db.ios_purchase_intents.insert_one({'_id':TOKEN,'user_id':USER['id'],'product_id':'com.tonyoga.app.core30','snapshot':s})

async def test_verified_program_replay_preserves_single_grant(env):
    await seed(env); tx=transaction(env)
    for _ in range(3): assert (await env.module._deliver('Production',tx,USER))['finish']
    assert len(env.db.ios_transactions.rows)==len(env.db.access_grants.rows)==1
    assert env.db.access_grants.rows[0]['ends_at']==(env.now+timedelta(days=30)).isoformat()

@pytest.mark.parametrize('changes', [dict(bundleId='wrong.app'), dict(productId='wrong.product'), dict(type='Consumable'), dict(quantity=2), dict(transactionId='bad')])
async def test_tampered_transaction_context_denied(env,changes):
    await seed(env)
    with pytest.raises(HTTPException): await env.module._deliver('Production',transaction(env,**changes),USER)
    assert not env.db.access_grants.rows

async def test_wrong_account_denied(env):
    await seed(env)
    with pytest.raises(HTTPException) as e: await env.module._deliver('Production',transaction(env),{'id':'other'})
    assert e.value.status_code==403

async def test_unknown_purchase_token_denied(env):
    await seed(env)
    with pytest.raises(HTTPException): await env.module._deliver('Production',transaction(env,appAccountToken='unmapped'),USER)

async def test_inactive_account_not_given_access(env):
    await seed(env); await env.db.users.update_one({'id':'user1'},{'$set':{'active':False}})
    with pytest.raises(HTTPException): await env.module._deliver('Production',transaction(env),USER)

async def test_future_purchase_denied(env):
    await seed(env)
    with pytest.raises(HTTPException): await env.module._deliver('Production',transaction(env,purchaseDate=int((env.now+timedelta(hours=1)).timestamp()*1000)),USER)

async def test_sandbox_account_allowlist(env):
    await seed(env); env.cfg['sandbox_user_emails']=[]
    with pytest.raises(HTTPException): await env.module._deliver('Sandbox',transaction(env),USER)
    env.cfg['sandbox_user_emails']=['unit@example.test']
    assert (await env.module._deliver('Sandbox',transaction(env),USER))['finish']

async def test_refund_sticky_and_verified_reversal(env):
    await seed(env); tx=transaction(env); await env.module._deliver('Production',tx,USER)
    refunded=transaction(env,revocationDate=tx.signedDate,signedDate=tx.signedDate+100)
    await env.module._deliver('Production',refunded,USER)
    await env.module._deliver('Production',tx,USER)
    assert env.db.access_grants.rows[0]['revoked_at']
    newer=transaction(env,signedDate=tx.signedDate+200)
    await env.module._deliver('Production',newer,USER)
    assert env.db.access_grants.rows[0]['revoked_at']
    await env.module._deliver('Production',newer,USER,refund_reversed=True)
    assert env.db.access_grants.rows[0]['revoked_at'] is None

async def test_out_of_order_does_not_extend_subscription(env):
    await seed(env,item_type='membership',apple_type='autoRenewable',grants=[],item_id='plan')
    tx=transaction(env,type='Auto-Renewable Subscription',expiresDate=int((env.now+timedelta(days=31)).timestamp()*1000))
    await env.module._deliver('Production',tx,USER)
    older=transaction(env,type=tx.type,expiresDate=tx.expiresDate+10000000,signedDate=tx.signedDate-10)
    r=await env.module._deliver('Production',older,USER)
    assert r['stale'] is True
    assert env.db.subscriptions.rows[0]['end_date']==(env.now+timedelta(days=31)).isoformat()

async def test_restore_consumable_does_not_restore_spent_credits(env):
    await seed(env,item_type='class_pack',apple_type='consumable',grants=[],credits=5)
    tx=transaction(env,type='Consumable')
    await env.module._deliver('Production',tx,USER)
    await env.db.class_passes.update_one({'id':'apple:Production:100001'},{'$inc':{'remaining':-2}})
    await env.module._deliver('Production',tx,USER)
    assert env.db.class_passes.rows[0]['remaining']==3
    await env.module._deliver('Production',transaction(env,type='Consumable',revocationDate=tx.signedDate),USER)
    assert env.db.class_passes.rows[0]['active'] is False

async def test_ebook_refund_closes_download_order(env):
    await seed(env,item_type='product',apple_type='nonConsumable',grants=[],item_id='ebook',title='Yoga Book')
    tx=transaction(env,type='Non-Consumable');await env.module._deliver('Production',tx,USER)
    assert env.db.orders.rows[0]['status']=='paid'
    assert env.db.orders.rows[0]['total']==199
    await env.module._deliver('Production',transaction(env,type=tx.type,revocationDate=tx.signedDate),USER)
    assert env.db.orders.rows[0]['status']=='refunded'

async def test_deposit_restore_cannot_downgrade_fully_paid_retreat(env):
    await seed(env,item_type='workshop_deposit',item_id='reservation',apple_type='consumable',grants=[])
    await env.db.workshop_registrations.insert_one({'id':'reservation','user_id':'user1','status':'paid_in_full'})
    await env.module._deliver('Production',transaction(env,type='Consumable'),USER)
    assert env.db.workshop_registrations.rows[0]['status']=='paid_in_full'

async def test_expiry_required_for_auto_renewable(env):
    await seed(env,item_type='membership',apple_type='autoRenewable',grants=[])
    with pytest.raises(HTTPException): await env.module._deliver('Production',transaction(env,type='Auto-Renewable Subscription'),USER)

async def test_invalid_jws_never_grants(env,monkeypatch):
    class InvalidVerifier:
        def verify_and_decode_signed_transaction(self,_): raise ValueError('bad signature')
    monkeypatch.setattr(env.module,'_verifiers',lambda:[('Production',InvalidVerifier())])
    with pytest.raises(HTTPException) as e: await env.module.verified_payload('forged')
    assert e.value.status_code==400
    assert not env.db.access_grants.rows

async def test_delivery_write_failure_not_finished(env,monkeypatch):
    await seed(env)
    async def failed(*a,**k): raise RuntimeError('disk error')
    monkeypatch.setattr(env.db.access_grants,'update_one',failed)
    with pytest.raises(RuntimeError): await env.module._deliver('Production',transaction(env),USER)
    assert 'delivered_at' not in env.db.ios_transactions.rows[0]

async def test_subscription_switch_same_group(env):
    await seed(env,item_type='membership',item_id='monthly',apple_type='autoRenewable',subscription_group_id='123456',grants=[])
    env.cfg['digital_products']=[{'enabled':True,'product_id':'com.tonyoga.app.yearly','apple_type':'autoRenewable','item_type':'membership','item_id':'yearly','subscription_group_id':'123456','description':'Yearly'}]
    await env.db.membership_plans.insert_one({'id':'yearly'})
    tx=transaction(env,productId='com.tonyoga.app.yearly',type='Auto-Renewable Subscription',subscriptionGroupIdentifier='123456',expiresDate=int((env.now+timedelta(days=365)).timestamp()*1000))
    await env.module._deliver('Production',tx,USER)
    assert env.db.subscriptions.rows[0]['plan_id']=='yearly'
    tx.subscriptionGroupIdentifier='987654'
    with pytest.raises(HTTPException): await env.module._deliver('Production',tx,USER)
