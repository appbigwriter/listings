import './globals.css';
import type { Metadata } from 'next';
import PendingIssueLinks from './catalog/PendingIssueLinks';
export const metadata: Metadata={title:'PreListing · FBRSigns',description:'Preparação de listings para marketplaces americanos'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}<PendingIssueLinks /></body></html>}
