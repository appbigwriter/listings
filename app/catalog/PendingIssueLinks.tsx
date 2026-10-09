'use client';

import { useEffect } from 'react';

const targetFor = (field: string) => {
  if (['kind', 'eligibility'].includes(field)) return 'eligibility';
  if (['category', 'product_type', 'schema'].includes(field)) return 'classification';
  if (['images', 'media'].includes(field)) return 'media';
  if (['description', 'title', 'bullets', 'keywords'].includes(field)) return 'copy';
  if (field === 'source') return 'source';
  return 'facts';
};

export default function PendingIssueLinks() {
  useEffect(() => {
    const apply = () => {
      const sections = [...document.querySelectorAll<HTMLElement>('main section.card')];
      const byTarget: Record<string, HTMLElement | undefined> = {
        eligibility: sections[1], classification: sections[1], copy: sections[2], facts: sections[4], media: sections[sections.length - 2], source: sections[6],
      };
      Object.entries(byTarget).forEach(([id, section]) => { if (section && !section.id) section.id = id; });
      document.querySelectorAll<HTMLElement>('main .border-l-4').forEach(card => {
        if (card.querySelector('[data-pending-link]')) return;
        const field = card.querySelector('strong')?.textContent?.split(':')[0]?.trim() || '';
        const id = targetFor(field);
        const link = document.createElement('a');
        link.href = `#${id}`; link.dataset.pendingLink = 'true'; link.textContent = 'Abrir correção →';
        link.className = 'mt-2 inline-block font-semibold text-blue-700 underline';
        card.appendChild(link);
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
