import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

import type { AppAccountType, AppRole } from "@/features/auth/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      phone: string;
      role: AppRole;
      type: AppAccountType;
    } & DefaultSession["user"];
  }

  interface User {
    phone: string;
    role: AppRole;
    type: AppAccountType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    phone: string;
    role: AppRole;
    type: AppAccountType;
  }
}
