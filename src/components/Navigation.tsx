'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import ClerkAccount from './ClerkAccount';
import { useTenant } from '@/lib/use-tenant';
import { clerkPublishableKey } from '@/lib/clerk-config';
import {
  ArrowRightOnRectangleIcon,
  BuildingOffice2Icon,
  ClockIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  PhoneIcon,
  BriefcaseIcon,
  MegaphoneIcon,
  UserGroupIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Five destinations. Setup steps (counties, pull, enrich, research) live on a
 * clinic's page; Google keyword search and manual entry are ways to add a
 * practice, reached from Referral Sources.
 */
export const navigation = [
  { name: 'Our Clinics', href: '/clinic-locations', icon: BuildingOffice2Icon },
  { name: 'Referral Sources', href: '/referral-sources', icon: UserGroupIcon },
  { name: 'Your Sources', href: '/relationships', icon: HeartIcon },
  { name: 'Campaigns', href: '/campaigns', icon: MegaphoneIcon },
  { name: 'Activity', href: '/interactions', icon: ClockIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

/** Paragon's own pages, shown only to Paragon. */
export const adminNavigation = [
  { name: 'Subscribers', href: '/admin/subscribers', icon: ShieldCheckIcon },
  { name: 'Source Universe', href: '/admin/universe', icon: GlobeAltIcon },
  { name: 'Call queue', href: '/admin/calls', icon: PhoneIcon },
  { name: 'Clinic owners', href: '/admin/co-leads', icon: BriefcaseIcon },
];

export default function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: me } = useTenant();

  return (
    <nav className="flex flex-1 flex-col">
      <ul role="list" className="flex flex-1 flex-col gap-y-7">
        <li>
          <ul role="list" className="-mx-2 space-y-1">
            {navigation.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={classNames(
                      current
                        ? 'bg-white/10 text-white border-green-400'
                        : 'text-blue-100 hover:bg-white/5 hover:text-white border-transparent',
                      'group flex gap-x-3 rounded-md border-l-2 p-2 pl-3 text-sm font-semibold leading-6',
                    )}
                  >
                    <item.icon
                      className={classNames(
                        current ? 'text-green-400' : 'text-blue-200 group-hover:text-white',
                        'h-6 w-6 shrink-0',
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>

        {me?.isParagon && (
          <li>
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-blue-200">Paragon admin</p>
            <ul role="list" className="-mx-2 mt-2 space-y-1">
              {adminNavigation.map((item) => {
                const current = isCurrent(pathname, item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      aria-current={current ? 'page' : undefined}
                      className={classNames(
                        current
                          ? 'bg-white/10 text-white border-green-400'
                          : 'text-blue-100 hover:bg-white/5 hover:text-white border-transparent',
                        'group flex gap-x-3 rounded-md border-l-2 p-2 pl-3 text-sm font-semibold leading-6',
                      )}
                    >
                      <item.icon
                        className={classNames(current ? 'text-green-400' : 'text-blue-200 group-hover:text-white', 'h-6 w-6 shrink-0')}
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        )}

        <li className="-mx-2 mt-auto border-t border-white/10 pt-4">
          {clerkPublishableKey && !session?.user && <ClerkAccount />}
          {session?.user?.name && (
            <p className="px-2 text-xs text-blue-200">
              Signed in as <span className="font-medium text-white">{session.user.name}</span>
              {me && <span className="block text-blue-200/80">{me.organizationName}</span>}
            </p>
          )}
          {session?.user && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="group mt-2 flex w-full gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 text-blue-100 hover:bg-white/5 hover:text-white"
          >
            <ArrowRightOnRectangleIcon className="h-6 w-6 shrink-0 text-blue-200 group-hover:text-white" aria-hidden="true" />
            Sign out
          </button>
          )}
        </li>
      </ul>
    </nav>
  );
}
