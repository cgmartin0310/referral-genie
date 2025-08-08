'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { 
  HomeIcon, 
  UserGroupIcon, 
  CalendarIcon, 
  MegaphoneIcon, 
  ChartBarIcon,
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  MapPinIcon 
} from '@heroicons/react/24/outline';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Referral Sources', href: '/referral-sources', icon: UserGroupIcon },
  { name: 'Clinic Locations', href: '/clinic-locations', icon: MapPinIcon },
  { name: 'Interactions', href: '/interactions', icon: CalendarIcon },
  { name: 'Campaigns', href: '/campaigns', icon: MegaphoneIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Prospecting', href: '/prospecting', icon: MagnifyingGlassIcon },
];

export default function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <nav className="flex flex-1 flex-col">
      <ul role="list" className="flex flex-1 flex-col gap-y-7">
        <li>
          <ul role="list" className="-mx-2 space-y-1">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={classNames(
                    pathname === item.href
                      ? 'bg-gray-50 text-indigo-600'
                      : 'text-gray-700 hover:text-indigo-600 hover:bg-gray-50',
                    'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                  )}
                >
                  <item.icon
                    className={classNames(
                      pathname === item.href
                        ? 'text-indigo-600'
                        : 'text-gray-400 group-hover:text-indigo-600',
                      'h-6 w-6 shrink-0'
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </li>
        <li className="mt-auto">
          <div className="border-t border-gray-200 pt-4">
            {session?.user && (
              <div className="px-2 mb-2">
                <p className="text-xs text-gray-500">Logged in as</p>
                <p className="text-sm font-medium text-gray-700">{session.user.name}</p>
              </div>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-gray-700 hover:text-indigo-600 hover:bg-gray-50 group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full"
            >
              <ArrowRightOnRectangleIcon
                className="text-gray-400 group-hover:text-indigo-600 h-6 w-6 shrink-0"
                aria-hidden="true"
              />
              Sign out
            </button>
          </div>
        </li>
      </ul>
    </nav>
  );
} 