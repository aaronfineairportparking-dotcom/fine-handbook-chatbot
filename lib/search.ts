import { HandbookNode } from './handbook';

export type HandbookSection = {
  title: string;
  path: string;
  content: string;
};

const SYNONYM_MAP: Record<string, string[]> = {
  fired: ['termination', 'terminate', 'terminated', 'dismissal'],
  quit: ['resignation', 'resign', 'voluntary termination'],
  pto: ['paid time off', 'vacation', 'leave', 'time off', 'personal day'],
  hurt: ['injury', 'workers comp', 'accident', 'incident'],
  pay: ['compensation', 'wages', 'salary', 'payroll', 'paycheck'],
  schedule: ['shift', 'hours', 'work hours', 'overtime'],
  benefits: ['insurance', 'health', 'dental', 'vision', '401k'],
  dress: ['uniform', 'appearance', 'dress code', 'attire'],
  phone: ['cell phone', 'mobile', 'personal device', 'electronic'],
  drug: ['substance', 'alcohol', 'marijuana', 'testing', 'screening'],
  harassment: ['sexual harassment', 'hostile', 'discrimination', 'complaint'],
  parking: ['vehicle', 'lot', 'garage', 'valet'],
  training: ['orientation', 'onboarding', 'introductory'],
  discipline: ['corrective action', 'warning', 'write up', 'writeup'],
  break: ['meal', 'lunch', 'rest period'],
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'its', 'let', 'say', 'she', 'him', 'his', 'her', 'they',
  'them', 'their', 'our', 'we', 'you', 'your', 'he', 'it', 'get',
  'make', 'like', 'know', 'take', 'come', 'think', 'look', 'want',
  'give', 'use', 'find', 'tell', 'ask', 'work', 'seem', 'feel',
  'try', 'leave', 'call', 'got', 'also', 'much', 'many',
]);

export function flattenToSections(nodes: HandbookNode[], pathParts: string[] = []): HandbookSection[] {
  const result: HandbookSection[] = [];
  for (const node of nodes) {
    const currentPath = [...pathParts, node.title];
    if (node.content) {
      result.push({
        title: node.title,
        path: currentPath.join(' > '),
        content: node.content,
      });
    }
    if (node.children) {
      result.push(...flattenToSections(node.children, currentPath));
    }
  }
  return result;
}

function expandQueryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  const expanded = new Set(terms);

  for (const term of terms) {
    // Forward lookup: term is a key in the synonym map
    if (SYNONYM_MAP[term]) {
      for (const syn of SYNONYM_MAP[term]) {
        expanded.add(syn);
      }
    }
    // Reverse lookup: term exactly matches a synonym value
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (synonyms.includes(term)) {
        expanded.add(key);
        for (const syn of synonyms) {
          expanded.add(syn);
        }
      }
    }
  }

  return [...expanded];
}

export function findRelevantSections(query: string, sections: HandbookSection[]): HandbookSection[] {
  const terms = expandQueryTerms(query);
  const scored = sections.map(section => {
    const titleLower = section.title.toLowerCase();
    const contentLower = section.content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (titleLower.includes(term)) score += 3;
      if (contentLower.includes(term)) score += 1;
    }
    return { section, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  const count = topScore < 2 ? 8 : 5;
  const results = scored.slice(0, count).filter(s => s.score > 0).map(s => s.section);

  // Fallback: if no sections matched, return the first 3 sections as general context
  if (results.length === 0) {
    return sections.slice(0, 3);
  }

  return results;
}
