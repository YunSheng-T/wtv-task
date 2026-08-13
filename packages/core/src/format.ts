import type { Idea } from './types.js';

export function formatCorrectionsAsMessage(items: Idea[]): { role: 'user'; content: string } | null {
  if (items.length === 0) return null;
  const lines = items.map((it, i) => `${i + 1}. ${it.content.trim()}`).join('\n');
  return {
    role: 'user',
    content: `[待纠正项] 请在继续前逐条处理以下设计纠正，并在完成后说明对应处理方式：\n${lines}`,
  };
}
