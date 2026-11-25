import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { colors } from '@/constants/theme';
import { canBrowseEvents, canCheckIn, canManageEvents, startTab, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type TabName = 'scanner' | 'events' | 'tickets' | 'manage' | 'profile';

const TABS: { name: TabName; icon: IconName; visible: (role: Role) => boolean }[] = [
  { name: 'scanner', icon: 'qr-code-outline', visible: canCheckIn },
  { name: 'events', icon: 'calendar-outline', visible: canBrowseEvents },
  { name: 'tickets', icon: 'ticket-outline', visible: canBrowseEvents },
  { name: 'manage', icon: 'briefcase-outline', visible: canManageEvents },
  { name: 'profile', icon: 'person-outline', visible: () => true },
];

export default function AppTabs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const role = user.role;
  const first = startTab(role);
  const ordered = [...TABS].sort((a, b) => Number(b.name === first) - Number(a.name === first));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      {ordered.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(`tabs.${tab.name}`),
            tabBarIcon: ({ focused, size }) => (
              <Ionicons name={tab.icon} color={focused ? colors.blue : colors.muted} size={size} />
            ),
            href: tab.visible(role) ? undefined : null,
            headerShown: tab.name === 'profile',
          }}
        />
      ))}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
