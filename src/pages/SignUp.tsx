import { SignUp as ClerkSignUp } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'

export function SignUp() {
  const [searchParams] = useSearchParams()
  const redirectUrl = searchParams.get('redirect_url')

  return (
    <div className="flex items-center justify-center min-h-screen bg-mns-dark px-4 py-12">
      <ClerkSignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl={redirectUrl ?? undefined}
        fallbackRedirectUrl="/teams"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-mns-card border border-white/10 shadow-2xl',
            headerTitle: 'text-white',
            headerSubtitle: 'text-gray-400',
            socialButtonsBlockButton:
              'bg-mns-hover border border-white/10 text-white hover:bg-white/5',
            socialButtonsBlockButtonText: 'text-white',
            formFieldLabel: 'text-gray-300',
            formFieldInput: 'bg-mns-dark border border-white/10 text-white',
            footerActionText: 'text-gray-400',
            footerActionLink: 'text-green-500 hover:text-green-400',
            formButtonPrimary: 'bg-green-500 hover:bg-green-400 text-black',
            identityPreviewText: 'text-white',
            identityPreviewEditButton: 'text-green-500',
            dividerLine: 'bg-white/10',
            dividerText: 'text-gray-500',
          },
        }}
      />
    </div>
  )
}
