import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Calendar, 
  Target, 
  BookOpen, 
  BarChart3, 
  Zap,
  ArrowRight,
  Clock,
  Brain,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Calendar,
    title: "AI-Powered Scheduling",
    description: "Get personalized daily schedules that adapt to your energy levels, deadlines, and learning patterns.",
  },
  {
    icon: Target,
    title: "Mission-Based Learning",
    description: "Break down your goals into achievable daily missions with clear proof requirements and progress tracking.",
  },
  {
    icon: BookOpen,
    title: "Knowledge Management",
    description: "Organize your courses, notes, and learning materials in one central hub with AI-powered insights.",
  },
  {
    icon: BarChart3,
    title: "Progress Analytics",
    description: "Visualize your growth with detailed statistics, streaks, and achievements to stay motivated.",
  },
];

const benefits = [
  { icon: Clock, text: "SAVE HOURS OF PLANNING" },
  { icon: Brain, text: "LEARN MORE EFFECTIVELY" },
  { icon: Trophy, text: "ACHIEVE YOUR GOALS" },
  { icon: Zap, text: "STAY MOTIVATED DAILY" },
];

export default function Landing() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0d0d0d]" />
        <div className="absolute inset-0 bg-gradient-to-br from-lime-950/40 via-emerald-950/30 to-green-950/40" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-500/5 rounded-full blur-3xl" />
      </div>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0d0d0d]/90 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary text-black flex items-center justify-center font-display font-bold skew-x-[-10deg]">
                <span className="skew-x-[10deg]">F</span>
              </div>
              <span className="text-xl font-bold text-foreground uppercase tracking-widest">Forge</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="text-muted-foreground hover:text-primary uppercase tracking-wider text-sm" data-testid="button-login-header">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider text-sm" data-testid="button-signup-header">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main>
        <section className="pt-32 pb-20 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 border border-primary/30 text-primary text-sm mb-8 uppercase tracking-wider font-mono bg-[#a7eb423d]">
                <Zap className="w-4 h-4" />
                AI-Powered Learning System
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight uppercase tracking-wider">
                Master Your Day,
                <br />
                <span className="text-primary">
                  Achieve Your Goals
                </span>
              </h1>
              
              <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 font-mono text-[#999999]">
                Forge transforms how you learn and grow. Get personalized schedules, 
                track your missions, and build knowledge that lasts.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/signup">
                  <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6 h-auto uppercase tracking-wider font-bold" data-testid="button-get-started">
                    Initialize System
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="border-border text-muted-foreground hover:bg-secondary hover:text-primary text-lg px-8 py-6 h-auto uppercase tracking-wider" data-testid="button-sign-in">
                    Access Terminal
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-16 flex flex-wrap items-center justify-center gap-8"
            >
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
                  <benefit.icon className="w-5 h-5 text-primary" />
                  <span className="text-[#c7c7c7]">{benefit.text}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 uppercase tracking-wider">
                System Modules
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-mono">
                Powerful features designed to help you learn smarter, stay organized, and reach your full potential.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="tech-panel p-6 hover:border-primary/50 transition-all duration-300"
                  data-testid={`card-feature-${index}`}
                >
                  <div className="inline-flex p-3 bg-primary/20 border border-primary/30 mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2 uppercase tracking-wider">{feature.title}</h3>
                  <p className="text-muted-foreground font-mono text-sm">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-4 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-lime-950/10 to-transparent" />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6 uppercase tracking-wider">
                Ready to Initialize?
              </h2>
              <p className="text-muted-foreground text-lg mb-8 font-mono">
                Join Forge today and start building the habits that lead to success. 
                Your future self will thank you.
              </p>
              <Link href="/signup">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-10 py-6 h-auto uppercase tracking-wider font-bold" data-testid="button-get-started-bottom">
                  Begin Protocol
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>
      </main>
      <footer className="py-6 px-4 border-t border-border bg-card/50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-primary text-black flex items-center justify-center font-display font-bold skew-x-[-10deg]">
              <span className="skew-x-[10deg] text-sm">F</span>
            </div>
            <span className="text-muted-foreground font-mono uppercase tracking-wider text-left text-[12px]">FORGE v3.1</span>
          </div>
          <p className="text-muted-foreground text-sm font-mono uppercase tracking-wider">
            Built for learners who demand more
          </p>
        </div>
      </footer>
    </div>
  );
}
