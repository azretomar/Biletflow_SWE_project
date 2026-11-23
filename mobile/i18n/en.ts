// English strings. ru.ts and kk.ts must have the same keys (TypeScript checks this).
const en = {
  common: {
    loading: 'Loading…',
    retry: 'Try again',
    cancel: 'Cancel',
    save: 'Save',
    free: 'Free',
  },
  errors: {
    network: 'Cannot reach the server. Check the connection and try again.',
    unknown: 'Something went wrong. Try again.',
    required: 'Fill in all fields.',
    passwordLength: 'Password must be 8 to 72 characters.',
  },
  auth: {
    loginTitle: 'Welcome back',
    loginSubtitle: 'Log in to see your tickets and events.',
    signupTitle: 'Create your account',
    signupSubtitle: 'It takes less than a minute.',
    fullName: 'Full name',
    email: 'Email',
    password: 'Password',
    passwordHint: '8 to 72 characters',
    login: 'Log in',
    signup: 'Create account',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    goSignup: 'Sign up',
    goLogin: 'Log in',
    iWantTo: 'I want to…',
    attend: 'Attend events',
    attendHint: 'Find events and get tickets',
    organize: 'Organize events',
    organizeHint: 'Create events and sell tickets',
  },
  tabs: {
    events: 'Events',
    tickets: 'My tickets',
    manage: 'My events',
    scanner: 'Check-in',
    profile: 'Profile',
  },
  roles: {
    attendee: 'Attendee',
    organizer: 'Organizer',
    event_admin: 'Event staff',
    platform_admin: 'Platform admin',
  },
  profile: {
    title: 'Profile',
    role: 'Account type',
    language: 'Language',
    logout: 'Log out',
    adminNote: 'The platform admin portal is available on the website.',
  },
  placeholder: {
    soon: 'This screen is coming next.',
  },
};

export default en;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Strings = Widen<typeof en>;
