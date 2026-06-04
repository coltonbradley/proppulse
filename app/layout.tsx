import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PropPulse — Vote on props. See what the crowd thinks.',
  description: 'Crowdsourced sports prop consensus. Vote on player props and game lines, then see live community splits.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
