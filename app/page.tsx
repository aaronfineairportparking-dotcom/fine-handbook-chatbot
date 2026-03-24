'use client';

import { useState, useEffect } from 'react';
import { ManualExplorer } from '@/components/ManualExplorer';
import { SearchExpert } from '@/components/SearchExpert';
import { Book, Search, RefreshCw, CheckCircle2, Bot } from 'lucide-react';
import { fallbackHandbookTree, HandbookNode } from '@/lib/handbook';

export default function Page() {
  const [activeTab, setActiveTab] = useState<'manual' | 'search'>('search');
  const [handbookData, setHandbookData] = useState<HandbookNode[]>(fallbackHandbookTree);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [manualPath, setManualPath] = useState<HandbookNode[]>([]);

  // Load saved URL on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('handbook_sync_url');
    if (savedUrl) {
      fetchLiveHandbook(savedUrl);
    }
  }, []);

  const fetchLiveHandbook = async (url: string) => {
    if (!url) return;
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setHandbookData(data);
        setSyncStatus('success');
      } else {
        throw new Error('Invalid data format');
      }
    } catch (error) {
      console.error('Failed to sync handbook:', error);
      setSyncStatus('error');
      setHandbookData(fallbackHandbookTree);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSourceClick = (sourceTitle: string) => {
    let bestMatch: HandbookNode[] | null = null;
    let maxScore = 0;

    const findNodePath = (nodes: HandbookNode[], currentPath: HandbookNode[] = []) => {
      for (const node of nodes) {
        const path = [...currentPath, node];
        const fullPathString = path.map(n => n.title).join(' > ').toLowerCase();
        const target = sourceTitle.toLowerCase();
        
        let score = 0;
        if (fullPathString === target) {
          score = 100;
        } else if (fullPathString.endsWith(target) || target.endsWith(node.title.toLowerCase())) {
          score = 50 + path.length;
        } else if (fullPathString.includes(target) || target.includes(node.title.toLowerCase())) {
          score = 10 + path.length;
        }

        if (score > maxScore) {
          maxScore = score;
          bestMatch = path;
        }
        
        if (node.children) {
          findNodePath(node.children, path);
        }
      }
    };

    findNodePath(handbookData);

    if (bestMatch) {
      setManualPath(bestMatch);
      setActiveTab('manual');
    }
  };

  return (
    <div className="min-h-screen bg-[#E5E5E5] text-[#000000] font-sans">
      <header className="bg-[#000000] border-b border-[#000000] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center justify-between">
          <h1 className="text-2xl font-black uppercase italic text-[#FFFFFF]">
            Fine Airport Parking Handbook
          </h1>
          <div className="flex items-center gap-4">
            {syncStatus === 'success' && (
              <span className="text-[10px] font-bold text-[#000000] uppercase tracking-wider flex items-center gap-1 bg-[#FFC403] px-2 py-1 rounded">
                <CheckCircle2 className="w-3 h-3" /> Live Sync
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex space-x-1 bg-[#000000]/10 p-1 rounded-xl mb-8 w-fit">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-sans font-semibold uppercase tracking-tight transition-all ${
              activeTab === 'search' ? 'bg-[#FFC403] text-[#000000] shadow-md' : 'text-[#000000]/40 hover:text-[#000000]'
            }`}
          >
            <Bot className="w-4 h-4" />
            Chatbot
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-sans font-semibold uppercase tracking-tight transition-all ${
              activeTab === 'manual' ? 'bg-[#FFC403] text-[#000000] shadow-md' : 'text-[#000000]/40 hover:text-[#000000]'
            }`}
          >
            <Search className="w-4 h-4" />
            Manual Explorer
          </button>
        </div>

        <div className="bg-[#FFFFFF] rounded-2xl shadow-xl border border-[#000000]/5 overflow-hidden min-h-[600px] relative">
          {isSyncing && (
            <div className="absolute inset-0 bg-[#FFFFFF]/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="flex items-center gap-2 text-[#000000] font-bold bg-[#FFC403] px-6 py-3 rounded-full shadow-2xl border border-[#FFC403]">
                <RefreshCw className="w-5 h-5 animate-spin" />
                SYNCING HANDBOOK...
              </div>
            </div>
          )}
          <div className={activeTab === 'search' ? 'block h-full' : 'hidden'}>
            <SearchExpert onSourceClick={handleSourceClick} />
          </div>
          <div className={activeTab === 'manual' ? 'block h-full' : 'hidden'}>
            <ManualExplorer 
              handbookData={handbookData} 
              path={manualPath} 
              setPath={setManualPath} 
              isVisible={activeTab === 'manual'}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
