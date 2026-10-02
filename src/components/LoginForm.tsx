"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowRight, Briefcase } from "@/components/icons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginSchema, registerSchema } from "@/lib/domain/validation";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim();
    const validation = (mode === "register" ? registerSchema : loginSchema).safeParse(
      mode === "register" ? { email: normalizedEmail, password, name: name.trim() } : { email: normalizedEmail, password },
    );
    if (!validation.success) {
      const validationMessage = validation.error.issues[0]?.message ?? "Periksa kembali data akun.";
      setError(validationMessage);
      toast.error(validationMessage);
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { email: normalizedEmail, password, name: name.trim() }
            : { email: normalizedEmail, password },
        ),
      });
      const payload: unknown = await res.json().catch(() => null);
      const data =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : null;
      if (!res.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : "Gagal masuk. Periksa kredensial Anda.";
        setError(message);
        toast.error(message);
        return;
      }
      if (mode === "register") {
        setMode("login");
        setPassword("");
        const responseMessage =
          typeof data?.message === "string" ? data.message : undefined;
        setNotice(responseMessage || "Jika alamat dapat digunakan, akun siap. Silakan masuk.");
        toast.success("Permintaan pendaftaran diproses", { description: responseMessage });
        return;
      }
      toast.success("Berhasil masuk");
      router.push("/");
    } catch {
      const message = "Tidak dapat menghubungi server. Periksa koneksi Anda.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Briefcase className="w-9 h-9 mb-3 mx-auto text-primary" />
          <h1 className="text-2xl font-bold page-title text-foreground">
            JobSpace
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 font-serif">
            Personal career workspace — Notion-style job tracker
          </p>
        </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <Tabs value={mode} onValueChange={(value) => { setMode(value as "login" | "register"); setError(null); setNotice(null); }}>
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger
                value="login"
                style={mode === "login" ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" } : undefined}
                className="transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Masuk
              </TabsTrigger>
              <TabsTrigger
                value="register"
                style={mode === "register" ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" } : undefined}
                className="transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Daftar
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form noValidate onSubmit={submit} className="space-y-3.5">
            {mode === "register" && (
              <div>
                <Label htmlFor="auth-name" className="mb-1 block text-xs">Nama</Label>
                <Input
                  id="auth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama kamu"
                  maxLength={120}
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <Label htmlFor="auth-email" className="mb-1 block text-xs">Email</Label>
              <Input
                id="auth-email"
                type="email"
                required
                maxLength={320}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                  aria-invalid={Boolean(error)}
              />
            </div>

            <div>
              <Label htmlFor="auth-password" className="mb-1 block text-xs">Kata Sandi</Label>
              <Input
                id="auth-password"
                type="password"
                required
                maxLength={200}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                minLength={mode === "register" ? 8 : 1}
                aria-invalid={Boolean(error)}
              />
            </div>

            {error && (
              <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-900/50 rounded-lg px-3 py-2">
                {notice}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === "login" ? "Masuk ke Workspace" : "Buat Akun"}
              {!loading && <ArrowRight className="w-3.5 h-3.5" />}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
