export const CHANNELS = ['amazon-us', 'walmart-us', 'ebay-us', 'tiktok-us'] as const;
export type Channel = typeof CHANNELS[number];
export const CHANNEL_LABELS: Record<Channel, string> = { 'amazon-us': 'Amazon US', 'walmart-us': 'Walmart US', 'ebay-us': 'eBay US', 'tiktok-us': 'TikTok Shop US' };
