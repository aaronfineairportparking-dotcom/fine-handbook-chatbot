'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Info } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';

type Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  source?: string;
};

const initialMessage: Message = {
  id: 'welcome',
  role: 'ai',
  content: 'Hello! I am the Fine Airport Parking AI Assistant. How can I help you with the employee handbook today?'
};

const STARTER_QUESTIONS = [
  'What is the PTO policy?',
  'What is the dress code?',
  'How does the drug testing policy work?',
  'What are the rules on harassment?',
];

export function SearchExpert({
  onSourceClick
}: {
  onSourceClick: (source: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  const resetChat = () => {
    setMessages([initialMessage]);
    setInput('');
    setIsLoading(false);
    sessionIdRef.current = crypto.randomUUID();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setMessages([initialMessage]);
        sessionIdRef.current = crypto.randomUUID();
      }, 10 * 60 * 1000); // 10 minutes
    };

    resetTimer();
    
    const handleActivity = () => resetTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let fullText = '';
      const aiMsgId = Date.now().toString();

      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '' }]);

      let isFirstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (isFirstChunk) {
          setIsLoading(false);
          isFirstChunk = false;
        }

        const text = decoder.decode(value, { stream: true });
        fullText += text;

        let displayContent = fullText;
        let source = '';

        const sourceMatch = fullText.match(/\[\[SOURCE:\s*(.*?)\]\]/);
        if (sourceMatch) {
          displayContent = fullText.replace(sourceMatch[0], '').trim();
          source = sourceMatch[1].trim();
        }

        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: displayContent, source: source || m.source }
            : m
        ));
      }
    } catch (error: any) {
      console.error('Error calling chat API:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        content: 'Sorry, I had trouble answering that. Please try rephrasing your question or start a new chat.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      {messages.length > 1 && (
        <div className="flex justify-end px-6 pt-4">
          <button
            onClick={resetChat}
            className="text-xs font-bold uppercase tracking-wider text-[#000000]/60 hover:text-[#000000] bg-[#E5E5E5]/50 hover:bg-[#E5E5E5] px-3 py-1.5 rounded-lg transition-all"
          >
            New Chat
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id}
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'user' ? 'bg-[#000000] text-[#FFFFFF]' : 'bg-[#FFC403] text-[#000000]'
            }`}>
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-4 rounded-2xl ${
                msg.role === 'user' 
                  ? 'bg-[#000000] text-[#FFFFFF] rounded-tr-sm' 
                  : 'bg-[#E5E5E5]/30 text-[#000000] rounded-tl-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="leading-relaxed whitespace-pre-wrap font-sans font-medium">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed prose-p:mb-4 last:prose-p:mb-0 prose-headings:my-2 prose-ul:my-2 prose-li:my-0 font-medium">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.source && (
                <button 
                  onClick={() => onSourceClick(msg.source!)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-[#000000] uppercase tracking-wider bg-[#FFC403]/10 px-3 py-1.5 rounded-md border border-[#FFC403] hover:bg-[#FFC403]/20 transition-all cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  Source: {msg.source}
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {messages.length === 1 && !isLoading && (
          <div className="flex flex-wrap gap-2 pl-12">
            {STARTER_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setInput(q);
                  const form = document.querySelector('form');
                  if (form) {
                    setInput(q);
                    setTimeout(() => form.requestSubmit(), 50);
                  }
                }}
                className="text-xs font-semibold text-[#000000] bg-[#FFC403]/15 hover:bg-[#FFC403]/30 border border-[#FFC403]/40 px-3 py-2 rounded-xl transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4"
          >
            <div className="w-8 h-8 rounded-full bg-[#FFC403] text-[#000000] flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="p-4 rounded-2xl bg-[#E5E5E5]/30 text-[#000000] rounded-tl-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#000000]/40" />
              <span className="text-sm text-[#000000]/60 font-medium">Searching handbook...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[#E5E5E5] bg-[#FFFFFF]">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the handbook..."
            className="w-full pl-4 pr-12 py-4 bg-[#E5E5E5]/30 border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC403]/20 focus:border-[#FFC403] transition-all font-sans font-medium"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2.5 bg-[#FFC403] text-[#000000] rounded-lg disabled:opacity-50 disabled:bg-[#E5E5E5] transition-all shadow-sm"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
