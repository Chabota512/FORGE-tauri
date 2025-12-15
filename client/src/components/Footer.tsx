export default function Footer() {
  return (
    <footer className="border-t border-border bg-background/90 backdrop-blur-sm mt-auto">
      <style>{`
        @keyframes neonGlow {
          0%, 100% {
            text-shadow: 
              0 0 8px rgba(255, 255, 255, 0.51),
              0 0 16px rgba(190, 242, 100, 0.45),
              0 0 24px rgba(190, 242, 100, 0.31),
              0 0 32px rgba(255, 255, 255, 0.26),
              0 0 40px rgba(190, 242, 100, 0.20);
          }
          50% {
            text-shadow: 
              0 0 8px rgba(255, 255, 255, 0.26),
              0 0 16px rgba(190, 242, 100, 0.20),
              0 0 24px rgba(190, 242, 100, 0.13),
              0 0 32px rgba(255, 255, 255, 0.10),
              0 0 40px rgba(190, 242, 100, 0.07);
          }
        }
        
        @keyframes neonGlowBright {
          0%, 100% {
            text-shadow: 
              0 0 8px rgba(255, 255, 255, 0.35),
              0 0 16px rgba(190, 242, 100, 0.31),
              0 0 24px rgba(190, 242, 100, 0.22),
              0 0 32px rgba(255, 255, 255, 0.18),
              0 0 40px rgba(190, 242, 100, 0.13);
          }
          50% {
            text-shadow: 
              0 0 8px rgba(255, 255, 255, 0.16),
              0 0 16px rgba(190, 242, 100, 0.13),
              0 0 24px rgba(190, 242, 100, 0.09),
              0 0 32px rgba(255, 255, 255, 0.07),
              0 0 40px rgba(190, 242, 100, 0.05);
          }
        }

        .neon-glow {
          animation: neonGlow 4s ease-in-out infinite;
        }

        .neon-glow-bright {
          animation: neonGlowBright 4s ease-in-out infinite;
        }
      `}</style>
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-[0.25em]">
            <span className="neon-glow-bright text-[#a3a3a3e6]">FORGE v3.1 © 2025 </span>
            <span className="neon-glow text-[#a3a3a3e6]">Bluegold</span>
            <span className="neon-glow-bright">. All rights reserved.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
