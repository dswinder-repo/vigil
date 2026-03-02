import { useState } from 'react';
import { useDashboardStore } from '@/stores/dashboard-store';
import type { NormalizedEvent } from '@/lib/types';

export function useAIAnalysis(event: NormalizedEvent) {
  const aiApiKey = useDashboardStore((s) => s.aiApiKey);
  const aiProvider = useDashboardStore((s) => s.aiProvider);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!aiApiKey || !aiProvider) return;
    setLoading(true);
    setError(null);
    try {
      const prompt = `Analyze this event and provide a brief intelligence assessment (2-3 sentences): Title: ${event.title}. Summary: ${event.summary}. Category: ${event.category}. Severity: ${event.severity}/5. Timestamp: ${event.timestamp}.`;

      let text: string;
      if (aiProvider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
        const data = await res.json() as { choices: Array<{ message: { content: string } }> };
        text = data.choices[0].message.content;
      } else {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
        const data = await res.json() as { content: Array<{ text: string }> };
        text = data.content[0].text;
      }
      setAnalysis(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return { loading, analysis, error, analyze };
}
