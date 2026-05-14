import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // After login, go back to where the user was trying to go (or home)
  const from = (location.state as any)?.from?.pathname ?? "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);

        const res = await fetch(`/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Incorrect username or password");
        }

        const data = await res.json();
        login(data.access_token, data.user_id, data.username);
        toast({ title: `Welcome back, ${data.username}! 👋` });
        navigate(from, { replace: true });
      } else {
        if (password.length < 8) throw new Error("Password must be at least 8 characters");

        const res = await fetch(`/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Registration failed");
        }

        toast({
          title: "Account created! 🎉",
          description: "You can now sign in with your credentials.",
        });
        setIsLogin(true);
        setPassword("");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1b3e] p-4">
      {/* Background decorative circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-white/10 bg-white/5 backdrop-blur-xl text-white shadow-2xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            {isLogin ? "Welcome back" : "Create an account"}
          </CardTitle>
          <CardDescription className="text-white/50">
            {isLogin
              ? "Sign in to access your personalised AI product assistant"
              : "Sign up to start getting smart product recommendations"}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white/70" htmlFor="username">Username</label>
              <Input
                id="username"
                required
                autoComplete="username"
                placeholder="johndoe"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
              />
            </div>

            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70" htmlFor="email">Email</label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-white/70" htmlFor="password">Password</label>
              <Input
                id="password"
                type="password"
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder={isLogin ? "••••••••" : "Min. 8 characters"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11 transition-all"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isLogin ? "Signing in…" : "Creating account…"}</>
              ) : (
                isLogin ? "Sign In" : "Create Account"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setIsLogin(!isLogin); setPassword(""); }}
              className="text-white/50 hover:text-white hover:bg-white/10 text-sm"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
