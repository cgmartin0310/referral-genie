'use client';

import { OrganizationSwitcher, Show, UserButton, useUser } from '@clerk/nextjs';

/**
 * The signed-in Clerk user: which organization (subscriber) they are working
 * in, with a switcher when they belong to more than one, and their account
 * menu with sign out. Rendered only when Clerk is configured.
 */
export default function ClerkAccount() {
  const { user } = useUser();
  return (
    <Show when="signed-in">
      <div className="space-y-3 px-2">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/"
          appearance={{
            elements: {
              organizationSwitcherTrigger: 'w-full justify-between rounded-md bg-white/10 px-2 py-1.5 text-white hover:bg-white/15',
              organizationPreviewMainIdentifier: 'text-white',
            },
          }}
        />
        <div className="flex items-center gap-2">
          <UserButton />
          <span className="truncate text-xs text-blue-100">{user?.primaryEmailAddress?.emailAddress}</span>
        </div>
      </div>
    </Show>
  );
}
