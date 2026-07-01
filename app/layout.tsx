import type { Metadata, Viewport } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Monitoramento CISLAV', description: 'PWA para monitorar NFs, repasses municipais e risco financeiro do CISLAV.', manifest: '/manifest.json' }
export const viewport: Viewport = { themeColor: '#1d6f5b', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html> }
