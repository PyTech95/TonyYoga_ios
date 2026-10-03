"""Read-only export of live TonYoga product IDs. Creates a disabled mapping DRAFT.
No database changes. Review IDs/terms and create products in App Store Connect before enabling.
"""
import argparse, asyncio, json, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from core import db, client

def sku(kind, ident):
    import hashlib
    return 'com.tonyoga.app.'+kind+'.'+hashlib.sha256(str(ident).encode()).hexdigest()[:12]

async def main(out):
    data={'digital_products':[], 'sandbox_user_emails':[], 'amazon_print_product_ids':[],
          'in_person_workshop_ids':[], 'in_person_training_ids':[]}
    inventory={}
    for kind, collection in [('program','programs'),('membership','membership_plans'),('product','products'),('bundle','bundles'),('class_subscription','class_templates')]:
        rows=await db[collection].find({}, {'_id':0}).to_list(2000)
        inventory[kind]=[]
        for row in rows:
            ident=row['id']; title=row.get('title') or row.get('name') or ident
            inventory[kind].append({'id':ident,'title':title,'price':row.get('price'),'type':row.get('type'),
                'access_term':row.get('access_term'),'purchase_options':row.get('purchase_options'),
                'price_model':row.get('price_model'),'external_amazon_link':row.get('external_amazon_link')})
            if kind=='product' and row.get('type')!='ebook': continue
            if kind=='program' and row.get('price_model')=='free': continue
            if kind=='membership' and row.get('is_active') is False: continue
            term=(row.get('access_term') if kind=='program' else (row.get('purchase_options') or {}).get('term')) or {}
            apple_type='nonConsumable' if kind=='product' else 'autoRenewable' if kind=='membership' else 'nonRenewable'
            e={'enabled':False,'item_type':kind,'item_id':ident,'product_id':sku(kind,ident),'apple_type':apple_type,
               'description':title+' — REPLACE with exact purchase benefits and access period'}
            if apple_type=='autoRenewable':e['subscription_group_id']='REPLACE_FROM_APP_STORE_CONNECT'
            if apple_type=='nonRenewable':e['duration_days']=term.get('duration_days',30)
            data['digital_products'].append(e)
            if kind=='class_subscription':
                data['digital_products'].append({'enabled':False,'item_type':'class_one_time','item_id':ident,'product_id':sku('class_once',ident),'apple_type':'consumable','description':title+' — one selected live class'})
    for kind,title in [('drop_in','One class credit'),('class_pack','Five class credits')]:
        data['digital_products'].append({'enabled':False,'item_type':kind,'item_id':kind,'product_id':'com.tonyoga.app.'+kind,'apple_type':'consumable','description':title+'; no expiry; booking subject to availability.'})
    inventory['workshops']=await db.workshops.find({}, {'_id':0,'id':1,'title':1,'location':1,'start_date':1,'end_date':1,'deposit_amount':1,'price':1}).to_list(500)
    path=Path(out)
    if path.exists(): raise SystemExit('Output exists; choose a new name to avoid overwriting your configured catalog.')
    path.write_text(json.dumps(data,indent=2),encoding='utf-8')
    path.with_suffix('.inventory.json').write_text(json.dumps(inventory,indent=2,default=str),encoding='utf-8')
    print('Created DISABLED DRAFT:',path)
    print('Review the paired inventory file. No products have been registered with Apple.')
    client.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args();asyncio.run(main(args.output))
