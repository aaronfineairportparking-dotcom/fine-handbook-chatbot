export interface HandbookNode {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  content?: string;
  children?: HandbookNode[];
}

import { section1 } from './data/section1';
import { section2 } from './data/section2';
import { section3 } from './data/section3';
import { section4 } from './data/section4';
import { section5_part1 } from './data/section5_part1';
import { section5_part2 } from './data/section5_part2';
import { section5_part3 } from './data/section5_part3';

export const fallbackHandbookTree: HandbookNode[] = [
  section1,
  section2,
  section3,
  section4,
  section5_part1,
  section5_part2,
  section5_part3
];

export function flattenHandbook(nodes: HandbookNode[], path: string[] = []): { path: string, content: string }[] {
  let result: { path: string, content: string }[] = [];
  for (const node of nodes) {
    const currentPath = [...path, node.title];
    if (node.content) {
      result.push({ path: currentPath.join(' > '), content: node.content });
    }
    if (node.children) {
      result = result.concat(flattenHandbook(node.children, currentPath));
    }
  }
  return result;
}
