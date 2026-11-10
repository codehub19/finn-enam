import {createHash} from 'node:crypto';
import {cert,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {initializeFirestore} from 'firebase-admin/firestore';

export function firebaseServices(webJson,serviceJson){
  if(!webJson&&!serviceJson)return null;
  const {apiKey,appId,authDomain,projectId}=JSON.parse(webJson??'{}');
  const credentials=JSON.parse(serviceJson??'{}');
  if(!apiKey||!appId||!projectId||authDomain!==projectId+'.firebaseapp.com'||credentials.project_id!==projectId){
    throw Error('Firebase web and server configuration must identify the same project.');
  }
  const app=initializeApp({credential:cert(credentials),projectId});
  const db=initializeFirestore(app,{preferRest:true});
  return {web:{apiKey,appId,authDomain,projectId},auth:getAuth(app),db};
}

export function googleIdentity(claims){
  return claims?.firebase?.sign_in_provider==='google.com'&&claims.email_verified===true&&typeof claims.email==='string';
}

const endpointKey=endpoint=>createHash('sha256').update(endpoint).digest('hex');

export async function cloudSubscribers(db){
  const rows=await db.collection('finnPush').get();
  return Promise.all(rows.docs.map(async doc=>{
    const row=doc.data();
    const preferences=await workspaceStore(db,row.uid).data();
    return {...row,owner:'google:'+row.uid,preferences};
  })).then(items=>items.filter(row=>row.preferences));
}

export function workspaceStore(db,uid){
  const root=db.collection('finnWorkspaces').doc(uid);
  const latest=root.collection('research'), drafts=root.collection('drafts');
  const push=db.collection('finnPush');
  const subscriptionRef=endpoint=>push.doc(endpointKey(endpoint));
  return {
    async open(data,legacyReports=null,subscriptions=[]){
      return db.runTransaction(async tx=>{
        const current=await tx.get(root);
        if(current.exists)return !legacyReports;
        tx.create(root,{data:JSON.stringify(data)});
        for(const row of legacyReports??[])tx.create(latest.doc(row.symbol),{id:row.id,created:row.created,data:row.data});
        for(const row of subscriptions)tx.set(subscriptionRef(row.endpoint),{...row,uid});
        return true;
      });
    },
    async data(){return (await root.get()).data()?.data;},
    async mutate(change){
      return db.runTransaction(async tx=>{
        const current=JSON.parse((await tx.get(root)).get('data'));
        change(current);
        const serialized=JSON.stringify(current);
        if(Buffer.byteLength(serialized)>900000)throw Object.assign(Error('Workspace storage is full. Remove a saved report first.'),{status:409});
        tx.update(root,{data:serialized});
        return current;
      });
    },
    async latest(symbol){return (await latest.doc(symbol).get()).data();},
    async storeReport(symbol,id,report,verified){
      const data=JSON.stringify(report);
      if(verified){
        const ref=latest.doc(symbol);
        await db.runTransaction(async tx=>{
          const current=(await tx.get(ref)).data();
          if(!current||current.created<=report.createdAt)tx.set(ref,{id,created:report.createdAt,data});
        });
      }else{
        // Keep at most one temporary draft per ticker to bound workspace storage.
        await drafts.doc(symbol).set({id,data,expires:Date.now()+3600000});
      }
    },
    async subscription(endpoint){
      const record=(await subscriptionRef(endpoint).get()).data();
      return record?.uid===uid?{...record,owner:'google:'+uid}:null;
    },
    async setSubscription(endpoint,data){
      await subscriptionRef(endpoint).set({endpoint,data,uid});
    },
    async removeSubscription(endpoint){
      const ref=subscriptionRef(endpoint);
      await db.runTransaction(async tx=>{
        if((await tx.get(ref)).get('uid')===uid)tx.delete(ref);
      });
    },
    async report(id){
      const published=await latest.where('id','==',id).limit(1).get();
      if(!published.empty)return published.docs[0].data();
      const draft=await drafts.where('id','==',id).limit(1).get();
      const row=draft.docs[0]?.data();
      return row?.expires>Date.now()?row:null;
    }
  };
}
