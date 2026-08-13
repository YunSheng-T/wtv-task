import { useState } from 'react';
import {
  Box, Button, Group, Stack, Text, Textarea, ActionIcon, Tooltip,
  Select, TextInput, Divider, ScrollArea,
} from '@mantine/core';
import { IconCheck, IconX, IconArrowRight, IconPlugConnected, IconTrash, IconClock } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Idea, TaskStatus } from '@wtv-task/core';

const COLUMNS: { key: Idea['status']; label: string; color: string }[] = [
  { key: 'captured', label: 'Captured', color: '#cbd5e1' },
  { key: 'confirmed', label: 'To inject', color: 'var(--amber)' },
  { key: 'injected', label: 'Injected', color: 'var(--cyan)' },
  { key: 'resolved', label: 'Resolved', color: 'var(--green)' },
];

export function TaskDetail({ taskId }: { taskId: string }) {
  const client = useQueryClient();
  const { data: task } = useQuery({ queryKey: ['task', taskId], queryFn: () => window.api.getTask(taskId) });
  const { data: ideas = [] } = useQuery({ queryKey: ['ideas', taskId], queryFn: () => window.api.listIdeas(taskId) });
  const { data: events = [] } = useQuery({ queryKey: ['events', taskId], queryFn: () => window.api.listEvents(taskId) });
  const [newIdea, setNewIdea] = useState('');

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['ideas', taskId] });
    client.invalidateQueries({ queryKey: ['task', taskId] });
    client.invalidateQueries({ queryKey: ['events', taskId] });
  };

  const createIdea = useMutation({
    mutationFn: (correction: boolean) =>
      window.api.createIdea({
        taskId, content: newIdea,
        kind: correction ? 'correction' : 'idea',
        status: correction ? 'confirmed' : 'captured',
      }),
    onSuccess: () => { setNewIdea(''); invalidate(); },
  });

  if (!task) return null;
  const unresolved = ideas.filter((i) => ['captured', 'confirmed', 'injected'].includes(i.status)).length;

  return (
    <Stack gap={14} className="rise">
      <Box>
        <Group gap={8} mb={6}>
          <Text className="display" size="lg" style={{ flex: 1 }}>{task.title}</Text>
          {unresolved > 0 && (
            <Text size="xs" style={{ color: 'var(--ink-3)' }}>{unresolved} open</Text>
          )}
        </Group>
        {task.goal && (
          <Text size="sm" mt={2} style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>{task.goal}</Text>
        )}
      </Box>

      <MountControls taskId={task.id} status={task.status} session={task.agentSession} onChanged={invalidate} />

      <Box>
        <Textarea
          autosize minRows={2}
          placeholder="Capture a thought or design correction…"
          value={newIdea}
          onChange={(e) => setNewIdea(e.currentTarget.value)}
          className="glass-input"
          radius="md"
          styles={{ input: { fontSize: 14, lineHeight: 1.5 } }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); createIdea.mutate(true); }
          }}
        />
        <Group justify="space-between" mt={8}>
          <Text size="xs" style={{ color: 'var(--ink-3)' }}><span className="mono">⌘↵</span> queues as correction</Text>
          <Group gap={7}>
            <Button className="glass-btn" size="xs" radius={10} variant="subtle" onClick={() => createIdea.mutate(false)} disabled={!newIdea.trim()}>Idea</Button>
            <Button className="accent-btn" size="xs" radius={10} onClick={() => createIdea.mutate(true)} disabled={!newIdea.trim()}>Correction</Button>
          </Group>
        </Group>
      </Box>

      <Stack gap={11}>
        {COLUMNS.map((col) => {
          const items = ideas.filter((i) => i.status === col.key);
          if (items.length === 0) return null;
          return (
            <Box key={col.key}>
              <Group gap={7} mb={7}>
                <span className="dot" style={{ color: col.color, background: col.color }} />
                <Text className="eyebrow">{col.label}</Text>
                <Text size="xs" className="mono" style={{ color: 'var(--ink-3)' }}>{items.length}</Text>
              </Group>
              <Stack gap={6}>
                {items.map((idea, i) => (
                  <IdeaCard key={idea.id} idea={idea} color={col.color} onChanged={invalidate} index={i} />
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {events.length > 0 && (
        <>
          <Divider color="var(--hairline)" />
          <Box>
            <Group gap={6} mb={7}><IconClock size={13} color="var(--ink-3)" /><Text className="eyebrow">Recent activity</Text></Group>
            <ScrollArea h={108} type="hover">
              <Stack gap={3}>
                {events.slice(0, 24).map((e) => (
                  <Group key={e.id} gap={9} wrap="nowrap">
                    <Text size="xs" className="mono" style={{ color: 'var(--ink-3)', minWidth: 52 }}>
                      {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <span className="badge-glass" style={{ color: 'var(--ink-2)' }}>{e.type.replace('_', ' ')}</span>
                  </Group>
                ))}
              </Stack>
            </ScrollArea>
          </Box>
        </>
      )}
    </Stack>
  );
}

function IdeaCard({ idea, color, onChanged, index }: { idea: Idea; color: string; onChanged: () => void; index: number }) {
  const confirm = useMutation({ mutationFn: () => window.api.confirmIdea(idea.id), onSuccess: onChanged });
  const injected = useMutation({ mutationFn: () => window.api.markIdeaInjected(idea.id), onSuccess: onChanged });
  const resolve = useMutation({ mutationFn: () => window.api.resolveIdea(idea.id), onSuccess: onChanged });
  const dismiss = useMutation({ mutationFn: () => window.api.dismissIdea(idea.id), onSuccess: onChanged });

  return (
    <Box
      className="row rise"
      px={12} py={8}
      style={{ animationDelay: `${index * 28}ms` }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap={8}>
        <Group gap={9} wrap="nowrap" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          <span className="dot" style={{ color, background: color, boxShadow: 'none', flexShrink: 0, marginTop: 6 }} />
          <Text size="sm" style={{ flex: 1, lineHeight: 1.45, color: 'var(--ink-1)' }}>{idea.content}</Text>
        </Group>
        <Group gap={2} wrap="nowrap">
          {idea.status === 'captured' && (
            <>
              <Tooltip label="Queue for injection" withinPortal><ActionIcon size="sm" color="gray" variant="subtle" radius={10} onClick={() => confirm.mutate()}><IconArrowRight size={14} /></ActionIcon></Tooltip>
              <Tooltip label="Dismiss" withinPortal><ActionIcon size="sm" color="gray" variant="subtle" radius={10} onClick={() => dismiss.mutate()}><IconX size={13} /></ActionIcon></Tooltip>
            </>
          )}
          {idea.status === 'confirmed' && (
            <Tooltip label="Mark injected" withinPortal><ActionIcon size="sm" color="gray" variant="subtle" radius={10} onClick={() => injected.mutate()}><IconCheck size={14} /></ActionIcon></Tooltip>
          )}
          {idea.status === 'injected' && (
            <Tooltip label="Resolve" withinPortal><ActionIcon size="sm" color="gray" variant="subtle" radius={10} onClick={() => resolve.mutate()}><IconCheck size={14} /></ActionIcon></Tooltip>
          )}
          {idea.status !== 'resolved' && idea.status !== 'dismissed' && (
            <Tooltip label="Dismiss" withinPortal><ActionIcon size="sm" color="gray" variant="subtle" radius={10} onClick={() => dismiss.mutate()}><IconTrash size={12} /></ActionIcon></Tooltip>
          )}
        </Group>
      </Group>
    </Box>
  );
}

function MountControls({ taskId, status, session, onChanged }: {
  taskId: string; status: TaskStatus; session: { sessionId: string } | null; onChanged: () => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [agentType, setAgentType] = useState('cline');
  const mount = useMutation({
    mutationFn: () => window.api.mountSession(taskId, { sessionId, agentType, harnessName: 'wtv-app' }),
    onSuccess: () => { setSessionId(''); onChanged(); },
  });
  const unmount = useMutation({ mutationFn: () => window.api.unmountSession(taskId), onSuccess: onChanged });
  const complete = useMutation({
    mutationFn: () => window.api.completeTask(taskId, false).catch((err) => {
      if (String(err).includes('unresolved') && confirm('There are unresolved corrections. Complete anyway?')) {
        return window.api.completeTask(taskId, true);
      }
      throw err;
    }),
    onSuccess: onChanged,
  });

  if (session) {
    return (
      <Box px={12} py={10} style={{ borderRadius: 'var(--r-md)', background: 'rgba(255,255,255,.045)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Group gap={9}>
          <span className="dot pulse" style={{ color: 'var(--accent)', background: 'var(--accent)' }} />
          <Box>
            <Text size="xs" fw={600}>Agent mounted</Text>
            <Text size="xs" className="mono" style={{ color: 'var(--ink-3)' }}>{session.sessionId}</Text>
          </Box>
        </Group>
        <Group gap={6}>
          <Button className="accent-btn" size="xs" radius={10} onClick={() => complete.mutate()}>Complete</Button>
          <Button className="glass-btn" size="xs" radius={10} variant="subtle" onClick={() => unmount.mutate()}>Unmount</Button>
        </Group>
      </Box>
    );
  }

  return (
    <Box>
      <Group gap={7} mb={8}><IconPlugConnected size={13} color="var(--ink-3)" /><Text className="eyebrow">Mount agent session</Text></Group>
      <Group gap={8} wrap="nowrap">
        <TextInput size="xs" placeholder="session-id" style={{ flex: 1 }} value={sessionId} onChange={(e) => setSessionId(e.currentTarget.value)} className="glass-input" radius="md" />
        <Select
          size="xs" radius="md" w={96}
          data={['cline', 'pi', 'codex', 'other']}
          value={agentType} onChange={(v) => v && setAgentType(v)} allowDeselect={false}
          className="glass-input"
          styles={{ input: { background: 'transparent', border: 'none' } }}
        />
        <Button className="accent-btn" size="xs" radius={10} onClick={() => mount.mutate()} disabled={!sessionId.trim()}>
          Mount
        </Button>
      </Group>
    </Box>
  );
}
