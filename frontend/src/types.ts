export type ToastType = 'success' | 'error' | 'info';

export type ToastMessage = {
  id: number;
  type: ToastType;
  message: string;
};

export type AppView = 'dashboard' | 'room' | 'profile' | 'join';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
