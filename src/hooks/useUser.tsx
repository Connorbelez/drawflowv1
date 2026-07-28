import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { useEffect } from "react";

type UserOrNull = ReturnType<typeof useAuth>["user"];

// redirects to the sign-in page if the user is not signed in
export const useUser = (): UserOrNull => {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!(loading || user)) {
      window.location.href = `/api/auth/sign-in?returnPathname=${encodeURIComponent(location.pathname)}`;
    }
  }, [loading, location.pathname, user]);

  return user;
};
