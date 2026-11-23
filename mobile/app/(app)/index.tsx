import { Redirect } from 'expo-router';

import { startTab, useAuth } from '@/lib/auth';

// "/" opens the role's start tab.
export default function Home() {
  const { user } = useAuth();
  return <Redirect href={`/${user ? startTab(user.role) : 'events'}`} />;
}
