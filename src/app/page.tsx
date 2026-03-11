import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">FamFi</h1>
      <p className="text-muted-foreground">
        Bienvenido, {session.user?.name}
      </p>
      <SignOutButton />
    </div>
  );
}
