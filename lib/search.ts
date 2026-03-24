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
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const expanded = new Set(terms);
  for (const term of terms) {
    if (SYNONYM_MAP[term]) {
      for (const syn of SYNONYM_MAP[term]) {
        expanded.add(syn);
      }
    }
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (synonyms.some(s => s.includes(term) || term.includes(s))) {
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
  return scored.slice(0, count).filter(s => s.score > 0).map(s => s.section);
}
