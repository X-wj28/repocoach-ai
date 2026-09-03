export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type AuthenticatedRequest = {
  headers: { cookie?: string };
  user: AuthUser;
  sessionToken: string;
};

export type CookieResponse = {
  setHeader(name: string, value: string): void;
};
