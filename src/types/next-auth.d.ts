import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    familyId: string;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      familyId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    familyId: string;
  }
}
