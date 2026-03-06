'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { flattenHandbook, HandbookNode } from '@/lib/handbook';
import { Send, Bot, User, Loader2, Info, Sparkles } from 'lucide-react';
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

export function SearchExpert({ 
  handbookData, 
  onSourceClick 
}: { 
  handbookData: HandbookNode[],
  onSourceClick: (source: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const handbookContext = useMemo(() => {
    return flattenHandbook(handbookData)
      .map(item => `Heading: ${item.path}\nContent: ${item.content}`)
      .join('\n\n');
  }, [handbookData]);

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
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error('MISSING_API_KEY');
      }

      if (!handbookContext || handbookContext.length < 10) {
        throw new Error('HANDBOOK_NOT_LOADED');
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Handbook Context:\n${handbookContext}\n\nUser Question: ${userMsg}` }
            ]
          }
        ],
        config: {
          systemInstruction: `You are the Fine Airport Parking AI Assistant. Your goal is to answer employee questions accurately and professionally based ONLY on the provided handbook text.

STRICT RULES:
1. Only answer based on the provided handbook text.
2. If the answer is not in the text, say: 'I cannot find that specific policy in the handbook. Please contact HR for clarification.'
3. Use a helpful, corporate tone.
4. Do not make up policies or benefits.
5. Never use the em dash (—) in your responses. Use a standard hyphen (-) if needed.
6. At the end of your response, you MUST provide the source heading in this exact format: [[SOURCE: Heading Name]].`,
        }
      });

      let fullText = '';
      const aiMsgId = Date.now().toString();
      
      // Add initial empty AI message
      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '' }]);

      let isFirstChunk = true;

      for await (const chunk of streamResponse) {
        if (isFirstChunk) {
          setIsLoading(false);
          isFirstChunk = false;
        }
        const c = chunk as GenerateContentResponse;
        const text = c.text;
        if (text) {
          fullText += text;
          
          // Parse source if it exists in the accumulated text
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
      }
    } catch (error: any) {
      console.error('Error calling Gemini:', error);
      let errorMessage = 'Sorry, I encountered an error while searching the handbook. Please try again.';
      
      if (error.message === 'MISSING_API_KEY') {
        errorMessage = 'The AI Assistant is not yet configured. Please ensure the Gemini API key is set in the environment variables.';
      } else if (error.message === 'HANDBOOK_NOT_LOADED') {
        errorMessage = 'The handbook data is not yet loaded. Please wait a moment or refresh the page.';
      } else if (error.message?.includes('API_KEY_INVALID')) {
        errorMessage = 'The provided API key is invalid. Please check your configuration.';
      } else if (error.message) {
        // Try to parse JSON error from Google
        try {
          const errorStr = error.message.includes('Error: ') ? error.message.split('Error: ')[1] : error.message;
          const parsed = JSON.parse(errorStr);
          const innerError = typeof parsed.error === 'string' ? JSON.parse(parsed.error) : parsed.error;
          
          if (innerError?.code === 429 || innerError?.error?.code === 429) {
            errorMessage = 'The AI Assistant has reached its daily limit for the free testing tier. For the HR presentation, it is recommended to upgrade to a "Pay-as-you-go" plan in Google AI Studio to allow unlimited questions.';
          } else {
            errorMessage = `AI Error: ${innerError?.message || innerError?.error?.message || error.message}`;
          }
        } catch (e) {
          errorMessage = `Service Error: ${error.message}`;
        }
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        content: errorMessage
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[600px]">
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
