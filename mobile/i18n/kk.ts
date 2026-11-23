import type { Strings } from './en';

const kk: Strings = {
  common: {
    loading: 'Жүктелуде…',
    retry: 'Қайталау',
    cancel: 'Бас тарту',
    save: 'Сақтау',
    free: 'Тегін',
  },
  errors: {
    network: 'Серверге қосылу мүмкін емес. Байланысты тексеріп, қайталап көріңіз.',
    unknown: 'Бір нәрсе дұрыс болмады. Қайталап көріңіз.',
    required: 'Барлық өрістерді толтырыңыз.',
    passwordLength: 'Құпиясөз 8-ден 72 таңбаға дейін болуы керек.',
  },
  auth: {
    loginTitle: 'Қайта қош келдіңіз',
    loginSubtitle: 'Билеттеріңіз бен іс-шараларыңызды көру үшін кіріңіз.',
    signupTitle: 'Аккаунт жасаңыз',
    signupSubtitle: 'Бір минуттан аз уақыт алады.',
    fullName: 'Толық аты-жөні',
    email: 'Email',
    password: 'Құпиясөз',
    passwordHint: '8-ден 72 таңбаға дейін',
    login: 'Кіру',
    signup: 'Аккаунт жасау',
    noAccount: 'Аккаунтыңыз жоқ па?',
    haveAccount: 'Аккаунтыңыз бар ма?',
    goSignup: 'Тіркелу',
    goLogin: 'Кіру',
    iWantTo: 'Мен…',
    attend: 'Іс-шараларға қатысқым келеді',
    attendHint: 'Іс-шараларды тауып, билет алу',
    organize: 'Іс-шара ұйымдастырғым келеді',
    organizeHint: 'Іс-шара құрып, билет сату',
  },
  tabs: {
    events: 'Іс-шаралар',
    tickets: 'Билеттерім',
    manage: 'Іс-шараларым',
    scanner: 'Кіру бақылауы',
    profile: 'Профиль',
  },
  roles: {
    attendee: 'Қатысушы',
    organizer: 'Ұйымдастырушы',
    event_admin: 'Іс-шара қызметкері',
    platform_admin: 'Платформа әкімшісі',
  },
  profile: {
    title: 'Профиль',
    role: 'Аккаунт түрі',
    language: 'Тіл',
    logout: 'Шығу',
    adminNote: 'Платформа әкімшісінің панелі сайтта қолжетімді.',
  },
  placeholder: {
    soon: 'Бұл экран жақында қосылады.',
  },
};

export default kk;
