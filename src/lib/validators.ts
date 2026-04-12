import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
});

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
});

export const workspaceSchema = z.object({
  name: z.string().trim().min(3, "Mínimo 3 caracteres").max(50),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
export type WorkspaceInput = z.infer<typeof workspaceSchema>;
