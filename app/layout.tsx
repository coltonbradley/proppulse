import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PropPulse — Vote on props. See what the crowd thinks.',
  description: 'Crowdsourced sports prop consensus. Vote on player props and game lines, then see live community splits.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <div className="pb-24 px-4">
          <p className="text-center text-xs text-gray-700 py-4 max-w-xl mx-auto border-t border-gray-800">
            PropPulse is a community sentiment platform. Nothing on this site constitutes betting advice.
          </p>
        </div>
      </body>
    </html>
  )
}
