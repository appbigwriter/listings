import {SQSClient,ReceiveMessageCommand,DeleteMessageCommand} from '@aws-sdk/client-sqs';
import {getSupabase} from '../lib/marketing/supabase';
import {notificationConfig} from '../lib/marketplaces/amazon-notifications';
import {processListingEvent} from '../lib/catalog/events';

async function main() {
 const config=notificationConfig(),db=getSupabase();if(!db)throw new Error('Supabase não configurado.');
 // Standard workload role/AWS_PROFILE chain; never accept custom endpoints or keys from notification bodies.
 const client=new SQSClient({region:config.region,maxAttempts:3});
 const once=process.argv.includes('--once');let stop=false;
 process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
 try{do {
  const response=await client.send(new ReceiveMessageCommand({QueueUrl:config.queueUrl,MaxNumberOfMessages:1,WaitTimeSeconds:once?0:20,VisibilityTimeout:180,MessageSystemAttributeNames:['ApproximateReceiveCount']}),{abortSignal:AbortSignal.timeout(30000)});
  for(const message of response.Messages||[]) {
   if(!message.Body||!message.ReceiptHandle)continue;
   try {
    const result=await processListingEvent(db,message.Body,config);
    await client.send(new DeleteMessageCommand({QueueUrl:config.queueUrl,ReceiptHandle:message.ReceiptHandle}),{abortSignal:AbortSignal.timeout(15000)});
    console.log(JSON.stringify({event:result.id,status:result.status}));
   }catch{console.error(JSON.stringify({message_id:message.MessageId,status:'retained_for_retry',receive_count:message.Attributes?.ApproximateReceiveCount}));}
  }
 }while(!once&&!stop);}finally{client.destroy();}
}
main().catch(()=>{console.error('Consumidor não iniciado ou fila indisponível. Verifique configuração e acesso AWS.');process.exitCode=1;});
