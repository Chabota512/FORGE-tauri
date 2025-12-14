import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Terminal, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (password.length < 6) {
      toast({
        title: "INVALID PASSWORD",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await signup(email, password, name);
      toast({
        title: "ACCOUNT INITIALIZED",
        description: "Welcome to Forge. System ready.",
      });
    } catch (error) {
      toast({
        title: "INITIALIZATION FAILED",
        description: error instanceof Error ? error.message : "Could not create account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0d0d0d]" />
        <div className="absolute inset-0 bg-gradient-to-br from-lime-950/40 via-emerald-950/30 to-green-950/40" />
        <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-lime-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <header className="p-4">
        <Link href="/landing">
          <Button variant="ghost" className="text-muted-foreground hover:text-primary uppercase tracking-wider text-sm" data-testid="button-back-landing">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Base
          </Button>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary text-black mb-4 font-display font-bold skew-x-[-10deg] transition-all duration-200">
              <span className="skew-x-[10deg] text-lg">F</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2 uppercase tracking-widest">Initialize Account</h1>
            <p className="text-muted-foreground font-mono text-sm">CREATE YOUR FORGE IDENTITY</p>
          </div>

          <div className="tech-panel p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-muted-foreground uppercase tracking-wider text-xs">Callsign</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono"
                    required
                    data-testid="input-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground uppercase tracking-wider text-xs">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono"
                    required
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground uppercase tracking-wider text-xs">Access Key</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground font-mono"
                    required
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
                disabled={isLoading}
                data-testid="button-submit-signup"
              >
                {isLoading ? "INITIALIZING..." : "INITIALIZE ACCOUNT"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-muted-foreground font-mono text-sm">
                EXISTING USER?{" "}
                <Link href="/login" className="text-primary hover:text-primary/80 font-bold uppercase" data-testid="link-login">
                  Access Terminal
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
