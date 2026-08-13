import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme, Textarea, Group, Button, Text, Select, Box } from '@mantine/core';
import { IconSparkles, IconBolt } from '@tabler/icons-react';
import '@mantine/core/styles.css';
import './glass.css';
import { attachSpecularTracking } from './specular.js';
import { attachLiquidGlass } from './liquidGlass.js';

attachSpecularTracking();
attachLiquidGlass();

const theme = createTheme({ primaryColor: 'blue' });

function QuickCapture() {
  const [content, setContent] = useState('');
  const [correction, setCorrection] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ id: string; title: string }[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    window.api.getActiveTask().then(({ task, recent }) => {
      setActiveLabel(task ? task.title : null);
      setTaskId(task?.id ?? recent[0]?.id ?? null);
      setRecent(recent.map((t) => ({ id: t.id, title: t.title })));
    });
  }, []);

  const submit = async () => {
    if (!content.trim()) return;
    await window.api.quickCapture({ content: content.trim(), taskId: taskId ?? undefined, correction });
    await window.api.closeQuickCapture();
  };

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Box style={{ height: '100vh', background: 'transparent' }}>
        <Box
          className="pop"
          style={{
            width: '100%', height: '100%', padding: '12px 16px 14px',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <Group justify="space-between" mb={8}>
            <Group gap={8} style={{ minWidth: 0 }}>
              {correction
                ? <IconBolt size={15} color="var(--amber)" style={{ flexShrink: 0 }} />
                : <IconSparkles size={15} color="var(--accent)" style={{ flexShrink: 0 }} />}
              <Text size="sm" fw={600}>Quick thought</Text>
              <Text size="xs" lineClamp={1} style={{ color: 'var(--ink-3)', minWidth: 0 }}>
                {activeLabel ?? recent.find(r => r.id === taskId)?.title ?? 'No task selected'}
              </Text>
            </Group>
            {/* Segmented control — Idea / Correction */}
            <Group
              gap={2} p={2}
              style={{
                borderRadius: 'var(--r-pill)',
                background: 'rgba(255,255,255,.06)',
                flexShrink: 0,
              }}
            >
              {([{ label: 'Idea', value: false }, { label: 'Correction', value: true }] as const).map((opt) => {
                const on = correction === opt.value;
                return (
                  <Box
                    key={opt.label}
                    px={10} py={3}
                    onClick={() => setCorrection(opt.value)}
                    style={{
                      borderRadius: 'var(--r-pill)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: on ? 600 : 400,
                      color: on ? (opt.value ? 'var(--amber)' : 'var(--accent)') : 'var(--ink-3)',
                      background: on ? 'rgba(255,255,255,.09)' : 'transparent',
                      transition: 'all .18s var(--ease)',
                    }}
                  >
                    {opt.label}
                  </Box>
                );
              })}
            </Group>
          </Group>

          <Box style={{ flex: 1, minHeight: 0 }}>
            <Textarea
              ref={ref}
              variant="unstyled"
              placeholder="Drop the thought here…"
              value={content}
              onChange={(e) => setContent(e.currentTarget.value)}
              autosize minRows={2} maxRows={6}
              styles={{ input: { fontSize: 16, lineHeight: 1.5, color: 'var(--ink-1)' } }}
              onKeyDown={async (e) => {
                if (e.key === 'Escape') await window.api.closeQuickCapture();
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCorrection(true); await submit(); }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await submit(); }
              }}
            />
          </Box>

          <Group justify="space-between" mt={10}>
            {recent.length > 0 ? (
              <Select
                size="xs" radius={10}
                variant="unstyled"
                data={recent.map((t) => ({ value: t.id, label: t.title }))}
                value={taskId} onChange={setTaskId}
                searchable allowDeselect={false}
                w={260}
                styles={{ input: { color: 'var(--ink-2)', fontSize: 12, paddingLeft: 2 } }}
              />
            ) : <span />}
            <Group gap={8} align="center">
              <Text size="xs" className="mono" style={{ color: 'var(--ink-3)' }}>⌘↵ correction</Text>
              <Button className="glass-btn" size="xs" radius={10} variant="subtle" onClick={() => window.api.closeQuickCapture()}>Cancel</Button>
              <Button
                size="xs" radius={10}
                className="accent-btn"
                style={correction ? { background: 'var(--amber)', color: '#1a1206', borderColor: 'rgba(255,255,255,.3)' } : undefined}
                onClick={submit} disabled={!content.trim()}
              >
                {correction ? 'Queue correction' : 'Save idea'}
              </Button>
            </Group>
          </Group>
        </Box>
      </Box>
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')!).render(<QuickCapture />);
