export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-3xl font-bold text-[#D85A30]">PropPulse</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
          <p className="text-white font-medium">Link expired or invalid</p>
          <p className="text-gray-400 text-sm">
            Magic links expire after 1 hour. Request a new one below.
          </p>
          <a
            href="/auth/login"
            className="block w-full py-3 rounded-xl bg-[#D85A30] text-white font-medium text-sm
                       hover:bg-[#c04e27] transition-colors"
          >
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  )
}
