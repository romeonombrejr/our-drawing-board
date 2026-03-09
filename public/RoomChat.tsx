import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ChatMessage {
  userId: string;
  name: string;
  message: string;
  timestamp: number;
}

interface ChatProps {
  userId: string;
  roomCode: string | null;
  socket: any;
  enabled: boolean;
  userName: string;
  setUserName: (name: string) => void;
}

export default function RoomChat({ userId, roomCode, socket, enabled, userName, setUserName }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
//   console.log('Chat component rendered with roomCode:', roomCode, 'and userName:', userName);
  // const [showNameDialog, setShowNameDialog] = useState(false);

  // Load chat history from server on join
  useEffect(() => {
    if (!socket || !roomCode) return;
    const handler = (history: ChatMessage[]) => {
      setMessages(history);
    };
    socket.on('chatHistory', handler);
    return () => { socket.off('chatHistory', handler); };
  }, [socket, roomCode]);

  // Save chat history to localStorage (optional, for offline persistence)
  useEffect(() => {
    if (roomCode) {
      localStorage.setItem(`chat_${roomCode}` , JSON.stringify(messages));
    }
  }, [messages, roomCode]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for incoming chat messages
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    };
    socket.on('chatMessage', handler);
    return () => { socket.off('chatMessage', handler); };
  }, [socket]);

  // Send message
  function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || !roomCode || !userName) return;
    const msg: ChatMessage = {
      userId,
      name: userName,
      message: input.trim(),
      timestamp: Date.now(),
    };
    socket.emit('chatMessage', { ...msg, room: roomCode });
    setMessages(prev => [...prev, msg]);
    setInput('');
  }

  // Set name and persist per room
  // function handleSetName(e: React.FormEvent) {
  //   e.preventDefault();
  //   if (!nameInput.trim() || !roomCode) return;
  //   setUserName(nameInput.trim());
  //   localStorage.setItem(`userName_${roomCode}`, nameInput.trim());
  //   setShowNameDialog(false);
  // }


  return (
    <div className='bg-card' style={{ borderRadius: 8, boxShadow: '0 2px 8px #0006', padding: 16, color: '#fff' }}>
      {/* Dialog removed, name is now set at room join */}
      <div className='bg-neutral-800' style={{ height: 420, overflowY: 'auto', borderRadius: 6, padding: 8, marginBottom: 8, border: '1px solid #333' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: msg.userId === userId ? 'flex-end' : 'flex-start',
            marginBottom: 4
          }}>
            <div style={{
              background: msg.userId === userId ? '#0f08' : '#fff2',
              color: msg.userId === userId ? '#fff' : '#fff',
              borderRadius: 8,
              padding: '6px 12px',
              maxWidth: '70%',
              textAlign: msg.userId === userId ? 'right' : 'left',
              alignSelf: msg.userId === userId ? 'flex-end' : 'flex-start',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: msg.userId === userId ? '#0f0' : '#aaa' }}>{msg.name}</div>
              <div style={{ fontSize: 15 }}>{msg.message}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <Input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 4, border: 'none' }}
          disabled={!enabled ? true : false}
          className='text-black dark:text-white'
        />
        <Button type="submit" disabled={!userName || !input.trim() || !enabled}>
          Send
        </Button>
      </form>
    </div>
  );
}
