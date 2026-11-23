import type { Strings } from './en';

const ru: Strings = {
  common: {
    loading: 'Загрузка…',
    retry: 'Повторить',
    cancel: 'Отмена',
    save: 'Сохранить',
    free: 'Бесплатно',
  },
  errors: {
    network: 'Нет связи с сервером. Проверьте подключение и попробуйте снова.',
    unknown: 'Что-то пошло не так. Попробуйте снова.',
    required: 'Заполните все поля.',
    passwordLength: 'Пароль должен быть от 8 до 72 символов.',
  },
  auth: {
    loginTitle: 'С возвращением',
    loginSubtitle: 'Войдите, чтобы увидеть свои билеты и события.',
    signupTitle: 'Создайте аккаунт',
    signupSubtitle: 'Это займёт меньше минуты.',
    fullName: 'Полное имя',
    email: 'Email',
    password: 'Пароль',
    passwordHint: 'От 8 до 72 символов',
    login: 'Войти',
    signup: 'Создать аккаунт',
    noAccount: 'Нет аккаунта?',
    haveAccount: 'Уже есть аккаунт?',
    goSignup: 'Зарегистрироваться',
    goLogin: 'Войти',
    iWantTo: 'Я хочу…',
    attend: 'Посещать события',
    attendHint: 'Находить события и получать билеты',
    organize: 'Организовывать события',
    organizeHint: 'Создавать события и продавать билеты',
  },
  tabs: {
    events: 'События',
    tickets: 'Мои билеты',
    manage: 'Мои события',
    scanner: 'Вход',
    profile: 'Профиль',
  },
  roles: {
    attendee: 'Посетитель',
    organizer: 'Организатор',
    event_admin: 'Сотрудник события',
    platform_admin: 'Администратор платформы',
  },
  profile: {
    title: 'Профиль',
    role: 'Тип аккаунта',
    language: 'Язык',
    logout: 'Выйти',
    adminNote: 'Панель администратора платформы доступна на сайте.',
  },
  placeholder: {
    soon: 'Этот экран скоро появится.',
  },
};

export default ru;
