import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  generateRSAKeyPair, 
  exportPublicKey, 
  exportPrivateKey,
  storePrivateKey,
  retrievePrivateKey,
  importPrivateKey
} from '@/lib/crypto';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  privateKey: CryptoKey | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        
        // Load private key when user logs in
        if (session?.user && event === 'SIGNED_IN') {
          setTimeout(() => {
            loadPrivateKey(session.user.id);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setPrivateKey(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        loadPrivateKey(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadPrivateKey = async (userId: string) => {
    try {
      const storedKey = await retrievePrivateKey(userId);
      if (storedKey) {
        const key = await importPrivateKey(storedKey);
        setPrivateKey(key);
        console.log('Private key loaded successfully');
      } else {
        console.log('No private key found for user');
      }
    } catch (error) {
      console.error('Error loading private key:', error);
      toast({
        title: 'Encryption Error',
        description: 'Failed to load encryption keys. You may need to sign up again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    try {
      setLoading(true);
      
      // Generate RSA key pair
      console.log('Generating RSA key pair...');
      const keyPair = await generateRSAKeyPair();
      const publicKeyPem = await exportPublicKey(keyPair.publicKey);
      const privateKeyStr = await exportPrivateKey(keyPair.privateKey);

      const redirectUrl = `${window.location.origin}/`;
      
      // Sign up with metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            username,
            public_key: publicKeyPem,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Store private key in IndexedDB
        await storePrivateKey(data.user.id, privateKeyStr);
        console.log('Keys generated and stored successfully');
        
        toast({
          title: 'Account created!',
          description: 'Your encryption keys have been generated.',
        });
      }

      return { error: null };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
      });

      return { error: null };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      setPrivateKey(null);
      
      toast({
        title: 'Signed out',
        description: 'You have been signed out successfully.',
      });
    } catch (error) {
      console.error('Sign out error:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        privateKey,
        signUp,
        signIn,
        signOut,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
