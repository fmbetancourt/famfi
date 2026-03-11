import "next-auth";

declare module "next-auth" {
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
