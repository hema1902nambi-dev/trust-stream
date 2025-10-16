import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Shield, LogOut, Users, Send, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { encryptMessage, decryptMessage, importPublicKey } from '@/lib/crypto';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface Profile {
  id: string;
  username: string;
  public_key: string;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  iv: string;
  encrypted_key: string;
  created_at: string;
  sender?: Profile;
  decrypted?: string;
}

export default function Chat() {
  const { user, signOut, privateKey, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchUsers();
      subscribeToMessages();
    }
  }, [user]);

  useEffect(() => {
    if (selectedUser && user) {
      fetchMessages(selectedUser.id);
    }
  }, [selectedUser, user]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user!.id);

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    }
  };

  const fetchMessages = async (otherUserId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user!.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch sender profiles separately
      const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', senderIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Decrypt messages
      const decryptedMessages = await Promise.all(
        (data || []).map(async (msg) => {
          try {
            let decrypted = undefined;
            if (msg.recipient_id === user!.id && privateKey) {
              decrypted = await decryptMessage(
                msg.ciphertext,
                msg.iv,
                msg.encrypted_key,
                privateKey
              );
            }
            return { 
              ...msg, 
              sender: profileMap.get(msg.sender_id),
              decrypted 
            };
          } catch (error) {
            console.error('Failed to decrypt message:', error);
            return { 
              ...msg, 
              sender: profileMap.get(msg.sender_id),
              decrypted: '[Decryption failed]' 
            };
          }
        })
      );

      setMessages(decryptedMessages as Message[]);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive',
      });
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          
          // Only process if it's relevant to current conversation
          if (selectedUser && 
              ((newMsg.sender_id === selectedUser.id && newMsg.recipient_id === user!.id) ||
               (newMsg.sender_id === user!.id && newMsg.recipient_id === selectedUser.id))) {
            
            // Fetch sender profile
            const { data: senderData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newMsg.sender_id)
              .single();

            let decrypted = undefined;
            if (newMsg.recipient_id === user!.id && privateKey) {
              try {
                decrypted = await decryptMessage(
                  newMsg.ciphertext,
                  newMsg.iv,
                  newMsg.encrypted_key,
                  privateKey
                );
              } catch (error) {
                console.error('Failed to decrypt real-time message:', error);
                decrypted = '[Decryption failed]';
              }
            }

            setMessages((prev) => [...prev, { ...newMsg, sender: senderData, decrypted }]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || !privateKey) return;

    try {
      setSending(true);

      // Import recipient's public key
      const recipientPublicKey = await importPublicKey(selectedUser.public_key);

      // Encrypt message
      const { ciphertext, iv, encryptedKey } = await encryptMessage(
        newMessage,
        recipientPublicKey
      );

      // Send to database
      const { error } = await supabase.from('messages').insert({
        sender_id: user!.id,
        recipient_id: selectedUser.id,
        ciphertext,
        iv,
        encrypted_key: encryptedKey,
      });

      if (error) throw error;

      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <p>Loading...</p>
    </div>;
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-primary p-2 rounded-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">EncrypTIA</h1>
              <p className="text-xs text-muted-foreground">End-to-end encrypted</p>
            </div>
          </div>
          
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Users Sidebar */}
        <aside className="w-64 border-r border-border bg-card">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users
            </h2>
          </div>
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="p-2 space-y-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedUser?.id === u.id
                      ? 'bg-secondary'
                      : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gradient-primary text-white text-sm">
                        {u.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{u.username}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Encrypted
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col">
          {selectedUser ? (
            <>
              <div className="border-b border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {selectedUser.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{selectedUser.username}</h3>
                      <p className="text-xs text-muted-foreground">Online</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="w-3 h-3" />
                    E2E Encrypted
                  </Badge>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOwn = msg.sender_id === user.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            isOwn
                              ? 'bg-gradient-primary text-white'
                              : 'bg-secondary text-secondary-foreground'
                          }`}
                        >
                  <p className="text-sm break-words">
                    {isOwn ? (msg.decrypted || newMessage) : (msg.decrypted || '[Encrypted]')}
                  </p>
                          <p className={`text-xs mt-1 ${isOwn ? 'text-white/70' : 'text-muted-foreground'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="border-t border-border bg-card p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    disabled={sending}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="bg-gradient-primary"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Messages are encrypted end-to-end
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-4">
              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="bg-muted p-6 rounded-full">
                    <Shield className="w-12 h-12 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold">Select a user to start chatting</h3>
                <p className="text-muted-foreground max-w-md">
                  All messages are end-to-end encrypted using RSA-4096 and AES-256-GCM.
                  Your private keys never leave your device.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
