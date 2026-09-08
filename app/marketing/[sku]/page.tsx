import MarketingSkuClient from './MarketingSkuClient';
export default async function Page({ params }: { params: Promise<{ sku: string }> }) { const { sku } = await params; return <MarketingSkuClient sku={decodeURIComponent(sku)} />; }
