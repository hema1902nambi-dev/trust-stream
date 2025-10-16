import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Lock, Key, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/chat');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <p>Loading...</p>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
          <div className="bg-gradient-primary p-6 rounded-3xl shadow-secure">
            <Shield className="w-20 h-20 text-white" />
          </div>
          
          <div className="space-y-4 max-w-3xl">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              EncrypTIA
            </h1>
            <p className="text-2xl text-muted-foreground">
              End-to-End Encrypted Messaging
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Secure communication powered by RSA-4096 and AES-256-GCM encryption.
              Your messages, your privacy. Zero-knowledge architecture ensures your data
              remains yours alone.
            </p>
          </div>

          <div className="flex gap-4">
            <Button
              size="lg"
              className="bg-gradient-primary hover:opacity-90 text-lg px-8"
              onClick={() => navigate('/auth')}
            >
              Get Started
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl">
            <div className="bg-card p-6 rounded-xl border border-border shadow-card space-y-3">
              <div className="flex justify-center">
                <div className="bg-secure/10 p-3 rounded-lg">
                  <Lock className="w-6 h-6 text-secure" />
                </div>
              </div>
              <h3 className="font-semibold text-lg">End-to-End Encrypted</h3>
              <p className="text-sm text-muted-foreground">
                Messages are encrypted on your device before sending. Only you and your
                recipient can read them.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border shadow-card space-y-3">
              <div className="flex justify-center">
                <div className="bg-accent/10 p-3 rounded-lg">
                  <Key className="w-6 h-6 text-accent" />
                </div>
              </div>
              <h3 className="font-semibold text-lg">Your Keys, Your Control</h3>
              <p className="text-sm text-muted-foreground">
                Encryption keys are generated locally and stored securely on your device.
                They never touch our servers.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border shadow-card space-y-3">
              <div className="flex justify-center">
                <div className="bg-success/10 p-3 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-success" />
                </div>
              </div>
              <h3 className="font-semibold text-lg">Real-Time Messaging</h3>
              <p className="text-sm text-muted-foreground">
                Instant encrypted message delivery with WebSocket technology for seamless
                conversations.
              </p>
            </div>
          </div>

          <div className="mt-16 bg-muted/50 p-8 rounded-2xl max-w-2xl border border-border">
            <h2 className="text-2xl font-bold mb-4">Built for SDG 16</h2>
            <p className="text-muted-foreground">
              <strong>Peace, Justice, and Strong Institutions</strong> — EncrypTIA promotes
              secure digital communication as a fundamental right. By providing accessible
              end-to-end encryption, we support freedom of expression and protect privacy
              in the digital age.
            </p>
          </div>

          <div className="mt-8 text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span>Protected by military-grade encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
