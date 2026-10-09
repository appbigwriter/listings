'use client';

import { useEffect } from 'react';

const targetFor = (field: string) => {
  if (['kind', 'eligibility', 'category', 'product_type'].includes(field)) return 'classification';
  if (field === 'schema') return 'schema';
  if (['description', 'title', 'bullets', 'keywords', 'copy'].includes(field)) return 'copy';
  if (field === 'source') return 'source';
  return 'facts';
};

export default function PendingIssueLinks() {
  useEffect(() => {
    const apply = () => {
      if (!document.getElementById('classification')) return;
      document.querySelectorAll<HTMLElement>('main .border-l-4').forEach(card => {
        if (card.querySelector('[data-pending-link]')) return;
        const field = card.querySelector('strong')?.textContent?.split(':')[0]?.trim() || '';
        const id = targetFor(field);
        if (!document.getElementById(id)) return;
        const link = document.createElement('a');
        link.href = `#${id}`; link.dataset.pendingLink = 'true'; link.textContent = 'Abrir correção →';
        link.className = 'mt-2 inline-block font-semibold text-blue-700 underline';
        link.addEventListener('click', event => {
          const exact = document.querySelector<HTMLElement>(`#${id} [data-field="${CSS.escape(field)}"]`);
          if (exact) { event.preventDefault(); exact.scrollIntoView({ behavior: 'smooth', block: 'center' }); exact.focus({ preventScroll: true }); }
        });
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
