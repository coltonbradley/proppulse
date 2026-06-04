'use client'

import { useState } from 'react'

type Props = {
  shareUrl: string
  result: string
  chosenLabel: string
}

export default function ShareButtons({ shareUrl, result, chosenLabel }: Props) {
  const [copied, setCopied] = useState(false)

  const text = `I went ${chosenLabel} on PropPulse and ${result === 'win' ? 'won' : 'lost'}. Vote on tonight's props 👇`

  function copyLink() {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function shareToX() {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
    window.open(url, '_blank')
  }

  function nativeShare() {
    if (navigator.share) {
      navigator.share({ title: 'PropPulse Pick', text, url: shareUrl })
    }
  }

  return (
    <div className="flex flex-col gap-3 mt-6 w-full max-w-lg">
      <button
        onClick={shareToX}
        className="w-full py-3 rounded-xl bg-black border border-gray-700 text-white font-medium text-sm hover:bg-gray-900 transition-colors"
      >
        Share on X
      </button>

      {'share' in navigator && (
        <button
          onClick={nativeShare}
          className="w-full py-3 rounded-xl bg-[#D85A30] text-white font-medium text-sm hover:bg-[#c04e27] transition-colors"
        >
          Share
        </button>
      )}

      <button
        onClick={copyLink}
        className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-medium text-sm hover:bg-gray-700 transition-colors"
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}
