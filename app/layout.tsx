import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'PreListing · FBRSigns',description:'Preparação de listings para marketplaces americanos'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
