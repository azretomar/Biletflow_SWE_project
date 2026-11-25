import { Redirect } from 'expo-router';

import { startTab, useAuth } from '@/lib/auth';

export default function Home() {
  const { user } = useAuth();
  return <Redirect href={`/${user ? startTab(user.role) : 'events'}`} />;
}
