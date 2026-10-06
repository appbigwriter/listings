import Ajv from 'ajv';
import feedSchema from './schemas/amazon-listings-feed-v2.json';
import reportSchema from './schemas/amazon-feed-report-v2.json';
const ajv=new Ajv({allErrors:true,strict:false});
const feed=ajv.compile(feedSchema),report=ajv.compile(reportSchema);
export function validateFeedDocument(value:unknown) {if(!feed(value))throw new Error('Feed fora do schema oficial Amazon: '+ajv.errorsText(feed.errors));}
export function validateFeedReport(value:unknown) {if(!report(value))throw new Error('Relatório fora do schema oficial Amazon: '+ajv.errorsText(report.errors));}
