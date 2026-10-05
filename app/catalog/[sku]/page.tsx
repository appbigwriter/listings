import Editor from './Editor';
import { isChannel } from '../../../lib/catalog/model';

export default async function ProductPage({ params, searchParams }: { params: Promise<{ sku: string }>; searchParams: Promise<{ channel?: string }> }) {
  const channel = (await searchParams).channel;
  return <Editor sku={(await params).sku} initialChannel={isChannel(channel) ? channel : 'amazon-us'} />;
}
