import { HandleSSOCallback } from '@clerk/react';
import { Loader2 } from 'lucide-react';

/**
 * Google sign-in comes back here when Clerk needs one more step (e.g. turning a
 * first Google sign-in into a sign-up). Afterwards the landing exchanges the
 * Clerk session for the app's token, asking for a login if it is a new account.
 */
export function SsoCallback() {
  const back = (query = '') => window.location.replace(`/${query}`);
  return (
    <div className="sso-callback">
      <Loader2 className="spin" size={26} />
      <span>Входим через Google…</span>
      <HandleSSOCallback
        navigateToApp={() => back()}
        navigateToSignIn={() => back('?auth=signin')}
        navigateToSignUp={() => back('?auth=signup')}
      />
    </div>
  );
}
