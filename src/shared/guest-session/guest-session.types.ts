export type WebsiteContext = {
  userId?: string;
  guestSessionHash?: string;
};

declare global {
  namespace Express {
    interface Request {
      websiteContext?: WebsiteContext;
    }
  }
}

export {};
