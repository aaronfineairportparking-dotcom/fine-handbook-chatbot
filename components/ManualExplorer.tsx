'use client';

import { useRef, useEffect } from 'react';
import { HandbookNode } from '@/lib/handbook';
import { ChevronRight, FileText, Folder, Download } from 'lucide-react';
import { motion } from 'motion/react';
import { jsPDF } from 'jspdf';

export function ManualExplorer({ 
  handbookData,
  path,
  setPath,
  isVisible
}: { 
  handbookData: HandbookNode[],
  path: HandbookNode[],
  setPath: (path: HandbookNode[]) => void,
  isVisible: boolean
}) {
  const currentNode = path.length > 0 ? path[path.length - 1] : null;
  const children = currentNode ? currentNode.children : handbookData;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [path, isVisible]);

  const handleExportPDF = () => {
    if (!currentNode) return;
    const doc = new jsPDF();
    
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxLineWidth = pageWidth - margin * 2;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(currentNode.title, margin, margin);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    const textLines = doc.splitTextToSize(currentNode.content || '', maxLineWidth);
    let y = margin + 10;
    
    for (let i = 0; i < textLines.length; i++) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(textLines[i], margin, y);
      y += 7;
    }
    
    doc.save(`${currentNode.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

  const handleNodeClick = (node: HandbookNode) => {
    setPath([...path, node]);
  };

  const handleBreadcrumbClick = (index: number) => {
    setPath(path.slice(0, index + 1));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header / Breadcrumbs */}
      <div className="p-4 border-b border-[#E5E5E5] bg-[#E5E5E5]/20 flex items-center gap-2 text-sm flex-wrap">
        <button 
          onClick={() => setPath([])}
          className="text-[#000000]/60 hover:text-[#000000] font-bold uppercase tracking-wider transition-colors"
        >
          Handbook
        </button>
        {path.map((node, index) => (
          <div key={node.id} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-[#000000]/30" />
            <button
              onClick={() => handleBreadcrumbClick(index)}
              className={`font-bold uppercase tracking-wider transition-colors ${
                index === path.length - 1 ? 'text-[#000000]' : 'text-[#000000]/60 hover:text-[#000000]'
              }`}
            >
              {node.title}
            </button>
          </div>
        ))}
      </div>

      <div 
        ref={scrollContainerRef}
        className="p-6 flex-1 overflow-y-auto"
      >
        {currentNode?.content && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-[#E5E5E5]/30 rounded-xl border border-[#E5E5E5] relative"
          >
            <h3 className="text-lg font-bold text-[#000000] mb-3 uppercase tracking-tight">{currentNode.title}</h3>
            <div className="text-[#000000]/80 leading-relaxed mb-6 font-sans font-medium whitespace-pre-wrap">
              {currentNode.content.split('\n').map((line, i) => {
                const trimmed = line.trim();
                // Detect bullet points (various bullet characters)
                const bulletRegex = /^([·•●■\-\*])\s+/;
                const match = trimmed.match(bulletRegex);
                
                if (match) {
                  const bullet = match[1];
                  const content = trimmed.replace(bulletRegex, '');
                  return (
                    <div key={i} className="flex gap-3 mb-1 items-start">
                      <span className="shrink-0 w-4 text-center mt-0.5 text-[#000000]/60">{bullet}</span>
                      <span className="flex-1">{content}</span>
                    </div>
                  );
                }
                
                return <div key={i} className="mb-1">{line || '\u00A0'}</div>;
              })}
            </div>
            
            <div className="flex justify-end border-t border-[#E5E5E5] pt-4">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2 bg-[#FFC403] text-[#000000] text-xs font-bold uppercase tracking-wider rounded-lg border border-[#FFC403] hover:opacity-90 transition-all shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export to PDF
              </button>
            </div>
          </motion.div>
        )}

        {children && children.length > 0 && (
          <div className="grid gap-3">
            {children.map((node) => (
              <button
                key={node.id}
                onClick={() => handleNodeClick(node)}
                className="flex items-center justify-between p-5 rounded-xl border border-[#E5E5E5] hover:border-[#FFC403] hover:bg-[#FFC403]/5 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  {node.children ? (
                    <Folder className="w-5 h-5 text-[#000000]/40 group-hover:text-[#FFC403]" />
                  ) : (
                    <FileText className="w-5 h-5 text-[#000000]/40 group-hover:text-[#FFC403]" />
                  )}
                  <span className="font-bold text-[#000000]/70 group-hover:text-[#000000] uppercase tracking-tight">
                    {node.title}
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-[#000000]/20 group-hover:text-[#FFC403]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
