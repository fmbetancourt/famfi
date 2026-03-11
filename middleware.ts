export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    // Protect everything except login, api/auth, static files, and _next
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
