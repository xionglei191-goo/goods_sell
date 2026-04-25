import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/features/auth/schemas";
import type { AuthUser } from "@/features/auth/types";

async function findAuthUser(phone: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      name: true,
      phone: true,
      password: true,
      role: true,
      avatar: true,
      isActive: true,
    },
  });

  if (user) {
    const isValid = user.isActive && (await compare(password, user.password));
    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      type: "STAFF",
      image: user.avatar,
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { phone },
    select: {
      id: true,
      name: true,
      phone: true,
      password: true,
      type: true,
      avatar: true,
      isVerified: true,
    },
  });

  if (!customer) {
    return null;
  }

  const isValid = customer.isVerified && (await compare(password, customer.password));
  if (!isValid) {
    return null;
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    role: customer.type === "DEALER" ? "DEALER" : "CONSUMER",
    type: "CUSTOMER",
    image: customer.avatar,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        phone: { label: "手机号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        return findAuthUser(parsed.data.phone, parsed.data.password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const authUser = user as AuthUser;
        token.id = authUser.id;
        token.name = authUser.name;
        token.phone = authUser.phone;
        token.role = authUser.role;
        token.type = authUser.type;
        token.picture = authUser.image;
      }

      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.name = token.name;
      session.user.phone = token.phone;
      session.user.role = token.role;
      session.user.type = token.type;
      session.user.image = token.picture;

      return session;
    },
  },
});
