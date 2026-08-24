"use server";

import { db } from "@/lib/db";
import { loginUser, logoutUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { ensureDefaultCategories } from "@/features/categories/default-categories";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Invalid email or password." };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return { error: "Invalid email or password." };
  }

  await loginUser(user.id);
  redirect("/");
}

export async function register(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password || !name) {
    return { error: "Name, email and password are required." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Email is already registered." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  
  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      // Create default settings for new user
      settings: {
        create: {
          theme: "Dark",
          currency: "EUR",
          language: "English"
        }
      }
    }
  });

  await ensureDefaultCategories(user.id);

  await loginUser(user.id);
  redirect("/");
}

export async function logout() {
  await logoutUser();
  redirect("/login");
}
